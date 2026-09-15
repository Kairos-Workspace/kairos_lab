import type { Strategy } from '@shared/types'

export interface Diagnostic {
  severity: 'error' | 'warning'
  message: string
  line: number
  column: number
  length?: number
}

export interface EaInputParam {
  name: string
  type: 'int' | 'double' | 'bool'
  defaultValue: number | boolean
}

export type CompileResult =
  | { ok: true; strategy: Strategy; inputs: EaInputParam[]; warnings: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] }
