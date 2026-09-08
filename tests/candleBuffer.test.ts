import { describe, expect, it } from 'vitest'
import { fromCandleBuffer, toCandleBuffer } from '@shared/candleBuffer'
import { series } from './helpers'

describe('candle buffer codec', () => {
  it('round-trips candles through a typed-array buffer unchanged', () => {
    const start = Date.UTC(2025, 5, 10, 8, 0, 0)
    const candles = series(start, 60_000, [98, 99, 100, 101, 102, 100.5])

    const buffer = toCandleBuffer(candles)
    expect(buffer.length).toBe(candles.length)
    expect(buffer.timestamp).toBeInstanceOf(Float64Array)

    const restored = fromCandleBuffer(buffer)
    expect(restored).toEqual(candles)
  })

  it('defaults a missing volume to 0 instead of dropping the field', () => {
    const candle = { timestamp: 1, open: 1, high: 2, low: 0.5, close: 1.5 }
    const restored = fromCandleBuffer(toCandleBuffer([candle]))
    expect(restored[0].volume).toBe(0)
  })

  it('handles an empty tape', () => {
    const buffer = toCandleBuffer([])
    expect(buffer.length).toBe(0)
    expect(fromCandleBuffer(buffer)).toEqual([])
  })
})
