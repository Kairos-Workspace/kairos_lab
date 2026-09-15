import { describe, expect, it } from 'vitest'
import { parseEaScript } from '@core/ea/parse'
import { checkProgram } from '@core/ea/check'

describe('checkProgram', () => {
  it('requires OnTick', () => {
    const parsed = parseEaScript('void OnInit() {}')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const diagnostics = checkProgram(parsed.program)
    expect(diagnostics.some((d) => /OnTick/i.test(d.message))).toBe(true)
  })

  it('rejects unknown identifiers', () => {
    const parsed = parseEaScript('void OnTick() { Buy(foo); }')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const diagnostics = checkProgram(parsed.program)
    expect(diagnostics.some((d) => /foo/i.test(d.message))).toBe(true)
  })

  it('rejects Buy outside OnTick', () => {
    const parsed = parseEaScript('void OnInit() { Buy(); }\nvoid OnTick() {}')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const diagnostics = checkProgram(parsed.program)
    expect(diagnostics.some((d) => /Buy/i.test(d.message))).toBe(true)
  })

  it('does not expose block locals outside their block', () => {
    const parsed = parseEaScript(
      'void OnTick() { if (true) { int temporary = 1; } temporary = 2; }'
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const diagnostics = checkProgram(parsed.program)
    expect(diagnostics.some((d) => /temporary/i.test(d.message))).toBe(true)
  })

  it('accepts the SMA-cross sample', () => {
    const code = `input int Fast = 9;
input int Slow = 21;
void OnTick() {
  double f = SMA(Fast, 0);
  double s = SMA(Slow, 0);
  if (crossesAbove(f, s)) Buy("up");
  if (crossesBelow(f, s)) Sell("down");
}`
    const parsed = parseEaScript(code)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(checkProgram(parsed.program)).toEqual([])
  })
})
