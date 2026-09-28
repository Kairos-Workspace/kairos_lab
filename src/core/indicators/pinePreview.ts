import type { Candle } from '@shared/types'

export type PinePreviewPane = 'overlay' | 'oscillator'

export interface PinePreviewLine {
  id: string
  title: string
  color: string
  pane: PinePreviewPane
  hidden?: boolean
  points: { timestamp: number; value: number }[]
}

export interface PinePreviewFill {
  timestamp: number
  until?: number
  top: number
  bottom: number
  color: string
}

export interface PinePreviewShape {
  timestamp: number
  price: number
  position: 'aboveBar' | 'belowBar'
  color: string
  text?: string
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square'
}

export interface PinePreviewResult {
  title: string
  overlay: boolean
  lines: PinePreviewLine[]
  fills: PinePreviewFill[]
  shapes: PinePreviewShape[]
  diagnostics: PineDiagnostic[]
  unsupported: boolean
}

export interface PineDiagnostic {
  severity: 'error' | 'warning'
  message: string
  line: number
  column: number
  length: number
}

type PineVal =
  | number
  | string
  | boolean
  | null
  | { kind: 'plot'; id: number }
  | { kind: 'color'; hex: string; transp: number }
  | { kind: 'object'; type: string }
  | PineVal[]

type TokKind =
  | 'ident'
  | 'number'
  | 'string'
  | 'color'
  | 'op'
  | 'nl'
  | 'indent'
  | 'dedent'
  | 'eof'

interface Tok {
  kind: TokKind
  value: string
  line: number
  column: number
}

class PineError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly column: number,
    readonly length: number
  ) {
    super(message)
  }
}

interface PlotSlot {
  title: string
  color: string
  hidden: boolean
  values: (number | null)[]
}

const RESERVED_NAMES = new Set([
  'open',
  'high',
  'low',
  'close',
  'volume',
  'time',
  'bar_index',
  'hl2',
  'hlc3',
  'ohlc4',
  'range',
  'na',
  'true',
  'false',
  'and',
  'or',
  'not',
  'if',
  'else',
  'for',
  'to',
  'by',
  'while',
  'switch',
  'var',
  'varip',
  'type',
  'enum',
  'method',
  'export',
  'import',
  'int',
  'float',
  'bool',
  'string',
  'color'
])

const COLORS = ['#2962ff', '#e0a63e', '#5dcec0', '#c9863a']
const NAMED_COLOR: Record<string, string> = {
  green: '#089981',
  red: '#f23645',
  blue: '#2962ff',
  orange: '#ff9800',
  yellow: '#fdd835',
  white: '#ffffff',
  black: '#000000',
  gray: '#787b86',
  aqua: '#00bcd4',
  lime: '#00e676',
  teal: '#009688',
  purple: '#ab47bc',
  fuchsia: '#e040fb',
  maroon: '#880e4f',
  navy: '#311b92',
  olive: '#808000',
  silver: '#b2b5be'
}

const NAMESPACES: Record<string, Record<string, PineVal>> = {
  color: Object.fromEntries(
    Object.entries(NAMED_COLOR).map(([name, hex]) => [name, { kind: 'color', hex, transp: 0 }])
  ),
  display: { none: 'none', all: 'all' },
  location: { belowbar: 'belowBar', abovebar: 'aboveBar', top: 'aboveBar', bottom: 'belowBar', absolute: 'belowBar' },
  shape: {
    triangleup: 'arrowUp',
    triangledown: 'arrowDown',
    arrowup: 'arrowUp',
    arrowdown: 'arrowDown',
    circle: 'circle',
    square: 'square',
    diamond: 'circle',
    cross: 'square',
    xcross: 'square',
    labelup: 'arrowUp',
    labeldown: 'arrowDown',
    flag: 'square'
  },
  size: { auto: 'auto', tiny: 'tiny', small: 'small', normal: 'normal', large: 'large', huge: 'large' },
  hline: { style_solid: 'solid', style_dashed: 'dashed', style_dotted: 'dotted' },
  plot: {
    style_line: 'line',
    style_linebr: 'linebr',
    style_columns: 'columns',
    style_histogram: 'histogram',
    style_cross: 'cross',
    style_circles: 'circles',
    style_area: 'area',
    style_areabr: 'areabr'
  },
  syminfo: {
    ticker: 'XAUUSD',
    tickerid: 'FX:XAUUSD',
    prefix: 'FX',
    currency: 'USD',
    pointvalue: 1,
    mintick: 0.01
  },
  timeframe: {
    period: '60',
    multiplier: 60,
    isintraday: true,
    isdaily: false,
    isweekly: false,
    isminutes: true
  },
  barstate: {
    isfirst: false,
    islast: false,
    ishistory: true,
    isrealtime: false,
    isnew: true,
    isconfirmed: true,
    islastconfirmedhistory: false
  },
  chart: {
    fg_color: { kind: 'color', hex: '#d1d4dc', transp: 0 },
    bg_color: { kind: 'color', hex: '#131722', transp: 0 }
  }
}

export function pineIndicatorTitle(source: string, fallback: string): string {
  const match = source.match(/indicator\s*\(\s*"([^"]+)"/)
  return match?.[1]?.trim() || fallback
}

export function pineIsOverlay(source: string): boolean {
  const match = source.match(/indicator\s*\(([\s\S]*?)\)/)
  if (!match) return true
  return !/\boverlay\s*=\s*false\b/.test(match[1])
}

const PREVIEW_CACHE_LIMIT = 32
const previewCache = new Map<
  string,
  {
    length: number
    first: number
    last: number
    diagnostics: boolean
    result: PinePreviewResult
  }
>()

function rememberPreview(
  source: string,
  length: number,
  first: number,
  last: number,
  diagnostics: boolean,
  result: PinePreviewResult
): void {
  if (previewCache.size >= PREVIEW_CACHE_LIMIT) {
    const oldest = previewCache.keys().next().value
    if (oldest !== undefined) previewCache.delete(oldest)
  }
  previewCache.set(source, { length, first, last, diagnostics, result })
}

export function previewPineScript(
  source: string,
  candles: Candle[],
  fallbackTitle: string,
  options?: { diagnostics?: boolean }
): PinePreviewResult {
  const title = pineIndicatorTitle(source, fallbackTitle)
  const overlay = pineIsOverlay(source)
  const collectDiagnostics = options?.diagnostics !== false
  const empty = (diagnostics: PineDiagnostic[] = []): PinePreviewResult => ({
    title,
    overlay,
    lines: [],
    fills: [],
    shapes: [],
    diagnostics,
    unsupported: diagnostics.some((row) => row.severity === 'error')
  })
  if (candles.length === 0) return empty()
  const first = candles[0].timestamp
  const last = candles[candles.length - 1].timestamp
  const hit = previewCache.get(source)
  if (
    hit &&
    hit.length === candles.length &&
    hit.first === first &&
    hit.last === last &&
    hit.diagnostics === collectDiagnostics
  ) {
    return hit.result
  }
  try {
    const { stmts, diagnostics: parseDiags, declaredFunctions } = parsedStmts(source)
    if (stmts.length === 0 && parseDiags.length > 0) {
      return empty(parseDiags)
    }
    const result = run(stmts, candles, title, overlay, collectDiagnostics, declaredFunctions)
    result.diagnostics = [...parseDiags, ...result.diagnostics]
    if (
      result.diagnostics.some((row) => row.severity === 'error') ||
      (result.lines.filter((l) => !l.hidden).length === 0 && result.shapes.length === 0 && result.diagnostics.length > 0)
    ) {
      result.unsupported = true
    }
    rememberPreview(source, candles.length, first, last, collectDiagnostics, result)
    return result
  } catch (error) {
    if (error instanceof PineError) {
      return empty([
        {
          severity: 'error',
          message: error.message,
          line: error.line,
          column: error.column,
          length: error.length
        }
      ])
    }
    return empty([
      {
        severity: 'error',
        message: error instanceof Error ? error.message : 'Could not parse this Pine Script',
        line: 1,
        column: 1,
        length: 1
      }
    ])
  }
}

export function diagnosePineScript(source: string): PineDiagnostic[] {
  if (!source.trim()) return []
  // Syntax/parse only — do not execute the script (full runs lag on large indicators).
  return parsedStmts(source).diagnostics
}

function lex(source: string): Tok[] {
  const tokens: Tok[] = []
  const indents = [0]
  let i = 0
  let line = 1
  const push = (kind: TokKind, value = '', column = 1): void => {
    tokens.push({ kind, value, line, column })
  }

  while (i < source.length) {
    let indent = 0
    while (i < source.length && (source[i] === ' ' || source[i] === '\t')) {
      indent += source[i] === '\t' ? 4 : 1
      i++
    }
    if (source[i] === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++
    }
    if (i >= source.length) break
    if (source[i] === '\n' || source[i] === '\r') {
      if (source[i] === '\r' && source[i + 1] === '\n') i += 2
      else i++
      line++
      continue
    }

    const current = indents[indents.length - 1]
    if (indent > current) {
      indents.push(indent)
      push('indent', '', 1)
    } else {
      while (indent < indents[indents.length - 1]) {
        indents.pop()
        push('dedent', '', 1)
      }
    }

    let column = indent + 1
    while (i < source.length && source[i] !== '\n' && source[i] !== '\r') {
      const ch = source[i]
      if (ch === ' ' || ch === '\t') {
        i++
        column++
        continue
      }
      if (ch === '/' && source[i + 1] === '/') {
        while (i < source.length && source[i] !== '\n' && source[i] !== '\r') i++
        break
      }
      if (ch === '"' || ch === "'") {
        const startCol = column
        const start = i
        const quote = ch
        i++
        let value = ''
        while (i < source.length && source[i] !== quote) {
          if (source[i] === '\\' && i + 1 < source.length) {
            value += source[i + 1]
            i += 2
            continue
          }
          value += source[i]
          i++
        }
        i++
        push('string', value, startCol)
        column += i - start
        continue
      }
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
        const startCol = column
        const start = i
        i++
        while (i < source.length && /[0-9.]/.test(source[i])) i++
        const value = source.slice(start, i)
        push('number', value, startCol)
        column += value.length
        continue
      }
      if (/[A-Za-z_]/.test(ch)) {
        const startCol = column
        const start = i
        i++
        while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) i++
        const value = source.slice(start, i)
        push('ident', value, startCol)
        column += value.length
        continue
      }
      // TradingView hex color literals: #RRGGBB or #RRGGBBAA
      if (ch === '#' && /[0-9A-Fa-f]/.test(source[i + 1] ?? '')) {
        const startCol = column
        const start = i
        i++
        while (i < source.length && /[0-9A-Fa-f]/.test(source[i])) i++
        const value = source.slice(start, i)
        push('color', value, startCol)
        column += value.length
        continue
      }
      const two = source.slice(i, i + 2)
      if ([':=', '+=', '-=', '*=', '/=', '==', '!=', '<=', '>=', '=>', '++'].includes(two)) {
        push('op', two, column)
        i += 2
        column += 2
        continue
      }
      push('op', ch, column)
      i++
      column++
    }
    push('nl', '', 1)
    if (source[i] === '\r' && source[i + 1] === '\n') i += 2
    else if (source[i] === '\n' || source[i] === '\r') i++
    line++
  }
  while (indents.length > 1) {
    indents.pop()
    push('dedent')
  }
  push('eof')
  return tokens
}

