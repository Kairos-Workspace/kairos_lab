export type TokenKind = 'ident' | 'number' | 'string' | 'keyword' | 'punct' | 'op' | 'eof'

export interface Token {
  kind: TokenKind
  value: string
  line: number
  column: number
  length: number
}

export class LexError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly column: number,
    readonly length = 1
  ) {
    super(message)
  }
}

const KEYWORDS = new Set([
  'void',
  'int',
  'double',
  'bool',
  'input',
  'if',
  'else',
  'return',
  'true',
  'false'
])

const isIdentStart = (char: string): boolean => /[A-Za-z_]/.test(char)
const isIdentPart = (char: string): boolean => /[A-Za-z0-9_]/.test(char)
const isDigit = (char: string): boolean => char >= '0' && char <= '9'

export function lex(source: string): Token[] {
  const tokens: Token[] = []
  let offset = 0
  let line = 1
  let column = 1

  const current = (): string => source[offset] ?? ''
  const peek = (distance = 1): string => source[offset + distance] ?? ''
  const advance = (): string => {
    const char = current()
    offset += 1
    if (char === '\n') {
      line += 1
      column = 1
    } else {
      column += 1
    }
    return char
  }
  const add = (
    kind: TokenKind,
    value: string,
    startLine: number,
    startColumn: number,
    length: number
  ): void => {
    tokens.push({ kind, value, line: startLine, column: startColumn, length })
  }

  while (offset < source.length) {
    const char = current()

    if (/\s/.test(char)) {
      advance()
      continue
    }

    if (char === '/' && peek() === '/') {
      advance()
      advance()
      while (offset < source.length && current() !== '\n') advance()
      continue
    }

    if (char === '/' && peek() === '*') {
      const startLine = line
      const startColumn = column
      advance()
      advance()
      while (offset < source.length && !(current() === '*' && peek() === '/')) advance()
      if (offset >= source.length) {
        throw new LexError('Unterminated block comment', startLine, startColumn, 2)
      }
      advance()
      advance()
      continue
    }

    const startOffset = offset
    const startLine = line
    const startColumn = column

    if (isIdentStart(char)) {
      advance()
      while (isIdentPart(current())) advance()
      const value = source.slice(startOffset, offset)
      add(KEYWORDS.has(value) ? 'keyword' : 'ident', value, startLine, startColumn, value.length)
      continue
    }

    if (isDigit(char) || (char === '.' && isDigit(peek()))) {
      if (char === '.') {
        advance()
        while (isDigit(current())) advance()
      } else {
        while (isDigit(current())) advance()
        if (current() === '.') {
          advance()
          while (isDigit(current())) advance()
        }
      }
      const value = source.slice(startOffset, offset)
      add('number', value, startLine, startColumn, value.length)
      continue
    }

    if (char === '"') {
      advance()
      let value = ''
      while (offset < source.length && current() !== '"') {
        if (current() === '\n' || current() === '\r') {
          throw new LexError('Unterminated string literal', startLine, startColumn)
        }
        if (current() === '\\') {
          advance()
          if (offset >= source.length) break
          const escaped = advance()
          value += escaped === 'n' ? '\n' : escaped === 'r' ? '\r' : escaped === 't' ? '\t' : escaped
        } else {
          value += advance()
        }
      }
      if (current() !== '"') {
        throw new LexError('Unterminated string literal', startLine, startColumn)
      }
      advance()
      add('string', value, startLine, startColumn, offset - startOffset)
      continue
    }

    const pair = char + peek()
    if (['||', '&&', '<=', '>=', '==', '!='].includes(pair)) {
      advance()
      advance()
      add('op', pair, startLine, startColumn, 2)
      continue
    }

    if ('+-*/!<>'.includes(char)) {
      advance()
      add('op', char, startLine, startColumn, 1)
      continue
    }

    if (';,(){}[]='.includes(char)) {
      advance()
      add('punct', char, startLine, startColumn, 1)
      continue
    }

    throw new LexError(`Unexpected character '${char}'`, line, column)
  }

  tokens.push({ kind: 'eof', value: '', line, column, length: 0 })
  return tokens
}
