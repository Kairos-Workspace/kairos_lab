import { describe, expect, it } from 'vitest'
import { intervalMs, resample } from '@core/candles/resample'
import { candle } from './helpers'

const MIN = 60_000

describe('resample', () => {
  it('maps timeframe labels to millisecond intervals', () => {
    expect(intervalMs('1M')).toBe(60_000)
    expect(intervalMs('5M')).toBe(5 * 60_000)
    expect(intervalMs('1H')).toBe(60 * 60_000)
    expect(intervalMs('1D')).toBe(24 * 60 * 60_000)
  })

  it('aggregates five 1-minute candles into one 5-minute bar', () => {
    const start = Date.UTC(2025, 5, 10, 8, 0, 0)
    const m1 = [
      candle(start + 0 * MIN, 100, 101, 99, 100.5, 10),
      candle(start + 1 * MIN, 100.5, 102, 100, 101, 20),
      candle(start + 2 * MIN, 101, 103, 100.5, 102, 15),
      candle(start + 3 * MIN, 102, 102.5, 101, 101.5, 5),
      candle(start + 4 * MIN, 101.5, 102, 101, 101.2, 8)
    ]

    const htf = resample(m1, '5M')
    expect(htf).toHaveLength(1)
    expect(htf[0].timestamp).toBe(start)
    expect(htf[0].open).toBe(100)
    expect(htf[0].high).toBe(103)
    expect(htf[0].low).toBe(99)
    expect(htf[0].close).toBe(101.2)
    expect(htf[0].volume).toBe(58)
  })

  it('does not leak a later bar into an earlier bucket', () => {
    const start = Date.UTC(2025, 5, 10, 8, 0, 0)
    const m1 = [
      candle(start, 100, 101, 99, 100),
      candle(start + 4 * MIN, 100, 101, 99, 101),
      candle(start + 5 * MIN, 200, 201, 199, 200)
    ]
    const htf = resample(m1, '5M')
    expect(htf).toHaveLength(2)
    expect(htf[0].close).toBe(101)
    expect(htf[1].open).toBe(200)
    expect(htf[1].timestamp).toBe(start + 5 * MIN)
  })

  it('returns a copy when source already matches the target timeframe', () => {
    const start = Date.UTC(2025, 5, 10, 8, 0, 0)
    const bars = [candle(start, 1, 2, 0, 1.5)]
    const out = resample(bars, '1M')
    expect(out).toEqual(bars)
    expect(out).not.toBe(bars)
  })
})