type Stmt =
  | { kind: 'var'; name: string; value: Expr; line: number; column: number; length: number }
  | { kind: 'assign'; name: string; op: '=' | ':=' | '+=' | '-=' | '*=' | '/='; value: Expr; line: number; column: number; length: number }
  | { kind: 'tuple_assign'; names: string[]; value: Expr; line: number; column: number; length: number }
  | { kind: 'expr'; expr: Expr }
  | { kind: 'if'; arms: { cond: Expr | null; body: Stmt[] }[] }
  | { kind: 'func_def'; name: string; params: string[]; body: Stmt[] }

type Expr =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'color'; hex: string; transp: number }
  | { kind: 'list'; items: Expr[] }
  | { kind: 'ident'; name: string; line: number; column: number; length: number }
  | { kind: 'unary'; op: 'not' | '-' | '+'; expr: Expr }
  | { kind: 'binary'; op: string; left: Expr; right: Expr }
  | { kind: 'ternary'; cond: Expr; then: Expr; else: Expr }
  | { kind: 'index'; target: Expr; index: Expr }
  | { kind: 'member'; target: Expr; name: string }
  | { kind: 'call'; callee: Expr; args: Arg[] }
  | { kind: 'switch'; subject: Expr | null; arms: { match: Expr | null; result: Expr }[] }

function parseHexColorLiteral(raw: string): { hex: string; transp: number } {
  const digits = raw.startsWith('#') ? raw.slice(1) : raw
  if (digits.length === 8) {
    const rgb = digits.slice(0, 6).toLowerCase()
    const alpha = Number.parseInt(digits.slice(6, 8), 16)
    const transp = Math.round((1 - alpha / 255) * 100)
    return { hex: `#${rgb}`, transp }
  }
  return { hex: `#${digits.toLowerCase()}`, transp: 0 }
}

interface Arg {
  name?: string
  value: Expr
}

class Parser {
  private i = 0
  public diagnostics: PineDiagnostic[] = []
  public declaredFunctions = new Set<string>()
  constructor(private readonly tokens: Tok[]) {}

  parse(): Stmt[] {
    const body: Stmt[] = []
    while (!this.at('eof')) {
      if (this.at('nl') || this.at('indent') || this.at('dedent')) {
        this.i++
        continue
      }
      try {
        body.push(this.stmt())
      } catch (err) {
        if (err instanceof PineError) {
          this.diagnostics.push({
            severity: 'error',
            message: err.message,
            line: err.line,
            column: err.column,
            length: err.length
          })
          // Recover to next statement on failure so complex scripts don't abort completely
          while (!this.at('eof') && !this.at('nl')) {
            this.i++
          }
          while (this.at('nl') || this.at('indent') || this.at('dedent')) {
            this.i++
          }
        } else {
          throw err
        }
      }
    }
    return body
  }

  private skipBlock(): void {
    this.eatNl()
    if (!this.at('indent')) {
      while (!this.at('nl') && !this.at('eof')) this.i++
      this.eatNl()
      return
    }
    this.i++
    let depth = 1
    while (depth > 0 && !this.at('eof')) {
      if (this.at('indent')) depth++
      else if (this.at('dedent')) depth--
      this.i++
    }
  }

  private eatNlAndIndent(): void {
    while (this.at('nl') || this.at('indent') || this.at('dedent')) this.i++
  }

  private isContinuationOp(ops: string[]): boolean {
    let peek = this.i
    while (peek < this.tokens.length && (this.tokens[peek].kind === 'nl' || this.tokens[peek].kind === 'indent')) {
      peek++
    }
    return this.tokens[peek]?.kind === 'op' && ops.includes(this.tokens[peek].value)
  }

  private isContinuationIdent(names: string[]): boolean {
    let peek = this.i
    while (peek < this.tokens.length && (this.tokens[peek].kind === 'nl' || this.tokens[peek].kind === 'indent')) {
      peek++
    }
    return this.tokens[peek]?.kind === 'ident' && names.includes(this.tokens[peek].value)
  }

  private stmt(): Stmt {
    this.eatNlAndIndent()

    // 0. Export keyword
    if (this.isIdent('export')) {
      this.i++
      this.eatNlAndIndent()
    }

    // 1. Import statements: import username/lib/version as alias
    if (this.isIdent('import')) {
      this.i++
      while (!this.at('nl') && !this.at('eof')) this.i++
      this.eatNl()
      return { kind: 'expr', expr: { kind: 'num', value: 0 } }
    }

    // 2. if statement
    if (this.isIdent('if')) return this.ifStmt()

    // 4. for loops: for i = 0 to 10
    if (this.isIdent('for')) {
      this.i++
      while (!this.at('nl') && !this.at('indent') && !this.at('eof')) this.i++
      this.skipBlock()
      return { kind: 'expr', expr: { kind: 'num', value: 0 } }
    }

    // 5. while loops: while cond
    if (this.isIdent('while')) {
      this.i++
      while (!this.at('nl') && !this.at('indent') && !this.at('eof')) this.i++
      this.skipBlock()
      return { kind: 'expr', expr: { kind: 'num', value: 0 } }
    }

    // 6. switch statement/expression used as a statement
    if (this.isIdent('switch')) {
      return { kind: 'expr', expr: this.switchExpr() }
    }

    // 7. User-defined types: type <TypeName>
    if (this.isIdent('type')) {
      this.i++
      const typeName = this.consumeIdent()
      this.skipBlock()
      return { kind: 'expr', expr: { kind: 'ident', name: typeName, line: 1, column: 1, length: 1 } }
    }

    // 8. Methods / Functions with =>: [method] func(...) => ...
    const isMethod = this.isIdent('method')
    const checkIdx = isMethod ? this.i + 1 : this.i
    if (
      this.tokens[checkIdx]?.kind === 'ident' &&
      this.tokens[checkIdx + 1]?.kind === 'op' &&
      this.tokens[checkIdx + 1]?.value === '('
    ) {
      let depth = 1
      let p = checkIdx + 2
      while (p < this.tokens.length && depth > 0) {
        if (this.tokens[p].kind === 'op' && this.tokens[p].value === '(') depth++
        else if (this.tokens[p].kind === 'op' && this.tokens[p].value === ')') depth--
        p++
      }
      while (p < this.tokens.length && (this.tokens[p].kind === 'nl' || this.tokens[p].kind === 'indent')) p++
      if (this.tokens[p]?.kind === 'op' && this.tokens[p]?.value === '=>') {
        if (isMethod) this.i++
        const name = this.consumeIdent()
        const params = this.parseParamNames()
        this.expectOp('=>')
        const body = this.parseFunctionBody()
        this.declaredFunctions.add(name)
        return { kind: 'func_def', name, params, body }
      }
    }

    // 9. Tuple assignment: [a, b] = ...  OR bare list expression (function return)
    if (this.isOp('[')) {
      const startTok = this.tokens[this.i]
      const startIdx = this.i
      this.i++
      const names: string[] = []
      const typeKeywords = new Set(['var', 'varip', 'float', 'int', 'bool', 'color', 'string', 'series'])
      while (!this.isOp(']') && !this.at('eof')) {
        if (this.at('ident')) {
          const tokVal = this.tokens[this.i].value
          if (typeKeywords.has(tokVal) && this.tokens[this.i + 1]?.kind === 'ident') {
            this.i++
            continue
          }
          names.push(this.consumeIdent())
        } else if (this.isOp(',')) {
          this.i++
        } else {
          this.i++
        }
      }
      if (this.isOp(']')) this.i++
      if (this.isAssign(this.tokens[this.i])) {
        const op = this.consumeOp() as '=' | ':=' | '+=' | '-=' | '*=' | '/='
        this.eatNlAndIndent()
        const value = this.expr()
        this.eatNl()
        return {
          kind: 'tuple_assign',
          names,
          value,
          line: startTok?.line ?? 1,
          column: startTok?.column ?? 1,
          length: 1
        }
      }
      // Rewind and parse as a list expression (e.g. UDF return tuple).
      this.i = startIdx
      const expr = this.expr()
      this.eatNl()
      return { kind: 'expr', expr }
    }

    // 10. Variable declarations & assignments (var, varip, typed, array, and simple):
    // e.g. "x = 1", "var int x = 0", "var float[] arr = ...", "float[] arr = ...", "x += 1"
    if (this.at('ident')) {
      let p = this.i
      let parenDepth = 0
      let bracketDepth = 0
      let assignIdx = -1
      while (p < this.tokens.length && this.tokens[p].kind !== 'nl' && this.tokens[p].kind !== 'eof') {
        const tok = this.tokens[p]
        if (tok.kind === 'op') {
          if (tok.value === '(') parenDepth++
          else if (tok.value === ')') parenDepth--
          else if (tok.value === '[') bracketDepth++
          else if (tok.value === ']') bracketDepth--
          else if (parenDepth === 0 && bracketDepth === 0 && this.isAssign(tok)) {
            assignIdx = p
            break
          }
        }
        p++
      }

      if (assignIdx > this.i) {
        let hasVar = false
        let nameTok: Tok | null = null
        for (let k = this.i; k < assignIdx; k++) {
          const t = this.tokens[k]
          if (t.kind === 'ident') {
            if (t.value === 'var' || t.value === 'varip') {
              hasVar = true
            } else {
              nameTok = t
            }
          }
        }

        if (nameTok && this.tokens[assignIdx - 1] === nameTok) {
          const name = nameTok.value
          this.i = assignIdx
          const op = this.consumeOp() as '=' | ':=' | '+=' | '-=' | '*=' | '/='
          this.eatNlAndIndent()
          const value = this.expr()
          this.eatNl()
          if (hasVar) {
            return {
              kind: 'var',
              name,
              value,
              line: nameTok.line,
              column: nameTok.column,
              length: Math.max(1, nameTok.value.length)
            }
          }
          return {
            kind: 'assign',
            name,
            op,
            value,
            line: nameTok.line,
            column: nameTok.column,
            length: Math.max(1, nameTok.value.length)
          }
        }
      }
    }

    const expr = this.expr()
    this.eatNl()
    return { kind: 'expr', expr }
  }

