import { describe, expect, it } from 'vitest'
import { buildCandleFormPath, formFrameCount } from '@core/candles/formPath'
import type { Candle } from '@shared/types'

function bar(partial: Partial<Candle> & Pick<Candle, 'open' | 'high' | 'low' | 'close'>): Candle {
  return {
    timestamp: 1_000_000,
    volume: 1,
    ...partial
  }
}

describe('buildCandleFormPath', () => {
  it('synthesizes a growing tip that ends on the real OHLC', () => {
    const target = bar({ open: 100, high: 110, low: 95, close: 108 })
    const frames = buildCandleFormPath(target, [], 8)
    expect(frames.length).toBe(8)
    expect(frames[0]?.open).toBe(100)
    expect(frames[0]?.close).toBe(100)
    expect(frames.at(-1)).toEqual(target)
    for (const frame of frames) {
      expect(frame.high).toBeGreaterThanOrEqual(frame.low)
      expect(frame.high).toBeGreaterThanOrEqual(Math.max(frame.open, frame.close))
      expect(frame.low).toBeLessThanOrEqual(Math.min(frame.open, frame.close))
      expect(frame.timestamp).toBe(target.timestamp)
    }
  })

  it('builds from lower-timeframe ticks when available', () => {
    const target = bar({ open: 10, high: 16, low: 9, close: 15 })
    const ticks = [
      bar({ timestamp: 1, open: 10, high: 11, low: 10, close: 11 }),
      bar({ timestamp: 2, open: 11, high: 12, low: 9, close: 9.5 }),
      bar({ timestamp: 3, open: 9.5, high: 16, low: 9.5, close: 15 })
    ]
    const frames = buildCandleFormPath(target, ticks, 4)
    expect(frames.length).toBeGreaterThanOrEqual(2)
    expect(frames[0]?.open).toBe(10)
    expect(frames.at(-1)?.close).toBe(15)
    expect(frames.at(-1)?.high).toBe(16)
    expect(frames.at(-1)?.low).toBe(9)
  })
})

describe('formFrameCount', () => {
  it('scales frames with the play interval', () => {
    expect(formFrameCount(48)).toBe(3)
    expect(formFrameCount(120)).toBe(8)
    expect(formFrameCount(420)).toBeGreaterThanOrEqual(8)
  })
})
