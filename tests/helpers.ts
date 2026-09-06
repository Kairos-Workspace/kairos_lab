import type { Candle } from '@shared/types'

export function candle(
  timestamp: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 100
): Candle {
  return { timestamp, open, high, low, close, volume }
}

export function series(start: number, intervalMs: number, closes: number[]): Candle[] {
  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1]
    const high = Math.max(open, close) + 0.5
    const low = Math.min(open, close) - 0.5
    return candle(start + i * intervalMs, open, high, low, close)
  })
}