  private ifStmt(): Stmt {
    this.expectIdent('if')
    const arms: { cond: Expr | null; body: Stmt[] }[] = [{ cond: this.expr(), body: this.block() }]
    while (this.isIdent('else')) {
      this.i++
      if (this.isIdent('if')) {
        this.i++
        arms.push({ cond: this.expr(), body: this.block() })
      } else {
        arms.push({ cond: null, body: this.block() })
        break
      }
    }
    return { kind: 'if', arms }
  }

  private block(): Stmt[] {
    this.eatNl()
    if (!this.at('indent')) {
      this.fail('Expected indented block')
    }
    this.i++
    const body: Stmt[] = []
    while (!this.at('dedent') && !this.at('eof')) {
      if (this.at('nl')) {
        this.i++
        continue
      }
      body.push(this.stmt())
    }
    if (this.at('dedent')) this.i++
    return body
  }

  private parseParamNames(): string[] {
    this.expectOp('(')
    const names: string[] = []
    this.eatNlAndIndent()
    if (!this.isOp(')')) {
      for (;;) {
        this.eatNlAndIndent()
        // Skip type annotations: int x, series float y, pivot p_ivot, etc.
        while (this.at('ident') && this.tokens[this.i + 1]?.kind === 'ident') {
          this.i++
        }
        if (this.at('ident')) names.push(this.consumeIdent())
        this.eatNlAndIndent()
        if (this.isOp('=')) {
          this.i++
          this.eatNlAndIndent()
          this.expr()
          this.eatNlAndIndent()
        }
        if (this.isOp(',')) {
          this.i++
          continue
        }
        break
      }
    }
    this.eatNlAndIndent()
    this.expectOp(')')
    return names
  }

  private parseFunctionBody(): Stmt[] {
    this.eatNl()
    if (this.at('indent')) return this.block()
    const expr = this.expr()
    this.eatNl()
    return [{ kind: 'expr', expr }]
  }

  private switchExpr(): Expr {
    this.expectIdent('switch')
    let subject: Expr | null = null
    if (!this.at('nl') && !this.at('indent') && !this.at('eof') && !this.isOp('=>')) {
      subject = this.expr()
    }
    this.eatNl()
    if (!this.at('indent')) {
      return { kind: 'switch', subject, arms: [] }
    }
    this.i++
    const arms: { match: Expr | null; result: Expr }[] = []
    while (!this.at('dedent') && !this.at('eof')) {
      if (this.at('nl')) {
        this.i++
        continue
      }
      this.eatNlAndIndent()
      if (this.isOp('=>')) {
        this.i++
        this.eatNlAndIndent()
        arms.push({ match: null, result: this.expr() })
        this.eatNl()
        continue
      }
      const match = this.expr()
      this.eatNlAndIndent()
      this.expectOp('=>')
      this.eatNlAndIndent()
      arms.push({ match, result: this.expr() })
      this.eatNl()
    }
    if (this.at('dedent')) this.i++
    return { kind: 'switch', subject, arms }
  }

  private expr(): Expr {
    return this.ternary()
  }

  private ternary(): Expr {
    const cond = this.or()
    if (this.isOp('?') || this.isContinuationOp(['?'])) {
      this.eatNlAndIndent()
      this.consumeOp()
      this.eatNlAndIndent()
      const then = this.expr()
      this.eatNlAndIndent()
      this.expectOp(':')
      this.eatNlAndIndent()
      return { kind: 'ternary', cond, then, else: this.expr() }
    }
    return cond
  }

  private or(): Expr {
    let left = this.and()
    while (this.isIdent('or') || this.isContinuationIdent(['or'])) {
      this.eatNlAndIndent()
      this.i++
      this.eatNlAndIndent()
      left = { kind: 'binary', op: 'or', left, right: this.and() }
    }
    return left
  }

  private and(): Expr {
    let left = this.not()
    while (this.isIdent('and') || this.isContinuationIdent(['and'])) {
      this.eatNlAndIndent()
      this.i++
      this.eatNlAndIndent()
      left = { kind: 'binary', op: 'and', left, right: this.not() }
    }
    return left
  }

  private not(): Expr {
    if (this.isIdent('not')) {
      this.i++
      this.eatNlAndIndent()
      return { kind: 'unary', op: 'not', expr: this.not() }
    }
    return this.cmp()
  }

  private cmp(): Expr {
    const ops = ['==', '!=', '<', '>', '<=', '>=']
    let left = this.add()
    while (ops.some((op) => this.isOp(op)) || this.isContinuationOp(ops)) {
      this.eatNlAndIndent()
      const op = this.consumeOp()
      this.eatNlAndIndent()
      left = { kind: 'binary', op, left, right: this.add() }
    }
    return left
  }

  private add(): Expr {
    let left = this.mul()
    while (this.isOp('+') || this.isOp('-') || this.isContinuationOp(['+', '-'])) {
      this.eatNlAndIndent()
      const op = this.consumeOp()
      this.eatNlAndIndent()
      left = { kind: 'binary', op, left, right: this.mul() }
    }
    return left
  }

  private mul(): Expr {
    let left = this.unary()
    while (this.isOp('*') || this.isOp('/') || this.isOp('%') || this.isContinuationOp(['*', '/', '%'])) {
      this.eatNlAndIndent()
      const op = this.consumeOp()
      this.eatNlAndIndent()
      left = { kind: 'binary', op, left, right: this.unary() }
    }
    return left
  }

  private unary(): Expr {
    if (this.isOp('-') || this.isOp('+')) {
      const op = this.consumeOp() as '-' | '+'
      this.eatNlAndIndent()
      return { kind: 'unary', op, expr: this.unary() }
    }
    return this.postfix()
  }

  private postfix(): Expr {
    let expr = this.primary()
    for (;;) {
      if (this.isOp('.') || this.isContinuationOp(['.'])) {
        this.eatNlAndIndent()
        this.consumeOp()
        this.eatNlAndIndent()
        expr = { kind: 'member', target: expr, name: this.consumeIdent() }
        continue
      }
      // Pine generics: array.new<float>(), array.new<fairValueGap>()
      if (this.isOp('<') && this.looksLikeTypeArgs(expr)) {
        this.skipTypeArgs()
        continue
      }
      if (this.isOp('(')) {
        this.i++
        this.eatNlAndIndent()
        const args: Arg[] = []
        if (!this.isOp(')')) {
          args.push(this.arg())
          this.eatNlAndIndent()
          while (this.isOp(',')) {
            this.i++
            this.eatNlAndIndent()
            if (this.isOp(')')) break
            args.push(this.arg())
            this.eatNlAndIndent()
          }
        }
        this.eatNlAndIndent()
        this.expectOp(')')
        expr = { kind: 'call', callee: expr, args }
        continue
      }
      if (this.isOp('[')) {
        this.i++
        this.eatNlAndIndent()
        const index = this.expr()
        this.eatNlAndIndent()
        this.expectOp(']')
        expr = { kind: 'index', target: expr, index }
        continue
      }
      return expr
    }
  }

  private looksLikeTypeArgs(expr: Expr): boolean {
    if (expr.kind === 'member' && expr.name === 'new') return true
    if (expr.kind === 'ident') {
      return ['array', 'map', 'matrix', 'line', 'label', 'box', 'table'].includes(expr.name)
    }
    return false
  }

  private skipTypeArgs(): void {
    this.expectOp('<')
    let depth = 1
    while (!this.at('eof') && depth > 0) {
      if (this.isOp('<')) depth++
      else if (this.isOp('>')) {
        depth--
        this.i++
        if (depth === 0) return
        continue
      }
      this.i++
    }
  }

  private arg(): Arg {
    if (this.at('ident') && this.tokens[this.i + 1]?.kind === 'op' && this.tokens[this.i + 1]?.value === '=') {
      const name = this.consumeIdent()
      this.i++
      this.eatNlAndIndent()
      return { name, value: this.expr() }
    }
    return { value: this.expr() }
  }

  private primary(): Expr {
    this.eatNlAndIndent()
    if (this.at('number')) {
      const value = Number(this.tokens[this.i++].value)
      return { kind: 'num', value }
    }
    if (this.at('string')) return { kind: 'str', value: this.tokens[this.i++].value }
    if (this.at('color')) {
      const raw = this.tokens[this.i++].value
      const parsed = parseHexColorLiteral(raw)
      return { kind: 'color', hex: parsed.hex, transp: parsed.transp }
    }
    if (this.isIdent('switch')) {
      return this.switchExpr()
    }
    if (this.at('ident')) {
      const tok = this.tokens[this.i]
      return {
        kind: 'ident',
        name: this.consumeIdent(),
        line: tok.line,
        column: tok.column,
        length: Math.max(1, tok.value.length)
      }
    }
    if (this.isOp('(')) {
      this.i++
      this.eatNlAndIndent()
      const expr = this.expr()
      this.eatNlAndIndent()
      this.expectOp(')')
      return expr
    }
    if (this.isOp('[')) {
      this.i++
      this.eatNlAndIndent()
      const items: Expr[] = []
      if (!this.isOp(']')) {
        items.push(this.expr())
        this.eatNlAndIndent()
        while (this.isOp(',')) {
          this.i++
          this.eatNlAndIndent()
          if (this.isOp(']')) break
          items.push(this.expr())
          this.eatNlAndIndent()
        }
      }
      this.eatNlAndIndent()
      this.expectOp(']')
      return { kind: 'list', items }
    }
    this.fail(`Unexpected token '${this.tokens[this.i]?.value}'`)
  }

  private at(kind: TokKind): boolean {
    return this.tokens[this.i]?.kind === kind
  }

  private isIdent(name: string): boolean {
    return this.at('ident') && this.tokens[this.i].value === name
  }

  private isOp(op: string): boolean {
    return this.tokens[this.i]?.kind === 'op' && this.tokens[this.i].value === op
  }

  private isAssign(tok: Tok | undefined): boolean {
    return tok?.kind === 'op' && (tok.value === '=' || tok.value === ':=' || tok.value === '+=' || tok.value === '-=' || tok.value === '*=' || tok.value === '/=')
  }

