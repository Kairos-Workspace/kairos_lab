import type { Candle } from './types'

export interface CandleBuffer {
  length: number
  timestamp: Float64Array
  open: Float64Array
  high: Float64Array
  low: Float64Array
  close: Float64Array
  volume: Float64Array
}

export function toCandleBuffer(candles: Candle[]): CandleBuffer {
  const length = candles.length
  const timestamp = new Float64Array(length)
  const open = new Float64Array(length)
  const high = new Float64Array(length)
  const low = new Float64Array(length)
  const close = new Float64Array(length)
  const volume = new Float64Array(length)
  for (let i = 0; i < length; i++) {
    const c = candles[i]
    timestamp[i] = c.timestamp
    open[i] = c.open
    high[i] = c.high
    low[i] = c.low
    close[i] = c.close
    volume[i] = c.volume ?? 0
  }
  return { length, timestamp, open, high, low, close, volume }
}

export function fromCandleBuffer(buffer: CandleBuffer): Candle[] {
  const { length, timestamp, open, high, low, close, volume } = buffer
  const candles: Candle[] = new Array(length)
  for (let i = 0; i < length; i++) {
    candles[i] = {
      timestamp: timestamp[i],
      open: open[i],
      high: high[i],
      low: low[i],
      close: close[i],
      volume: volume[i]
    }
  }
  return candles
}
