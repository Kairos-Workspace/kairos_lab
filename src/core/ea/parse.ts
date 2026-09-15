import type {
  BinaryOp,
  Expr,
  FunctionDecl,
  InputDecl,
  Program,
  Span,
  Stmt,
  VarDecl
} from './ast'
import { lex, LexError, type Token } from './lex'
import type { Diagnostic } from './types'

export type ParseResult =
  | { ok: true; program: Program }
  | { ok: false; diagnostics: Diagnostic[] }

class ParseError extends Error {
  constructor(
    message: string,
    readonly token: Token
  ) {
    super(message)
  }
}

const TYPES = new Set(['int', 'double', 'bool'])
const SERIES = new Set(['open', 'high', 'low', 'close', 'time'])

class Parser {
  private position = 0
  private callSiteId = 0

  constructor(private readonly tokens: Token[]) {}

  parseProgram(): Program {
    const program: Program = { inputs: [], globals: [], onInit: null, onTick: null }

    while (!this.at('eof')) {
      if (this.atValue('input')) {
        program.inputs.push(this.parseInput())
      } else if (this.atType()) {
        program.globals.push(this.parseVarDecl())
      } else if (this.atValue('void')) {
        const fn = this.parseFunction()
        if (fn.name === 'OnInit') {
          if (program.onInit) this.fail('Duplicate OnInit declaration')
          program.onInit = fn
        } else {
          if (program.onTick) this.fail('Duplicate OnTick declaration')
          program.onTick = fn
        }
      } else {
        this.fail(`Unexpected token '${this.current().value}' at top level`)
      }
    }

    return program
  }

  private parseInput(): InputDecl {
    const start = this.consumeValue('input')
    const type = this.consumeType()
    const name = this.consumeKind('ident', 'Expected input name')
    this.consumeValue('=')

    let defaultValue: number | boolean
    if (this.matchValue('true')) {
      defaultValue = true
    } else if (this.matchValue('false')) {
      defaultValue = false
    } else {
      const sign = this.matchValue('-') ? -1 : 1
      const number = this.consumeKind('number', 'Expected a literal input default')
      defaultValue = sign * Number(number.value)
    }

    this.consumeValue(';')
    return { kind: 'input', name: name.value, type, defaultValue, span: this.span(start) }
  }

  private parseVarDecl(): VarDecl {
    const start = this.current()
    const type = this.consumeType()
    const name = this.consumeKind('ident', 'Expected variable name')
    const init = this.matchValue('=') ? this.parseExpression() : null
    this.consumeValue(';')
    return { kind: 'var', name: name.value, type, init, span: this.span(start) }
  }

  private parseFunction(): FunctionDecl {
    const start = this.consumeValue('void')
    const name = this.consumeKind('ident', 'Expected function name')
    if (name.value !== 'OnInit' && name.value !== 'OnTick') {
      throw new ParseError(`Unsupported function '${name.value}'`, name)
    }
    this.consumeValue('(')
    this.consumeValue(')')
    const body = this.parseBlock()
    return { name: name.value, body, span: this.span(start) }
  }

  private parseBlock(): Stmt[] {
    this.consumeValue('{')
    const statements: Stmt[] = []
    while (!this.atValue('}')) {
      if (this.at('eof')) this.fail("Expected '}'")
      statements.push(this.parseStatement())
    }
    this.advance()
    return statements
  }

  private parseStatement(): Stmt {
    if (this.atType()) return this.parseVarDecl()
    if (this.atValue('if')) return this.parseIf()
    if (this.atValue('return')) return this.parseReturn()

    if (this.at('ident') && this.peek().value === '=') {
      const name = this.advance()
      this.advance()
      const value = this.parseExpression()
      this.consumeValue(';')
      return { kind: 'assign', name: name.value, value, span: this.span(name) }
    }

    const expr = this.parseExpression()
    this.consumeValue(';')
    return { kind: 'expr', expr, span: expr.span }
  }

  private parseIf(): Stmt {
    const start = this.consumeValue('if')
    this.consumeValue('(')
    const test = this.parseExpression()
    this.consumeValue(')')
    const consequent = this.atValue('{') ? this.parseBlock() : [this.parseStatement()]
    const alternate = this.matchValue('else')
      ? this.atValue('{')
        ? this.parseBlock()
        : [this.parseStatement()]
      : null
    return { kind: 'if', test, consequent, alternate, span: this.span(start) }
  }