  private consumeIdent(): string {
    if (!this.at('ident')) this.fail('Expected identifier')
    return this.tokens[this.i++].value
  }

  private consumeOp(): string {
    if (this.tokens[this.i]?.kind !== 'op') this.fail('Expected operator')
    return this.tokens[this.i++].value
  }

  private expectIdent(name: string): void {
    if (!this.isIdent(name)) this.fail(`Expected ${name}`)
    this.i++
  }

  private expectOp(op: string): void {
    if (!this.isOp(op)) this.fail(`Expected ${op}`)
    this.i++
  }

  private eatNl(): void {
    while (this.at('nl')) this.i++
  }

  private fail(message: string): never {
    const token = this.tokens[this.i]
    throw new PineError(message, token?.line ?? 1, token?.column ?? 1, Math.max(1, token?.value.length ?? 1))
  }
}

function parse(tokens: Tok[]): {
  stmts: Stmt[]
  diagnostics: PineDiagnostic[]
  declaredFunctions: Set<string>
} {
  const parser = new Parser(tokens)
  const stmts = parser.parse()
  return { stmts, diagnostics: parser.diagnostics, declaredFunctions: parser.declaredFunctions }
}

const AST_CACHE_LIMIT = 12
const astCache = new Map<
  string,
  { stmts: Stmt[]; diagnostics: PineDiagnostic[]; declaredFunctions: Set<string> }
>()

function parsedStmts(source: string): {
  stmts: Stmt[]
  diagnostics: PineDiagnostic[]
  declaredFunctions: Set<string>
} {
  const cached = astCache.get(source)
  if (cached) return cached
  const result = parse(lex(source))
  if (astCache.size >= AST_CACHE_LIMIT) {
    const oldest = astCache.keys().next().value
    if (oldest !== undefined) astCache.delete(oldest)
  }
  astCache.set(source, result)
  return result
}

