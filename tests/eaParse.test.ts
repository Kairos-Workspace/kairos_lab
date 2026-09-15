import { describe, expect, it } from 'vitest'
import { parseEaScript } from '@core/ea/parse'

const SAMPLE = `input int Fast = 9;
input int Slow = 21;

void OnInit()
{
}

void OnTick()
{
  double f = SMA(Fast, 0);
  double s = SMA(Slow, 0);
  if (crossesAbove(f, s))
    Buy("SMA cross up");
  if (crossesBelow(f, s))
    Sell("SMA cross down");
}
`

describe('parseEaScript', () => {
  it('parses the SMA-cross sample', () => {
    const result = parseEaScript(SAMPLE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.program.inputs).toHaveLength(2)
    expect(result.program.onTick).not.toBeNull()
    expect(result.program.onInit).not.toBeNull()
  })

  it('reports a syntax error with line/column', () => {
    const result = parseEaScript('void OnTick() { double x = ; }')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.diagnostics[0].line).toBeGreaterThanOrEqual(1)
    expect(result.diagnostics[0].message.length).toBeGreaterThan(0)
  })

  it('rejects unknown top-level junk', () => {
    const result = parseEaScript('class Foo {}')
    expect(result.ok).toBe(false)
  })
})
