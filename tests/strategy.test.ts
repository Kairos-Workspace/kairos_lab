import { describe, expect, it } from 'vitest'
import { BreakoutStrategy } from '@core/strategy/breakout'
import { MaCrossoverStrategy } from '@core/strategy/ma-crossover'
import { BbmaStrategy } from '@core/strategy/bbma'
import { NoneStrategy } from '@core/strategy/none'
import { createStrategy } from '@core/strategy/registry'
import { DEFAULT_STRATEGY_SETTINGS } from '@shared/constants'
import { candle } from './helpers'
import type { StrategyContext } from '@shared/types'

const MIN = 60_000
const start = Date.UTC(2025, 5, 10, 8, 0, 0)

function ctx(bars: ReturnType<typeof candle>[]): StrategyContext {
  return { candles: bars, symbol: 'XAUUSD', timeframe: '5M' }
}

describe('BreakoutStrategy', () => {
  it('emits a long when close breaks the lookback high', () => {
    const strategy = new BreakoutStrategy({ lookback: 3 })
    strategy.initialize()
    const bars = [
      candle(start, 100, 101, 99, 100),
      candle(start + MIN, 100, 102, 99, 101),
      candle(start + 2 * MIN, 101, 103, 100, 102),
      candle(start + 3 * MIN, 102, 110, 102, 109)
    ]
    let signal = null
    for (let i = 0; i < bars.length; i++) {
      signal = strategy.onCandle(bars[i], ctx(bars.slice(0, i + 1)))
    }
    expect(signal?.type).toBe('LONG')
    expect(signal?.price).toBe(109)
  })

  it('does not see bars beyond the provided context', () => {
    const strategy = new BreakoutStrategy({ lookback: 2 })
    strategy.initialize()
    const visible = [
      candle(start, 100, 101, 99, 100),
      candle(start + MIN, 100, 101, 99, 100.2)
    ]
    const signal = strategy.onCandle(visible[1], ctx(visible))
    expect(signal).toBeNull()
  })
})

describe('MaCrossoverStrategy', () => {
  it('emits a long on a fast-over-slow cross', () => {
    const strategy = new MaCrossoverStrategy({ fast: 2, slow: 4 })
    strategy.initialize()
    const closes = [10, 10, 10, 10, 11, 13, 15]
    const bars = closes.map((c, i) => candle(start + i * MIN, c - 0.2, c + 0.2, c - 0.4, c))
    let signal = null
    for (let i = 0; i < bars.length; i++) {
      const next = strategy.onCandle(bars[i], ctx(bars.slice(0, i + 1)))
      if (next) signal = next
    }
    expect(signal?.type).toBe('LONG')
  })
})

describe('BbmaStrategy', () => {
  const cfg = { bbPeriod: 5, stdDev: 2, ma50: 5, maFast: 2, maSlow: 3 }

  function feed(
    strategy: BbmaStrategy,
    bars: ReturnType<typeof candle>[]
  ): ReturnType<BbmaStrategy['onCandle']> {
    let signal = null
    for (let i = 0; i < bars.length; i++) {
      const next = strategy.onCandle(bars[i], ctx(bars.slice(0, i + 1)))
      if (next) signal = next
    }
    return signal
  }

  it('emits a long when price re-enters MA5/MA10 lows after a lower extreme', () => {
    const strategy = new BbmaStrategy(cfg)
    strategy.initialize()
    const base = [98, 99, 100, 101, 102].map((c, i) =>
      candle(start + i * MIN, c, c + 0.5, c - 0.5, c)
    )
    const extreme = candle(start + 5 * MIN, 96, 96.2, 94, 95.5)
    const reentry = candle(start + 6 * MIN, 96.5, 100.4, 96.2, 98.8)
    const signal = feed(strategy, [...base, extreme, reentry])
    expect(signal?.type).toBe('LONG')
    expect(signal?.price).toBe(98.8)
  })

  it('does not fire a long until the MA5/MA10 low zone is tagged', () => {
    const strategy = new BbmaStrategy(cfg)
    strategy.initialize()
    const base = [98, 99, 100, 101, 102].map((c, i) =>
      candle(start + i * MIN, c, c + 0.5, c - 0.5, c)
    )
    const extreme = candle(start + 5 * MIN, 96, 96.2, 94, 95.5)
    const insideOnly = candle(start + 6 * MIN, 95.8, 96.4, 95.6, 96.2)
    const signal = feed(strategy, [...base, extreme, insideOnly])
    expect(signal).toBeNull()
  })

  it('emits a short when price re-enters MA5/MA10 highs after an upper extreme', () => {
    const strategy = new BbmaStrategy(cfg)
    strategy.initialize()
    const base = [98, 99, 100, 101, 102].map((c, i) =>
      candle(start + i * MIN, c, c + 0.5, c - 0.5, c)
    )
    const extreme = candle(start + 5 * MIN, 105, 106, 104.8, 105.5)
    const reentry = candle(start + 6 * MIN, 104.5, 104.8, 99.6, 102.2)
    const signal = feed(strategy, [...base, extreme, reentry])
    expect(signal?.type).toBe('SHORT')
    expect(signal?.price).toBe(102.2)
  })

  it('stays quiet while price holds inside the bands', () => {
    const strategy = new BbmaStrategy(cfg)
    strategy.initialize()
    const bars = [98, 99, 100, 101, 102, 100.5, 99.8].map((c, i) =>
      candle(start + i * MIN, c, c + 0.4, c - 0.4, c)
    )
    expect(feed(strategy, bars)).toBeNull()
  })

  it('clears an armed extreme on initialize', () => {
    const strategy = new BbmaStrategy(cfg)
    strategy.initialize()
    const setup = [
      ...[98, 99, 100, 101, 102].map((c, i) => candle(start + i * MIN, c, c + 0.5, c - 0.5, c)),
      candle(start + 5 * MIN, 96, 96.2, 94, 95.5)
    ]
    feed(strategy, setup)
    strategy.initialize()
    const reentry = candle(start + 6 * MIN, 96.5, 100.4, 96.2, 98.8)
    expect(strategy.onCandle(reentry, ctx([...setup, reentry]))).toBeNull()
  })
})

describe('NoneStrategy', () => {
  it('never emits a signal, no matter what the candles look like', () => {
    const strategy = new NoneStrategy()
    strategy.initialize()
    const bars = [
      candle(start, 100, 101, 99, 100),
      candle(start + MIN, 100, 110, 90, 109),
      candle(start + 2 * MIN, 109, 120, 80, 81)
    ]
    let signal = null
    for (let i = 0; i < bars.length; i++) {
      signal = strategy.onCandle(bars[i], ctx(bars.slice(0, i + 1)))
    }
    expect(signal).toBeNull()
  })
})

describe('createStrategy', () => {
  it('builds the BBMA engine from settings', () => {
    const strategy = createStrategy({ ...DEFAULT_STRATEGY_SETTINGS, strategyId: 'bbma', lookback: 20 })
    expect(strategy.id).toBe('bbma')
  })

  it('builds the None engine from settings instead of falling back to Breakout', () => {
    const strategy = createStrategy({ ...DEFAULT_STRATEGY_SETTINGS, strategyId: 'none' })
    expect(strategy.id).toBe('none')
  })
})