function run(
  stmts: Stmt[],
  candles: Candle[],
  title: string,
  overlay: boolean,
  collectDiagnostics: boolean,
  declaredFunctions: Set<string> = new Set()
): PinePreviewResult {
  const functions = new Map<string, Extract<Stmt, { kind: 'func_def' }>>()
  for (const s of stmts) {
    if (s.kind === 'func_def') functions.set(s.name, s)
  }
  const mainStmts = stmts.filter((s) => s.kind !== 'func_def')

  const vars = new Map<string, PineVal>()
  const varNames = new Set<string>()
  const customTypes = new Set<string>()
  for (const s of mainStmts) {
    if (s.kind === 'expr' && s.expr.kind === 'ident') {
      customTypes.add(s.expr.name)
    }
  }
  const series = new Map<string, PineVal[]>()
  const plots: PlotSlot[] = []
  const fills: { top: number; bottom: number; color: string }[] = []
  const shapes: PinePreviewShape[] = []
  const diagnostics: PineDiagnostic[] = []
  const seenDiag = new Set<string>()
  const valueWhenHist: number[][] = []
  const taByExpr = new WeakMap<Expr, (number | null)[]>()
  const crossState = new WeakMap<Expr, { a: number | null; b: number | null }>()
  const macdCache = new WeakMap<
    Expr,
    { macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[] }
  >()
  const supertrendCache = new WeakMap<
    Expr,
    { supertrend: (number | null)[]; direction: (number | null)[] }
  >()
  const udfLocals = new WeakMap<
    Expr,
    { vars: Map<string, PineVal>; varNames: Set<string>; series: Map<string, PineVal[]> }
  >()

  // Bare call statements like getCurrentStructure() are drawing side-effects.
  // Skip executing those UDF bodies during chart preview — still run UDFs used in assignments/plots.
  let suppressUdfSideEffects = false

  type LocalScope = {
    vars: Map<string, PineVal>
    varNames: Set<string>
    series: Map<string, PineVal[]>
  }
  const scopeStack: LocalScope[] = []
  const currentScope = (): LocalScope | null => scopeStack[scopeStack.length - 1] ?? null
  const srcOpen = candles.map((candle) => candle.open)
  const srcHigh = candles.map((candle) => candle.high)
  const srcLow = candles.map((candle) => candle.low)
  const srcClose = candles.map((candle) => candle.close)
  const shapeMeta: Array<{
    position: PinePreviewShape['position']
    shape: PinePreviewShape['shape']
    color: string
    text?: string
  }> = []
  let valueWhenCursor = 0
  let plotCursor = 0
  let plotShapeCursor = 0
  let bar = 0

  const note = (row: PineDiagnostic): void => {
    if (!collectDiagnostics) return
    const key = `${row.line}:${row.column}:${row.message}`
    if (seenDiag.has(key)) return
    seenDiag.add(key)
    diagnostics.push(row)
  }

  const getSeries = (name: string): PineVal[] => {
    const scope = currentScope()
    const table = scope?.series ?? series
    let row = table.get(name)
    if (!row) {
      row = Array(candles.length).fill(null)
      table.set(name, row)
    }
    return row
  }

  const sourceAt = (field: keyof Candle, offset: number): number | null => {
    const i = bar - offset
    if (i < 0 || i >= candles.length) return null
    const value = candles[i][field]
    return typeof value === 'number' ? value : null
  }

  const srcSeries = (field: 'open' | 'high' | 'low' | 'close'): number[] => {
    if (field === 'open') return srcOpen
    if (field === 'high') return srcHigh
    if (field === 'low') return srcLow
    return srcClose
  }

  const hl2 = (i: number): number => (candles[i].high + candles[i].low) / 2
  const hlc3 = (i: number): number => (candles[i].high + candles[i].low + candles[i].close) / 3
  const ohlc4 = (i: number): number =>
    (candles[i].open + candles[i].high + candles[i].low + candles[i].close) / 4

  function isNaVal(value: PineVal): boolean {
    return value == null || (typeof value === 'number' && Number.isNaN(value))
  }

  function truthy(value: PineVal): boolean {
    if (isNaVal(value) || value === false) return false
    if (typeof value === 'object') return true
    return Boolean(value)
  }

  function num(value: PineVal): number | null {
    return typeof value === 'number' && !Number.isNaN(value) ? value : null
  }

  function calleeName(expr: Expr): string {
    if (expr.kind === 'ident') return expr.name
    if (expr.kind === 'member' && expr.target.kind === 'ident') return `${expr.target.name}.${expr.name}`
    return ''
  }

  function readIdent(
    name: string,
    offset: number,
    pos?: { line: number; column: number; length: number }
  ): PineVal {
    if (name === 'na') return null
    if (name === 'true') return true
    if (name === 'false') return false
    if (name === 'close') return sourceAt('close', offset)
    if (name === 'open') return sourceAt('open', offset)
    if (name === 'high') return sourceAt('high', offset)
    if (name === 'low') return sourceAt('low', offset)
    if (name === 'volume') return sourceAt('volume', offset)
    if (name === 'range') {
      const i = bar - offset
      if (i < 0) return null
      return candles[i].high - candles[i].low
    }
    if (name === 'hl2') {
      const i = bar - offset
      return i < 0 ? null : hl2(i)
    }
    if (name === 'hlc3') {
      const i = bar - offset
      return i < 0 ? null : hlc3(i)
    }
    if (name === 'time') return candles[bar - offset]?.timestamp ?? null
    if (name === 'time_close') return candles[bar - offset]?.timestamp ?? null
    if (name === 'timenow') return Date.now()
    if (name === 'bar_index') return Math.max(0, bar - offset)
    if (name === 'last_bar_index') return Math.max(0, candles.length - 1)
    if (name === 'ohlc4') {
      const i = bar - offset
      return i < 0 ? null : ohlc4(i)
    }
    const i = bar - offset
    if (i < 0) return null
    if (customTypes.has(name)) return { kind: 'object', type: name }

    const scope = currentScope()
    if (scope) {
      if (scope.series.has(name) || scope.varNames.has(name) || scope.vars.has(name)) {
        if (offset === 0 && scope.varNames.has(name) && scope.series.get(name)?.[bar] == null) {
          return scope.vars.get(name) ?? null
        }
        return scope.series.get(name)?.[i] ?? (offset === 0 ? (scope.vars.get(name) ?? null) : null)
      }
    }

    if (series.has(name) || varNames.has(name)) {
      if (offset === 0 && varNames.has(name) && series.get(name)?.[bar] == null) {
        return vars.get(name) ?? null
      }
      return series.get(name)?.[i] ?? (offset === 0 ? (vars.get(name) ?? null) : null)
    }
    // Function params and non-var locals live only in the active scope map.
    if (scope?.vars.has(name)) return scope.vars.get(name) ?? null

    note({
      severity: 'warning',
      message: `Unknown name '${name}'`,
      line: pos?.line ?? 1,
      column: pos?.column ?? 1,
      length: pos?.length ?? name.length
    })
    return null
  }

  function evalExpr(expr: Expr): PineVal {
    switch (expr.kind) {
      case 'num':
        return expr.value
      case 'str':
        return expr.value
      case 'color':
        return { kind: 'color', hex: expr.hex, transp: expr.transp }
      case 'list':
        return expr.items.map((item) => evalExpr(item))
      case 'ident':
        return readIdent(expr.name, 0, expr)
      case 'unary': {
        const value = evalExpr(expr.expr)
        if (expr.op === 'not') return isNaVal(value) ? null : !truthy(value)
        const n = num(value)
        if (expr.op === '+') return n
        return n == null ? null : -n
      }
      case 'binary':
        return evalBinary(expr.op, evalExpr(expr.left), evalExpr(expr.right))
      case 'ternary':
        return truthy(evalExpr(expr.cond)) ? evalExpr(expr.then) : evalExpr(expr.else)
      case 'index': {
        const offset = num(evalExpr(expr.index))
        if (offset == null) return null
        if (expr.target.kind === 'ident') return readIdent(expr.target.name, offset, expr.target)
        const saved = bar
        bar = Math.max(0, bar - Math.max(0, Math.round(offset)))
        const value = evalExpr(expr.target)
        bar = saved
        return value
      }
      case 'member': {
        if (expr.target.kind === 'ident') {
          const ns = NAMESPACES[expr.target.name]
          if (ns && expr.name in ns) return ns[expr.name]
        }
        return null
      }
      case 'switch': {
        const subject = expr.subject ? evalExpr(expr.subject) : true
        for (const arm of expr.arms) {
          if (arm.match == null) return evalExpr(arm.result)
          const matched = evalExpr(arm.match)
          if (subject === matched || (isNaVal(subject) && isNaVal(matched))) {
            return evalExpr(arm.result)
          }
        }
        return null
      }
      case 'call':
        return evalCall(expr)
    }
  }

  function evalBinary(op: string, left: PineVal, right: PineVal): PineVal {
    if (op === 'and') return truthy(left) ? right : left === false ? false : null
    if (op === 'or') return truthy(left) ? left : right
    if (op === '==') return isNaVal(left) || isNaVal(right) ? null : left === right
    if (op === '!=') return isNaVal(left) || isNaVal(right) ? null : left !== right
    if (op === '+') {
      if (typeof left === 'string' || typeof right === 'string') {
        return `${left ?? ''}${right ?? ''}`
      }
    }
    const a = num(left)
    const b = num(right)
    if (a == null || b == null) return null
    if (op === '+') return a + b
    if (op === '-') return a - b
    if (op === '*') return a * b
    if (op === '/') return b === 0 ? null : a / b
    if (op === '%') return b === 0 ? null : a % b
    if (op === '<') return a < b
    if (op === '>') return a > b
    if (op === '<=') return a <= b
    if (op === '>=') return a >= b
    return null
  }

  function positional(args: Arg[]): PineVal[] {
    return args.filter((arg) => !arg.name).map((arg) => evalExpr(arg.value))
  }

  function named(args: Arg[]): Record<string, PineVal> {
    const out: Record<string, PineVal> = {}
    for (const arg of args) {
      if (arg.name) out[arg.name] = evalExpr(arg.value)
    }
    return out
  }

  function seriesFrom(value: PineVal, fallbackIdent?: Expr): (number | null)[] {
    if (fallbackIdent?.kind === 'ident') {
      const name = fallbackIdent.name
      if (name === 'close' || name === 'open' || name === 'high' || name === 'low') return srcSeries(name)
      if (name === 'hl2') return candles.map((_, i) => hl2(i))
      if (name === 'hlc3') return candles.map((_, i) => hlc3(i))
      if (name === 'ohlc4') return candles.map((_, i) => ohlc4(i))
      const row = currentScope()?.series.get(name) ?? series.get(name)
      if (row) return row.map((item) => num(item))
    } else if (fallbackIdent) {
      const savedBar = bar
      const out: (number | null)[] = Array(candles.length)
      for (let b = 0; b < candles.length; b++) {
        bar = b
        out[b] = num(evalExpr(fallbackIdent))
      }
      bar = savedBar
      return out
    }
    const current = num(value)
    return candles.map((_, i) => (i === bar ? current : null))
  }

  function smaOf(values: (number | null)[], period: number, at: number): number | null {
    if (period < 1 || at < period - 1) return null
    let sum = 0
    for (let i = at - period + 1; i <= at; i++) {
      const value = values[i]
      if (value == null) return null
      sum += value
    }
    return sum / period
  }

  function emaOf(values: (number | null)[], period: number, at: number): number | null {
    if (period < 1 || at < period - 1) return null
    const seed = smaOf(values, period, period - 1)
    if (seed == null) return null
    if (at === period - 1) return seed
    const k = 2 / (period + 1)
    let ema = seed
    for (let i = period; i <= at; i++) {
      const value = values[i]
      if (value == null) return null
      ema = value * k + ema * (1 - k)
    }
    return ema
  }

  function pivot(
    values: number[],
    left: number,
    right: number,
    at: number,
    kind: 'high' | 'low'
  ): number | null {
    const pivotBar = at - right
    if (pivotBar - left < 0 || pivotBar < 0) return null
    const price = values[pivotBar]
    for (let i = pivotBar - left; i <= pivotBar + right; i++) {
      if (i === pivotBar) continue
      if (kind === 'high' && values[i] >= price) return null
      if (kind === 'low' && values[i] <= price) return null
    }
    return price
  }

  function isColorVal(v: PineVal): v is { kind: 'color'; hex: string; transp: number } {
    return typeof v === 'object' && v !== null && !Array.isArray(v) && 'kind' in v && v.kind === 'color'
  }

  function isPlotVal(v: PineVal): v is { kind: 'plot'; id: number } {
    return typeof v === 'object' && v !== null && !Array.isArray(v) && 'kind' in v && v.kind === 'plot'
  }

  function colorCss(value: PineVal): string {
    if (isColorVal(value)) {
      const hex = value.hex.replace('#', '')
      const n = Number.parseInt(hex, 16)
      const r = (n >> 16) & 255
      const g = (n >> 8) & 255
      const b = n & 255
      const a = (100 - value.transp) / 100
      return `rgba(${r}, ${g}, ${b}, ${a})`
    }
    return String(value ?? COLORS[0])
  }

  function evalCall(expr: Extract<Expr, { kind: 'call' }>): PineVal {
    const name = calleeName(expr.callee)
    const pos = positional(expr.args)
    if (name === 'na') return pos[0] == null || isNaVal(pos[0])
    if (name === 'nz') return isNaVal(pos[0]) ? (pos[1] ?? 0) : pos[0]
    if (name === 'math.abs') {
      const n = num(pos[0])
      return n == null ? null : Math.abs(n)
    }
    if (name === 'math.max') {
      const nums = pos.map(num).filter((n): n is number => n != null)
      return nums.length ? Math.max(...nums) : null
    }
    if (name === 'math.min') {
      const nums = pos.map(num).filter((n): n is number => n != null)
      return nums.length ? Math.min(...nums) : null
    }
    if (name === 'math.pow') return Math.pow(num(pos[0]) ?? 0, num(pos[1]) ?? 1)
    if (name === 'math.sqrt') return Math.sqrt(Math.max(0, num(pos[0]) ?? 0))
    if (name === 'math.round') return Math.round(num(pos[0]) ?? 0)
    if (name === 'math.floor') return Math.floor(num(pos[0]) ?? 0)
    if (name === 'math.ceil') return Math.ceil(num(pos[0]) ?? 0)
    if (name === 'math.sign') return Math.sign(num(pos[0]) ?? 0)
    if (name === 'indicator' || name === 'alertcondition') return null
    if (name === 'array.new' || name.startsWith('array.new_')) return []
    if (name === 'map.new' || name.startsWith('map.new_')) return []
    if (name !== 'color.new' && name.endsWith('.new')) return { kind: 'object', type: name.slice(0, -4) }
    if (name === 'input.int' || name === 'input.float' || name === 'input') {
      const opts = named(expr.args)
      const val = pos[0] ?? opts.defval
      return num(val) ?? 0
    }
    if (name === 'input.bool') {
      const opts = named(expr.args)
      const val = pos[0] ?? opts.defval
      return val === true
    }
    if (name === 'input.string') {
      const opts = named(expr.args)
      const val = pos[0] ?? opts.defval
      return String(val ?? '')
    }
    if (name === 'input.color') {
      const opts = named(expr.args)
      const val = pos[0] ?? opts.defval
      return val ?? { kind: 'color', hex: '#2962ff', transp: 0 }
    }
    if (name === 'input.source') {
      const opts = named(expr.args)
      const val = pos[0] ?? opts.defval
      return val ?? sourceAt('close', 0)
    }
    if (name === 'input.timeframe' || name === 'input.symbol') {
      const opts = named(expr.args)
      const val = pos[0] ?? opts.defval
      return String(val ?? '')
    }
    if (name === 'color.rgb') {
      const r = num(pos[0]) ?? 0
      const g = num(pos[1]) ?? 0
      const b = num(pos[2]) ?? 0
      const t = num(pos[3]) ?? 0
      const hex = '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')
      return { kind: 'color', hex, transp: t }
    }
    if (name === 'str.tostring' || name === 'tostring') return pos[0] == null ? 'na' : String(pos[0])
    if (name === 'str.format') return String(pos[0] ?? '')
    if (name === 'color.new') {
      const base = pos[0]
      const transp = num(pos[1]) ?? 0
      if (isColorVal(base)) {
        return { kind: 'color', hex: base.hex, transp }
      }
      return null
    }
    if (name === 'ta.sma' || name === 'sma') {
      const period = num(pos[1]) ?? 0
      const srcArg = expr.args[0]?.value
      let row = taByExpr.get(expr)
      if (!row) {
        row = smaSeries(seriesFrom(pos[0], srcArg), period)
        taByExpr.set(expr, row)
      }
      return row[bar]
    }
    if (name === 'ta.ema' || name === 'ema') {
      const period = num(pos[1]) ?? 0
      const srcArg = expr.args[0]?.value
      let row = taByExpr.get(expr)
      if (!row) {
        row = emaSeries(seriesFrom(pos[0], srcArg), period)
        taByExpr.set(expr, row)
      }
      return row[bar]
    }
    if (name === 'ta.rsi' || name === 'rsi') {
      const period = num(pos[1]) ?? 0
      const srcArg = expr.args[0]?.value
      let row = taByExpr.get(expr)
      if (!row) {
        row = rsiSeries(seriesFrom(pos[0], srcArg), period)
        taByExpr.set(expr, row)
      }
      return row[bar]
    }
    if (name === 'ta.atr') {
      const period = num(pos[0]) ?? 0
      let row = taByExpr.get(expr)
      if (!row) {
        row = atrSeries(candles, period)
        taByExpr.set(expr, row)
      }
      return row[bar]
    }
    if (name === 'ta.vwap') {
      let row = taByExpr.get(expr)
      if (!row) {
        row = vwapSeries(candles)
        taByExpr.set(expr, row)
      }
      return row[bar]
    }
    if (name === 'ta.valuewhen') {
      const id = valueWhenCursor++
      if (!valueWhenHist[id]) valueWhenHist[id] = []
      const src = num(pos[1])
      const occ = Math.max(0, Math.floor(num(pos[2]) ?? 0))
      if (truthy(pos[0]) && src != null) valueWhenHist[id].push(src)
      const hist = valueWhenHist[id]
      const idx = hist.length - 1 - occ
      return idx >= 0 ? hist[idx] : null
    }
    if (name === 'ta.pivothigh') {
      const left = num(pos[1]) ?? 0
      const right = num(pos[2]) ?? 0
      const field = expr.args[0]?.value.kind === 'ident' ? expr.args[0].value.name : 'high'
      const values = field === 'low' ? srcSeries('low') : srcSeries('high')
      return pivot(values, left, right, bar, 'high')
    }
    if (name === 'ta.pivotlow') {
      const left = num(pos[1]) ?? 0
      const right = num(pos[2]) ?? 0
      const field = expr.args[0]?.value.kind === 'ident' ? expr.args[0].value.name : 'low'
      const values = field === 'high' ? srcSeries('high') : srcSeries('low')
      return pivot(values, left, right, bar, 'low')
    }
    if (name === 'plot') {
      const value = num(pos[0])
      if (!plots[plotCursor]) {
        const opts = named(expr.args)
        const title = typeof opts.title === 'string' ? opts.title : typeof pos[1] === 'string' ? pos[1] : 'Plot'
        const hidden = opts.display === 'none'
        const colorVal = opts.color
        const color = isColorVal(colorVal)
          ? colorCss(colorVal)
          : typeof colorVal === 'string'
            ? colorVal
            : COLORS[plots.length % COLORS.length]
        plots[plotCursor] = { title, color, hidden, values: Array(candles.length).fill(null) }
      }
      plots[plotCursor].values[bar] = value
      const handle = { kind: 'plot' as const, id: plotCursor }
      plotCursor++
      return handle
    }
    if (name === 'plotshape') {
      if (!shapeMeta[plotShapeCursor]) {
        const opts = named(expr.args)
        const position = opts.location === 'aboveBar' ? 'aboveBar' : 'belowBar'
        const shape =
          opts.style === 'arrowDown' || opts.style === 'arrowUp' || opts.style === 'circle' || opts.style === 'square'
            ? opts.style
            : position === 'aboveBar'
              ? 'arrowDown'
              : 'arrowUp'
        shapeMeta[plotShapeCursor] = {
          position,
          shape,
          color: colorCss(opts.color ?? { kind: 'color', hex: '#089981', transp: 0 }),
          text: typeof opts.text === 'string' ? opts.text : undefined
        }
      }
      if (truthy(pos[0])) {
        const meta = shapeMeta[plotShapeCursor]
        const candle = candles[bar]
        shapes.push({
          timestamp: candle.timestamp,
          price: meta.position === 'aboveBar' ? candle.high : candle.low,
          ...meta
        })
      }
      plotShapeCursor++
      return null
    }
    if (name === 'fill') {
      const top = pos[0]
      const bottom = pos[1]
      if (bar === 0 && isPlotVal(top) && isPlotVal(bottom)) {
        const opts = named(expr.args)
        fills.push({ top: top.id, bottom: bottom.id, color: colorCss(opts.color) })
      }
      return null
    }
    if (name === 'ta.stdev' || name === 'stdev') {
      const period = Math.max(1, Math.round(num(pos[1]) ?? 1))
      const srcArg = expr.args[0]?.value
      let row = taByExpr.get(expr)
      if (!row) {
        row = stdevSeries(seriesFrom(pos[0], srcArg), period)
        taByExpr.set(expr, row)
      }
      return row[bar]
    }
    if (name === 'ta.bb') {
      const period = Math.max(1, Math.round(num(pos[1]) ?? 20))
      const mult = num(pos[2]) ?? 2
      const srcArg = expr.args[0]?.value
      let basisRow = taByExpr.get(expr)
      if (!basisRow) {
        basisRow = smaSeries(seriesFrom(pos[0], srcArg), period)
        taByExpr.set(expr, basisRow)
      }
      const basis = basisRow[bar]
      const devRow = stdevSeries(seriesFrom(pos[0], srcArg), period)
      const dev = devRow[bar]
      if (basis == null || dev == null) return [null, null, null]
      return [basis, basis + mult * dev, basis - mult * dev]
    }
    if (name === 'ta.macd' || name === 'macd') {
      const fast = Math.max(1, Math.round(num(pos[1]) ?? 12))
      const slow = Math.max(1, Math.round(num(pos[2]) ?? 26))
      const signal = Math.max(1, Math.round(num(pos[3]) ?? 9))
      const srcArg = expr.args[0]?.value
      let cached = macdCache.get(expr)
      if (!cached) {
        cached = macdSeries(seriesFrom(pos[0], srcArg), fast, slow, signal)
        macdCache.set(expr, cached)
      }
      return [cached.macd[bar], cached.signal[bar], cached.hist[bar]]
    }
    if (name === 'ta.supertrend') {
      const factor = num(pos[0]) ?? 3.0
      const atrPeriod = Math.max(1, Math.round(num(pos[1]) ?? 10))
      let cached = supertrendCache.get(expr)
      if (!cached) {
        cached = supertrendSeries(candles, factor, atrPeriod)
        supertrendCache.set(expr, cached)
      }
      return [cached.supertrend[bar], cached.direction[bar]]
    }
    if (name === 'ta.rma') {
      const period = Math.max(1, Math.round(num(pos[1]) ?? 10))
      const srcArg = expr.args[0]?.value
      let row = taByExpr.get(expr)
      if (!row) {
        row = rmaSeries(seriesFrom(pos[0], srcArg), period)
        taByExpr.set(expr, row)
      }
      return row[bar]
    }
    if (name === 'ta.wma') {
      const period = Math.max(1, Math.round(num(pos[1]) ?? 10))
      const srcArg = expr.args[0]?.value
      let row = taByExpr.get(expr)
      if (!row) {
        row = wmaSeries(seriesFrom(pos[0], srcArg), period)
        taByExpr.set(expr, row)
      }
      return row[bar]
    }
    if (name === 'hline') {
      const level = num(pos[0])
      if (bar === 0 && level != null) {
        const opts = named(expr.args)
        const title = typeof opts.title === 'string' ? opts.title : typeof pos[1] === 'string' ? pos[1] : 'Level'
        const colorVal = opts.color
        const color = isColorVal(colorVal) ? colorVal.hex : typeof colorVal === 'string' ? colorVal : '#787b86'
        plots.push({
          title,
          color,
          hidden: false,
          values: Array(candles.length).fill(level)
        })
      }
      return { kind: 'object', type: 'hline' }
    }
    if (name === 'ta.highest' || name === 'highest') {
      const hasSource = pos.length >= 2 && num(pos[0]) != null && num(pos[1]) != null
      const period = Math.max(1, Math.round(num(hasSource ? pos[1] : pos[0]) ?? 1))
      const srcArg = hasSource ? expr.args[0]?.value : undefined
      let row = taByExpr.get(expr)
      if (!row) {
        const src = hasSource ? pos[0] : sourceAt('high', 0)
        row = highestSeries(seriesFrom(src, srcArg ?? { kind: 'ident', name: 'high', line: 1, column: 1, length: 4 }), period)
        taByExpr.set(expr, row)
      }
      return row[bar]
    }
    if (name === 'ta.lowest' || name === 'lowest') {
      const hasSource = pos.length >= 2 && num(pos[0]) != null && num(pos[1]) != null
      const period = Math.max(1, Math.round(num(hasSource ? pos[1] : pos[0]) ?? 1))
      const srcArg = hasSource ? expr.args[0]?.value : undefined
      let row = taByExpr.get(expr)
      if (!row) {
        const src = hasSource ? pos[0] : sourceAt('low', 0)
        row = lowestSeries(seriesFrom(src, srcArg ?? { kind: 'ident', name: 'low', line: 1, column: 1, length: 3 }), period)
        taByExpr.set(expr, row)
      }
      return row[bar]
    }
    if (name === 'ta.crossover' || name === 'crossover') {
      const aCurr = num(pos[0])
      const bCurr = num(pos[1])
      const prev = crossState.get(expr)
      const aPrev =
        expr.args[0]?.value.kind === 'ident'
          ? num(readIdent(expr.args[0].value.name, 1))
          : (prev?.a ?? null)
      const bPrev =
        expr.args[1]?.value.kind === 'ident'
          ? num(readIdent(expr.args[1].value.name, 1))
          : (prev?.b ?? null)
      crossState.set(expr, { a: aCurr, b: bCurr })
      if (aCurr == null || bCurr == null || aPrev == null || bPrev == null) return false
      return aPrev <= bPrev && aCurr > bCurr
    }
    if (name === 'ta.crossunder' || name === 'crossunder') {
      const aCurr = num(pos[0])
      const bCurr = num(pos[1])
      const prev = crossState.get(expr)
      const aPrev =
        expr.args[0]?.value.kind === 'ident'
          ? num(readIdent(expr.args[0].value.name, 1))
          : (prev?.a ?? null)
      const bPrev =
        expr.args[1]?.value.kind === 'ident'
          ? num(readIdent(expr.args[1].value.name, 1))
          : (prev?.b ?? null)
      crossState.set(expr, { a: aCurr, b: bCurr })
      if (aCurr == null || bCurr == null || aPrev == null || bPrev == null) return false
      return aPrev >= bPrev && aCurr < bCurr
    }
    if (name === 'ta.cross' || name === 'cross') {
      const aCurr = num(pos[0])
      const bCurr = num(pos[1])
      const prev = crossState.get(expr)
      const aPrev =
        expr.args[0]?.value.kind === 'ident'
          ? num(readIdent(expr.args[0].value.name, 1))
          : (prev?.a ?? null)
      const bPrev =
        expr.args[1]?.value.kind === 'ident'
          ? num(readIdent(expr.args[1].value.name, 1))
          : (prev?.b ?? null)
      crossState.set(expr, { a: aCurr, b: bCurr })
      if (aCurr == null || bCurr == null || aPrev == null || bPrev == null) return false
      return (aPrev <= bPrev && aCurr > bCurr) || (aPrev >= bPrev && aCurr < bCurr)
    }
    if (name === 'ta.change' || name === 'change') {
      const cur = num(pos[0])
      const len = Math.max(1, Math.round(num(pos[1]) ?? 1))
      const prev = num(evalExpr({ kind: 'index', target: expr.args[0]?.value ?? { kind: 'num', value: 0 }, index: { kind: 'num', value: len } }))
      return cur != null && prev != null ? cur - prev : null
    }
    if (name === 'ta.tr' || name === 'tr') {
      if (bar === 0) return candles[0].high - candles[0].low
      const prevClose = candles[bar - 1].close
      return Math.max(
        candles[bar].high - candles[bar].low,
        Math.abs(candles[bar].high - prevClose),
        Math.abs(candles[bar].low - prevClose)
      )
    }
    if (name.startsWith('array.') || /^\w+\.(push|get|set|size|pop|shift|unshift|clear|includes|indexof|remove|slice|fill|copy|from|max|min|sum|avg|first|last|sort|reverse|join|concat)$/i.test(name)) {
      const method = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : name
      const receiverName = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : ''
      const receiver =
        receiverName && receiverName !== 'array'
          ? (readIdent(receiverName, 0) as PineVal)
          : pos[0]
      const methodArgs = receiverName && receiverName !== 'array' ? pos : pos.slice(1)

      if (method.startsWith('new')) return []
      if (method === 'get') {
        const arr = receiver as PineVal[]
        const idx = num(methodArgs[0]) ?? 0
        return Array.isArray(arr) ? (arr[idx] ?? null) : null
      }
      if (method === 'set') {
        const arr = receiver as PineVal[]
        const idx = num(methodArgs[0]) ?? 0
        if (Array.isArray(arr)) arr[idx] = methodArgs[1]
        return null
      }
      if (method === 'push' || method === 'unshift') {
        const arr = receiver as PineVal[]
        if (Array.isArray(arr)) {
          if (method === 'push') arr.push(methodArgs[0])
          else arr.unshift(methodArgs[0])
        }
        return null
      }
      if (method === 'pop' || method === 'shift') {
        const arr = receiver as PineVal[]
        if (!Array.isArray(arr) || arr.length === 0) return null
        return method === 'pop' ? (arr.pop() ?? null) : (arr.shift() ?? null)
      }
      if (method === 'size') {
        const arr = receiver as PineVal[]
        return Array.isArray(arr) ? arr.length : 0
      }
      if (method === 'clear') {
        const arr = receiver as PineVal[]
        if (Array.isArray(arr)) arr.length = 0
        return null
      }
      if (method === 'remove') {
        const arr = receiver as PineVal[]
        const idx = num(methodArgs[0]) ?? 0
        if (Array.isArray(arr) && idx >= 0 && idx < arr.length) {
          const [removed] = arr.splice(idx, 1)
          return removed ?? null
        }
        return null
      }
      return null
    }
    if (
      name.startsWith('line.') ||
      name.startsWith('box.') ||
      name.startsWith('label.') ||
      name.startsWith('table.') ||
      name === 'bgcolor' ||
      name === 'barcolor' ||
      name === 'plotcandle' ||
      name === 'plotbar'
    ) {
      return name.startsWith('line.') ||
        name.startsWith('box.') ||
        name.startsWith('label.') ||
        name.startsWith('table.')
        ? { kind: 'object', type: name }
        : null
    }
    if (name === 'request.security' || name === 'request.security_lower_tf') {
      // Preview on the chart's own timeframe: use the expression result (3rd arg).
      return pos[2] ?? null
    }
    const fn = functions.get(name)
    if (fn) {
      if (suppressUdfSideEffects) return null
      let locals = udfLocals.get(expr)
      if (!locals) {
        locals = {
          vars: new Map(),
          varNames: new Set(),
          series: new Map()
        }
        udfLocals.set(expr, locals)
      }
      // Bind parameters for this bar.
      for (let i = 0; i < fn.params.length; i++) {
        const pname = fn.params[i]
        locals.vars.set(pname, pos[i] ?? null)
        getOrCreateLocalSeries(locals, pname)[bar] = pos[i] ?? null
      }
      scopeStack.push(locals)
      let result: PineVal = null
      try {
        for (const stmt of fn.body) {
          const maybe = execFnStmt(stmt)
          if (maybe !== undefined) result = maybe
        }
      } finally {
        scopeStack.pop()
      }
      return result
    }
    if (declaredFunctions.has(name)) {
      return null
    }
    const at =
      expr.callee.kind === 'ident'
        ? expr.callee
        : expr.callee.kind === 'member' && expr.callee.target.kind === 'ident'
          ? expr.callee.target
          : { line: 1, column: 1, length: 1 }
    note({
      severity: 'warning',
      message: name ? `Unknown function '${name}'` : 'Unknown function',
      line: at.line,
      column: at.column,
      length: at.length
    })
    return null
  }

  function getOrCreateLocalSeries(scope: LocalScope, name: string): PineVal[] {
    let row = scope.series.get(name)
    if (!row) {
      row = Array(candles.length).fill(null)
      scope.series.set(name, row)
    }
    return row
  }

  function bindName(stmt: Extract<Stmt, { kind: 'var' | 'assign' }>, next: PineVal): void {
    if (RESERVED_NAMES.has(stmt.name)) {
      note({
        severity: 'error',
        message: `'${stmt.name}' cannot be used as a variable or function name.`,
        line: stmt.line,
        column: stmt.column,
        length: stmt.length
      })
      return
    }
    const scope = currentScope()
    getSeries(stmt.name)[bar] = next
    if (scope) {
      if (stmt.kind === 'var' || scope.varNames.has(stmt.name)) scope.vars.set(stmt.name, next)
      else scope.vars.set(stmt.name, next)
      return
    }
    if (stmt.kind === 'var' || varNames.has(stmt.name)) vars.set(stmt.name, next)
  }

  /** Execute a statement inside a UDF; return value if this stmt yields the function result. */
  function execFnStmt(stmt: Stmt): PineVal | undefined {
    const scope = currentScope()
    switch (stmt.kind) {
      case 'func_def':
        return undefined
      case 'var': {
        if (!scope) return undefined
        if (bar === 0 && !scope.varNames.has(stmt.name)) {
          scope.varNames.add(stmt.name)
          const init = evalExpr(stmt.value)
          scope.vars.set(stmt.name, init)
          getOrCreateLocalSeries(scope, stmt.name)[bar] = init
        } else {
          getOrCreateLocalSeries(scope, stmt.name)[bar] = scope.vars.get(stmt.name) ?? null
        }
        return undefined
      }
      case 'assign': {
        let next: PineVal
        const cur = scope
          ? scope.varNames.has(stmt.name)
            ? (scope.vars.get(stmt.name) ?? readIdent(stmt.name, 0))
            : readIdent(stmt.name, 0)
          : readIdent(stmt.name, 0)
        if (stmt.op === '+=') next = evalBinary('+', cur, evalExpr(stmt.value))
        else if (stmt.op === '-=') next = evalBinary('-', cur, evalExpr(stmt.value))
        else if (stmt.op === '*=') next = evalBinary('*', cur, evalExpr(stmt.value))
        else if (stmt.op === '/=') next = evalBinary('/', cur, evalExpr(stmt.value))
        else next = evalExpr(stmt.value)
        bindName(stmt, next)
        return undefined
      }
      case 'tuple_assign': {
        const val = evalExpr(stmt.value)
        const arr = Array.isArray(val) ? val : [val]
        for (let idx = 0; idx < stmt.names.length; idx++) {
          const n = stmt.names[idx]
          if (n && n !== '_') {
            bindName(
              {
                kind: 'assign',
                name: n,
                op: '=',
                value: stmt.value,
                line: stmt.line,
                column: stmt.column,
                length: stmt.length
              },
              arr[idx] ?? null
            )
          }
        }
        return undefined
      }
      case 'if': {
        for (const arm of stmt.arms) {
          if (arm.cond == null || truthy(evalExpr(arm.cond))) {
            let last: PineVal | undefined
            for (const inner of arm.body) last = execFnStmt(inner)
            return last
          }
        }
        return undefined
      }
      case 'expr':
        return evalExpr(stmt.expr)
    }
  }

  function exec(stmt: Stmt): void {
    switch (stmt.kind) {
      case 'func_def':
        return
      case 'var': {
        if (bar === 0 && !varNames.has(stmt.name) && !RESERVED_NAMES.has(stmt.name)) {
          varNames.add(stmt.name)
          vars.set(stmt.name, evalExpr(stmt.value))
        }
        if (RESERVED_NAMES.has(stmt.name)) {
          bindName(stmt, evalExpr(stmt.value))
          return
        }
        getSeries(stmt.name)[bar] = vars.get(stmt.name) ?? null
        return
      }
      case 'assign': {
        let next: PineVal
        if (stmt.op === '+=') {
          const cur = varNames.has(stmt.name) ? (vars.get(stmt.name) ?? readIdent(stmt.name, 0)) : readIdent(stmt.name, 0)
          next = evalBinary('+', cur, evalExpr(stmt.value))
        } else if (stmt.op === '-=') {
          const cur = varNames.has(stmt.name) ? (vars.get(stmt.name) ?? readIdent(stmt.name, 0)) : readIdent(stmt.name, 0)
          next = evalBinary('-', cur, evalExpr(stmt.value))
        } else if (stmt.op === '*=') {
          const cur = varNames.has(stmt.name) ? (vars.get(stmt.name) ?? readIdent(stmt.name, 0)) : readIdent(stmt.name, 0)
          next = evalBinary('*', cur, evalExpr(stmt.value))
        } else if (stmt.op === '/=') {
          const cur = varNames.has(stmt.name) ? (vars.get(stmt.name) ?? readIdent(stmt.name, 0)) : readIdent(stmt.name, 0)
          next = evalBinary('/', cur, evalExpr(stmt.value))
        } else {
          next = evalExpr(stmt.value)
        }
        bindName(stmt, next)
        return
      }
      case 'tuple_assign': {
        const val = evalExpr(stmt.value)
        const arr = Array.isArray(val) ? val : [val]
        for (let idx = 0; idx < stmt.names.length; idx++) {
          const n = stmt.names[idx]
          if (n && n !== '_') {
            bindName(
              {
                kind: 'assign',
                name: n,
                op: '=',
                value: stmt.value,
                line: stmt.line,
                column: stmt.column,
                length: stmt.length
              },
              arr[idx] ?? null
            )
          }
        }
        return
      }
      case 'expr': {
        // plot()/fill() builtins still run; user drawing helpers called as statements are skipped.
        const prev = suppressUdfSideEffects
        suppressUdfSideEffects = true
        try {
          evalExpr(stmt.expr)
        } finally {
          suppressUdfSideEffects = prev
        }
        return
      }
      case 'if': {
        for (const arm of stmt.arms) {
          if (arm.cond == null || truthy(evalExpr(arm.cond))) {
            for (const inner of arm.body) exec(inner)
            return
          }
        }
      }
    }
  }

  for (; bar < candles.length; bar++) {
    plotCursor = 0
    plotShapeCursor = 0
    valueWhenCursor = 0
    for (const name of varNames) getSeries(name)[bar] = vars.get(name) ?? null
    for (const stmt of mainStmts) exec(stmt)
  }

  const pane: PinePreviewPane = overlay ? 'overlay' : 'oscillator'
  const lines: PinePreviewLine[] = plots.flatMap((plot, index) => {
    if (plot.hidden) {
      return [
        {
          id: `${index}-${plot.title}`,
          title: plot.title,
          color: plot.color,
          pane,
          hidden: true,
          points: []
        }
      ]
    }
    const points = candles.flatMap((candle, i) => {
      const value = plot.values[i]
      return value == null ? [] : [{ timestamp: candle.timestamp, value }]
    })
    if (points.length === 0) return []
    return [
      {
        id: `${index}-${plot.title}`,
        title: plot.title,
        color: plot.color,
        pane,
        points
      }
    ]
  })

  const fillPoints: PinePreviewFill[] = []
  for (const fill of fills) {
    const top = plots[fill.top]
    const bottom = plots[fill.bottom]
    if (!top || !bottom) continue
    let band: PinePreviewFill | null = null
    for (let i = 0; i < candles.length; i++) {
      const a = top.values[i]
      const b = bottom.values[i]
      if (a == null || b == null) {
        band = null
        continue
      }
      if (band && band.top === a && band.bottom === b && band.color === fill.color) {
        band.until = candles[i].timestamp
        continue
      }
      band = {
        timestamp: candles[i].timestamp,
        until: candles[i].timestamp,
        top: a,
        bottom: b,
        color: fill.color
      }
      fillPoints.push(band)
    }
  }

  return {
    title,
    overlay,
    lines,
    fills: fillPoints,
    shapes,
    diagnostics,
    unsupported:
      diagnostics.some((row) => row.severity === 'error') ||
      (lines.filter((l) => !l.hidden).length === 0 && shapes.length === 0 && diagnostics.length > 0)
  }
}

