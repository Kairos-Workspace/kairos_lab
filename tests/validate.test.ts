import { describe, expect, it } from 'vitest'
import { validateCandles } from '@core/candles/validate'
import { candle } from './helpers'

const MIN = 60_000
const start = Date.UTC(2025, 5, 10, 8, 0, 0)

describe('validateCandles', () => {
  it('accepts a clean sequential series', () => {
    const bars = [
      candle(start, 100, 101, 99, 100.5),
      candle(start + MIN, 100.5, 102, 100, 101)
    ]
    const report = validateCandles(bars, MIN)
    expect(report.valid).toBe(true)
    expect(report.duplicates).toBe(0)
    expect(report.gaps).toHaveLength(0)
  })

  it('flags duplicate timestamps', () => {
    const bars = [
      candle(start, 100, 101, 99, 100),
      candle(start, 101, 102, 100, 101)
    ]
    const report = validateCandles(bars, MIN)
    expect(report.duplicates).toBe(1)
    expect(report.valid).toBe(false)
  })

  it('flags invalid OHLC where high is below close', () => {
    const bars = [candle(start, 100, 99, 98, 100)]
    const report = validateCandles(bars, MIN)
    expect(report.invalidOhlc).toBe(1)
    expect(report.valid).toBe(false)
  })

  it('detects a missing-bar gap', () => {
    const bars = [
      candle(start, 100, 101, 99, 100),
      candle(start + 3 * MIN, 100, 101, 99, 100)
    ]
    const report = validateCandles(bars, MIN)
    expect(report.gaps).toHaveLength(1)
    expect(report.gaps[0].fromTs).toBe(start)
    expect(report.gaps[0].toTs).toBe(start + 3 * MIN)
    expect(report.gaps[0].expectedBars).toBe(2)
  })
})