  private parseReturn(): Stmt {
    const start = this.consumeValue('return')
    this.consumeValue(';')
    return { kind: 'return', span: this.span(start) }
  }

  private parseExpression(): Expr {
    return this.parseBinary(0)
  }

  private parseBinary(minPrecedence: number): Expr {
    let left = this.parseUnary()
    const precedence: Record<string, number> = {
      '||': 1,
      '&&': 2,
      '<': 3,
      '<=': 3,
      '>': 3,
      '>=': 3,
      '==': 3,
      '!=': 3,
      '+': 4,
      '-': 4,
      '*': 5,
      '/': 5
    }

    while ((precedence[this.current().value] ?? -1) >= minPrecedence) {
      const operator = this.advance()
      const right = this.parseBinary(precedence[operator.value] + 1)
      left = {
        kind: 'binary',
        op: operator.value as BinaryOp,
        left,
        right,
        span: left.span
      }
    }
    return left
  }

  private parseUnary(): Expr {
    if (this.atValue('-') || this.atValue('!')) {
      const operator = this.advance()
      return {
        kind: 'unary',
        op: operator.value as '-' | '!',
        arg: this.parseUnary(),
        span: this.span(operator)
      }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): Expr {
    const token = this.current()

    if (this.matchKind('number')) {
      return { kind: 'number', value: Number(token.value), span: this.span(token) }
    }
    if (this.matchValue('true') || this.matchValue('false')) {
      return { kind: 'bool', value: token.value === 'true', span: this.span(token) }
    }
    if (this.matchKind('string')) {
      return { kind: 'string', value: token.value, span: this.span(token) }
    }
    if (this.matchValue('(')) {
      const expression = this.parseExpression()
      this.consumeValue(')')
      return expression
    }
    if (this.matchKind('ident')) {
      if (this.matchValue('(')) {
        const callSiteId = this.callSiteId++
        const args: Expr[] = []
        if (!this.atValue(')')) {
          do {
            args.push(this.parseExpression())
          } while (this.matchValue(','))
        }
        this.consumeValue(')')
        return {
          kind: 'call',
          callee: token.value,
          args,
          span: this.span(token),
          callSiteId
        }
      }
      if (SERIES.has(token.value) && this.matchValue('[')) {
        const index = this.parseExpression()
        this.consumeValue(']')
        return {
          kind: 'series',
          series: token.value as 'open' | 'high' | 'low' | 'close' | 'time',
          index,
          span: this.span(token)
        }
      }
      return { kind: 'ident', name: token.value, span: this.span(token) }
    }

    this.fail('Expected expression')
  }

  private consumeType(): 'int' | 'double' | 'bool' {
    const token = this.current()
    if (!this.atType()) this.fail('Expected type')
    this.advance()
    return token.value as 'int' | 'double' | 'bool'
  }

  private atType(): boolean {
    return this.current().kind === 'keyword' && TYPES.has(this.current().value)
  }

  private consumeKind(kind: Token['kind'], message: string): Token {
    if (!this.at(kind)) this.fail(message)
    return this.advance()
  }

  private consumeValue(value: string): Token {
    if (!this.atValue(value)) this.fail(`Expected '${value}'`)
    return this.advance()
  }

  private matchKind(kind: Token['kind']): boolean {
    if (!this.at(kind)) return false
    this.advance()
    return true
  }

  private matchValue(value: string): boolean {
    if (!this.atValue(value)) return false
    this.advance()
    return true
  }

  private at(kind: Token['kind']): boolean {
    return this.current().kind === kind
  }

  private atValue(value: string): boolean {
    return this.current().value === value
  }

  private current(): Token {
    return this.tokens[this.position]
  }

  private peek(): Token {
    return this.tokens[Math.min(this.position + 1, this.tokens.length - 1)]
  }

  private advance(): Token {
    const token = this.current()
    if (token.kind !== 'eof') this.position += 1
    return token
  }

  private span(token: Token): Span {
    return { line: token.line, column: token.column, length: token.length }
  }

  private fail(message: string): never {
    throw new ParseError(message, this.current())
  }
}

export function parseEaScript(source: string): ParseResult {
  try {
    return { ok: true, program: new Parser(lex(source)).parseProgram() }
  } catch (error) {
    if (error instanceof ParseError) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            message: error.message,
            line: error.token.line,
            column: error.token.column,
            length: error.token.length || 1
          }
        ]
      }
    }
    if (error instanceof LexError) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            message: error.message,
            line: error.line,
            column: error.column,
            length: error.length
          }
        ]
      }
    }
    throw error
  }
}
