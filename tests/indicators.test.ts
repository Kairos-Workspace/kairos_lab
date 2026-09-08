import { describe, expect, it } from 'vitest'
import { strategyIndicatorLines } from '@core/indicators/overlay'
import { DEFAULT_STRATEGY_SETTINGS } from '@shared/constants'
import { series } from './helpers'

const start = Date.UTC(2025, 5, 10, 8, 0, 0)
const MIN = 60_000
const bars = series(start, MIN, [98, 99, 100, 101, 102, 100.5])

describe('strategyIndicatorLines', () => {
  it('plots BB plus MA50 and MA5/MA10 high-low', () => {
    const lines = strategyIndicatorLines(
      { ...DEFAULT_STRATEGY_SETTINGS, strategyId: 'bbma', lookback: 5 },
      bars
    )
    expect(lines.map((line) => line.id)).toEqual([
      'bb-upper',
      'bb-lower',
      'ma50',
      'ma5-high',
      'ma5-low',
      'ma10-high',
      'ma10-low'
    ])
    const upper = lines.find((line) => line.id === 'bb-upper')?.points.at(-1)
    expect(upper?.timestamp).toBe(bars[5].timestamp)
    expect(upper?.value).toBeGreaterThan(100)
  })

  it('plots both SMAs for MA crossover', () => {
    const lines = strategyIndicatorLines(
      { ...DEFAULT_STRATEGY_SETTINGS, strategyId: 'ma-crossover', lookback: 4 },
      bars
    )
    expect(lines.map((line) => line.id)).toEqual(['sma-fast', 'sma-slow'])
    const slow = lines.find((line) => line.id === 'sma-slow')?.points.at(-1)
    expect(slow?.value).toBeCloseTo((100 + 101 + 102 + 100.5) / 4)
  })

  it('plots lookback high and low for breakout', () => {
    const lines = strategyIndicatorLines(
      { ...DEFAULT_STRATEGY_SETTINGS, strategyId: 'breakout', lookback: 3 },
      bars
    )
    expect(lines.map((line) => line.id)).toEqual(['break-high', 'break-low'])
    const high = lines.find((line) => line.id === 'break-high')?.points.at(-1)
    expect(high?.value).toBe(Math.max(bars[2].high, bars[3].high, bars[4].high))
  })

  it('stays fast on large tapes instead of scanning full history per bar', () => {
    const bigBars = series(start, MIN, Array.from({ length: 40_000 }, (_, i) => 100 + (i % 50)))
    const t0 = performance.now()
    strategyIndicatorLines({ ...DEFAULT_STRATEGY_SETTINGS, strategyId: 'bbma', lookback: 20 }, bigBars)
    strategyIndicatorLines(
      { ...DEFAULT_STRATEGY_SETTINGS, strategyId: 'ma-crossover', lookback: 20 },
      bigBars
    )
    const elapsed = performance.now() - t0
    expect(elapsed).toBeLessThan(2000)
  })
})
