export interface Span {
  line: number
  column: number
  length: number
}

export type EaType = 'int' | 'double' | 'bool' | 'void' | 'string'

export interface Program {
  inputs: InputDecl[]
  globals: VarDecl[]
  onInit: FunctionDecl | null
  onTick: FunctionDecl | null
}

export interface InputDecl {
  kind: 'input'
  name: string
  type: 'int' | 'double' | 'bool'
  defaultValue: number | boolean
  span: Span
}

export interface VarDecl {
  kind: 'var'
  name: string
  type: 'int' | 'double' | 'bool'
  init: Expr | null
  span: Span
}

export interface FunctionDecl {
  name: 'OnInit' | 'OnTick'
  body: Stmt[]
  span: Span
}

export type Stmt =
  | { kind: 'var'; name: string; type: 'int' | 'double' | 'bool'; init: Expr | null; span: Span }
  | { kind: 'assign'; name: string; value: Expr; span: Span }
  | { kind: 'if'; test: Expr; consequent: Stmt[]; alternate: Stmt[] | null; span: Span }
  | { kind: 'return'; span: Span }
  | { kind: 'expr'; expr: Expr; span: Span }

export type Expr =
  | { kind: 'number'; value: number; span: Span }
  | { kind: 'bool'; value: boolean; span: Span }
  | { kind: 'string'; value: string; span: Span }
  | { kind: 'ident'; name: string; span: Span }
  | { kind: 'series'; series: 'open' | 'high' | 'low' | 'close' | 'time'; index: Expr; span: Span }
  | { kind: 'call'; callee: string; args: Expr[]; span: Span; callSiteId: number }
  | { kind: 'unary'; op: '-' | '!'; arg: Expr; span: Span }
  | { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr; span: Span }

export type BinaryOp =
  | '+'
  | '-'
  | '*'
  | '/'
  | '<'
  | '<='
  | '>'
  | '>='
  | '=='
  | '!='
  | '&&'
  | '||'