function rsiAt(values: (number | null)[], period: number, at: number): number | null {
  if (period < 1 || at < period) return null
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const prev = values[i - 1]
    const cur = values[i]
    if (prev == null || cur == null) return null
    const delta = cur - prev
    if (delta >= 0) gain += delta
    else loss -= delta
  }
  gain /= period
  loss /= period
  for (let i = period + 1; i <= at; i++) {
    const prev = values[i - 1]
    const cur = values[i]
    if (prev == null || cur == null) return null
    const delta = cur - prev
    const up = delta > 0 ? delta : 0
    const down = delta < 0 ? -delta : 0
    gain = (gain * (period - 1) + up) / period
    loss = (loss * (period - 1) + down) / period
  }
  if (loss === 0) return 100
  return 100 - 100 / (1 + gain / loss)
}

function smaSeries(values: (number | null)[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null)
  if (period < 1) return out
  let sum = 0
  let missing = 0
  for (let i = 0; i < values.length; i++) {
    const value = values[i]
    if (value == null) missing++
    else sum += value
    if (i >= period) {
      const old = values[i - period]
      if (old == null) missing--
      else sum -= old
    }
    if (i >= period - 1 && missing === 0) out[i] = sum / period
  }
  return out
}

function emaSeries(values: (number | null)[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null)
  if (period < 1 || values.length < period) return out
  let firstValid = -1
  for (let i = 0; i <= values.length - period; i++) {
    let allNonNull = true
    for (let k = 0; k < period; k++) {
      if (values[i + k] == null) {
        allNonNull = false
        i = i + k
        break
      }
    }
    if (allNonNull) {
      firstValid = i
      break
    }
  }
  if (firstValid === -1) return out

  let sum = 0
  for (let i = firstValid; i < firstValid + period; i++) {
    sum += values[i] as number
  }
  out[firstValid + period - 1] = sum / period
  const k = 2 / (period + 1)
  for (let i = firstValid + period; i < values.length; i++) {
    const value = values[i]
    const prev = out[i - 1]
    if (value == null || prev == null) {
      out[i] = null
      continue
    }
    out[i] = value * k + prev * (1 - k)
  }
  return out
}

