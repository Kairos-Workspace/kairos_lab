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
  let strategy: EaSignalStrategy
  try {
    strategy = new EaSignalStrategy(parsed.program, {
      id: opts?.id ?? 'ea-signal',
      name: opts?.name ?? 'EA',
      inputs
    })
    strategy.initialize()
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{
        severity: 'error',
        message: `Initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        line: parsed.program.onInit?.span.line ?? 1,
        column: 1
      }]
    }
  }

  return {
    ok: true,
    strategy,
    inputs,
    warnings: diagnostics.filter((diagnostic) => diagnostic.severity === 'warning')
  }
}
