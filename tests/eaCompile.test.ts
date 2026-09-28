import { describe, expect, it } from 'vitest'
import { compileEaScript } from '@core/ea/compile'
import type { Candle } from '@shared/types'
import { EA_LOCAL_EXAMPLE } from '@shared/eaLanguage'
import { chatSystemRole } from '@shared/scriptLab'

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
  it('compiles the example supplied to the AI and emits a signal', () => {
    expect(chatSystemRole('ea', 'mql5')).toContain(EA_LOCAL_EXAMPLE)
    const compiled = compileEaScript(EA_LOCAL_EXAMPLE)
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) return
    const tape = Array.from({ length: 51 }, (_, i) => candle(i, i === 50 ? 2 : 1))
    compiled.strategy.initialize()
    expect(compiled.strategy.onCandle(tape[49], {
      candles: tape.slice(0, 50), symbol: 'XAUUSD', timeframe: '1M'
    })).toBeNull()
    expect(compiled.strategy.onCandle(tape[50], {
      candles: tape, symbol: 'XAUUSD', timeframe: '1M'
    })?.type).toBe('LONG')
  })

  it.each([
    'double value = SMA(0); void OnTick() {}',
    'void OnInit() { double value = SMA(0); } void OnTick() {}'
  ])('returns diagnostics rather than throwing for initialization errors', (code) => {
    const compiled = compileEaScript(code)
    expect(compiled.ok).toBe(false)
    if (compiled.ok) return
    expect(compiled.diagnostics[0].message).toContain('Initialization failed: Indicator period must be positive')
  })

  it('rolls back global state after a runtime error', () => {
    const compiled = compileEaScript(`int count = 0;
      void OnTick() {
        count = count + 1;
        if (close[0] == 1) Buy(123);
        if (count == 1) Buy("rolled back");
      }`)
    if (!compiled.ok) throw new Error('Expected compilation to succeed')
    const tape = [candle(0, 1), candle(1, 2)]
    expect(() => compiled.strategy.onCandle(tape[0], {
      candles: tape.slice(0, 1), symbol: 'XAUUSD', timeframe: '1M'
    })).toThrow('Buy reason must be a string')
    expect(compiled.strategy.onCandle(tape[1], {
      candles: tape, symbol: 'XAUUSD', timeframe: '1M'
    })?.reason).toBe('rolled back')
  })

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
