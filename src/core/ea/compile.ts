import { checkProgram } from './check'
import { parseEaScript } from './parse'
import { EaSignalStrategy } from './strategyAdapter'
import type { CompileResult, EaInputParam } from './types'

export function compileEaScript(
  code: string,
  opts?: { id?: string; name?: string }
): CompileResult {
  const parsed = parseEaScript(code)
  if (!parsed.ok) return { ok: false, diagnostics: parsed.diagnostics }

  const diagnostics = checkProgram(parsed.program)
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { ok: false, diagnostics }
  }

  const inputs: EaInputParam[] = parsed.program.inputs.map((input) => ({
    name: input.name,
    type: input.type,
    defaultValue: input.defaultValue
  }))
  const strategy = new EaSignalStrategy(parsed.program, {
    id: opts?.id ?? 'ea-signal',
    name: opts?.name ?? 'EA',
    inputs
  })

  return {
    ok: true,
    strategy,
    inputs,
    warnings: diagnostics.filter((diagnostic) => diagnostic.severity === 'warning')
  }
}