function rsiSeries(values: (number | null)[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null)
  if (period < 1) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period && i < values.length; i++) {
    const prev = values[i - 1]
    const cur = values[i]
    if (prev == null || cur == null) return out
    const delta = cur - prev
    if (delta >= 0) gain += delta
    else loss -= delta
  }
  if (values.length <= period) return out
  gain /= period
  loss /= period
  const write = (at: number): void => {
    out[at] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  }
  write(period)
  for (let i = period + 1; i < values.length; i++) {
    const prev = values[i - 1]
    const cur = values[i]
    if (prev == null || cur == null) break
    const delta = cur - prev
    const up = delta > 0 ? delta : 0
    const down = delta < 0 ? -delta : 0
    gain = (gain * (period - 1) + up) / period
    loss = (loss * (period - 1) + down) / period
    write(i)
  }
  return out
}

function atrSeries(candles: Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(candles.length).fill(null)
  if (period < 1 || candles.length < period) return out
  const tr = (i: number): number => {
    if (i === 0) return candles[0].high - candles[0].low
    const prev = candles[i - 1].close
    return Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prev),
      Math.abs(candles[i].low - prev)
    )
  }
  let atr = 0
  for (let i = 0; i < period; i++) atr += tr(i)
  atr /= period
  out[period - 1] = atr
  for (let i = period; i < candles.length; i++) {
    atr = (atr * (period - 1) + tr(i)) / period
    out[i] = atr
  }
  return out
}

