import { describe, expect, it } from 'vitest'
import { compileEaScript } from '@core/ea/compile'
import type { Candle } from '@shared/types'

function candle(i: number, close: number): Candle {
  return {
    timestamp: i * 60_000,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1
  }
}

const SAMPLE = `input int Fast = 2;
input int Slow = 4;
void OnTick() {
  double f = SMA(Fast, 0);
  double s = SMA(Slow, 0);
  if (crossesAbove(f, s)) Buy("up");
  if (crossesBelow(f, s)) Sell("down");
}`

describe('compileEaScript', () => {
  it('returns diagnostics for bad code', () => {
    const result = compileEaScript('void OnInit() {}')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('emits LONG after fast crosses above slow', () => {
    const result = compileEaScript(SAMPLE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const strategy = result.strategy
    strategy.initialize()
    const closes = [1, 1, 1, 1, 2, 3, 4, 5]
    let signal = null
    for (let i = 0; i < closes.length; i++) {
      const tape = closes.slice(0, i + 1).map((c, idx) => candle(idx, c))
      signal = strategy.onCandle(tape[tape.length - 1], {
        candles: tape,
        symbol: 'XAUUSD',
        timeframe: '1M'
      })
      if (signal) break
    }
    expect(signal).not.toBeNull()
    expect(signal?.type).toBe('LONG')
  })
})
