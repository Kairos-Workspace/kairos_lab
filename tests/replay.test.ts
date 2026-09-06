import { describe, expect, it } from 'vitest'
import { ReplayEngine } from '@core/replay/engine'
import { series } from './helpers'

const MIN = 60_000
const start = Date.UTC(2025, 5, 10, 8, 0, 0)
const candles = series(start, MIN, [100, 101, 102, 103, 104, 105, 106, 107, 108, 109])

describe('ReplayEngine', () => {
  it('exposes only candles up to the current index', () => {
    const engine = new ReplayEngine(candles)
    engine.jumpToIndex(4)
    const visible = engine.visibleCandles()
    expect(visible).toHaveLength(5)
    expect(visible[4].close).toBe(104)
    expect(visible.at(-1)?.timestamp).toBe(candles[4].timestamp)
  })

  it('never includes future candles after stepping', () => {
    const engine = new ReplayEngine(candles)
    engine.jumpToIndex(2)
    engine.step(2)
    const visible = engine.visibleCandles()
    expect(visible).toHaveLength(5)
    expect(visible.some((c) => c.close === 109)).toBe(false)
    expect(engine.futureCandles()).toHaveLength(5)
  })

  it('does not step past the last candle', () => {
    const engine = new ReplayEngine(candles)
    engine.jumpToIndex(9)
    const moved = engine.step(5)
    expect(moved).toBe(0)
    expect(engine.index).toBe(9)
    expect(engine.isAtEnd()).toBe(true)
  })

  it('steps backward without going below warmup', () => {
    const engine = new ReplayEngine(candles, { warmup: 2 })
    engine.jumpToIndex(5)
    engine.step(-3)
    expect(engine.index).toBe(2)
    engine.step(-10)
    expect(engine.index).toBe(2)
  })

  it('maps a timestamp onto the containing bar when the timeframe changes', () => {
    const engine = new ReplayEngine(candles)
    engine.jumpToIndex(6)
    const ts = engine.currentTimestamp()
    const higher = series(start, 5 * MIN, [100, 105])
    const mapped = ReplayEngine.mapTimestampToIndex(higher, ts)
    expect(mapped).toBe(1)
  })

  it('picks a random start at or after warmup', () => {
    const engine = new ReplayEngine(candles, { warmup: 3 })
    const index = engine.randomStart((): number => 0.5)
    expect(index).toBeGreaterThanOrEqual(3)
    expect(index).toBeLessThan(candles.length)
  })
})