function vwapSeries(candles: Candle[]): number[] {
  const out: number[] = Array(candles.length)
  let pv = 0
  let vol = 0
  for (let i = 0; i < candles.length; i++) {
    const typical = (candles[i].high + candles[i].low + candles[i].close) / 3
    const volume = candles[i].volume ?? 0
    pv += typical * volume
    vol += volume
    out[i] = vol === 0 ? typical : pv / vol
  }
  return out
}

function highestSeries(values: (number | null)[], period: number): (number | null)[] {
  const n = values.length
  const out: (number | null)[] = Array(n).fill(null)
  if (period < 1) return out
  const deque: number[] = []
  for (let i = 0; i < n; i++) {
    while (deque.length > 0 && deque[0] <= i - period) {
      deque.shift()
    }
    const val = values[i]
    if (val != null) {
      while (deque.length > 0 && (values[deque[deque.length - 1]] ?? -Infinity) <= val) {
        deque.pop()
      }
      deque.push(i)
    }
    out[i] = deque.length > 0 ? (values[deque[0]] ?? null) : null
  }
  return out
}

function lowestSeries(values: (number | null)[], period: number): (number | null)[] {
  const n = values.length
  const out: (number | null)[] = Array(n).fill(null)
  if (period < 1) return out
  const deque: number[] = []
  for (let i = 0; i < n; i++) {
    while (deque.length > 0 && deque[0] <= i - period) {
      deque.shift()
    }
    const val = values[i]
    if (val != null) {
      while (deque.length > 0 && (values[deque[deque.length - 1]] ?? Infinity) >= val) {
        deque.pop()
      }
      deque.push(i)
    }
    out[i] = deque.length > 0 ? (values[deque[0]] ?? null) : null
  }
  return out
}

function stdevSeries(values: (number | null)[], period: number): (number | null)[] {
  const n = values.length
  const out: (number | null)[] = Array(n).fill(null)
  if (period < 1 || n < period) return out
  for (let i = period - 1; i < n; i++) {
    let sum = 0
    let count = 0
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j]
      if (v == null) {
        count = -1
        break
      }
      sum += v
      count++
    }
    if (count !== period) continue
    const mean = sum / period
    let sumSqDiff = 0
    for (let j = i - period + 1; j <= i; j++) {
      const diff = (values[j] as number) - mean
      sumSqDiff += diff * diff
    }
    out[i] = Math.sqrt(sumSqDiff / period)
  }
  return out
}

function rmaSeries(values: (number | null)[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null)
  if (period < 1 || values.length < period) return out
  let sum = 0
  for (let i = 0; i < period; i++) {
    const v = values[i]
    if (v == null) return out
    sum += v
  }
  out[period - 1] = sum / period
  const alpha = 1 / period
  for (let i = period; i < values.length; i++) {
    const v = values[i]
    const prev = out[i - 1]
    if (v == null || prev == null) {
      out[i] = null
      continue
    }
    out[i] = alpha * v + (1 - alpha) * prev
  }
  return out
}

function wmaSeries(values: (number | null)[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null)
  if (period < 1 || values.length < period) return out
  const norm = (period * (period + 1)) / 2
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0
    let valid = true
    for (let k = 0; k < period; k++) {
      const v = values[i - period + 1 + k]
      if (v == null) {
        valid = false
        break
      }
      sum += v * (k + 1)
    }
    if (valid) out[i] = sum / norm
  }
  return out
}

function macdSeries(
  values: (number | null)[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): { macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[] } {
  const fast = emaSeries(values, fastPeriod)
  const slow = emaSeries(values, slowPeriod)
  const macd: (number | null)[] = Array(values.length).fill(null)
  for (let i = 0; i < values.length; i++) {
    const f = fast[i]
    const s = slow[i]
    macd[i] = f != null && s != null ? f - s : null
  }
  const signal = emaSeries(macd, signalPeriod)
  const hist: (number | null)[] = Array(values.length).fill(null)
  for (let i = 0; i < values.length; i++) {
    const m = macd[i]
    const sig = signal[i]
    hist[i] = m != null && sig != null ? m - sig : null
  }
  return { macd, signal, hist }
}

function supertrendSeries(
  candles: Candle[],
  factor = 3.0,
  atrPeriod = 10
): { supertrend: (number | null)[]; direction: (number | null)[] } {
  const n = candles.length
  const st: (number | null)[] = Array(n).fill(null)
  const dir: (number | null)[] = Array(n).fill(null)
  if (n === 0) return { supertrend: st, direction: dir }
  const atr = atrSeries(candles, atrPeriod)
  let prevUpper = 0
  let prevLower = 0
  let prevClose = 0
  let prevDir = 1

  for (let i = 0; i < n; i++) {
    const candle = candles[i]
    const currentAtr = atr[i]
    if (currentAtr == null) continue

    const hl2 = (candle.high + candle.low) / 2
    const basicUpper = hl2 + factor * currentAtr
    const basicLower = hl2 - factor * currentAtr

    if (i === 0 || atr[i - 1] == null) {
      prevUpper = basicUpper
      prevLower = basicLower
      prevClose = candle.close
      prevDir = 1
      st[i] = basicUpper
      dir[i] = prevDir
      continue
    }

    const finalUpper = basicUpper < prevUpper || prevClose > prevUpper ? basicUpper : prevUpper
    const finalLower = basicLower > prevLower || prevClose < prevLower ? basicLower : prevLower

    let currentDir: number
    if (prevDir === -1) {
      currentDir = candle.close < finalLower ? 1 : -1
    } else {
      currentDir = candle.close > finalUpper ? -1 : 1
    }

    const currentSupertrend = currentDir === -1 ? finalLower : finalUpper

    st[i] = currentSupertrend
    dir[i] = currentDir

    prevUpper = finalUpper
    prevLower = finalLower
    prevClose = candle.close
    prevDir = currentDir
  }
  return { supertrend: st, direction: dir }
}

