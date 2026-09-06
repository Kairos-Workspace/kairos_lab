import { TIMEFRAME_MINUTES } from '@shared/constants'
import type { Candle, Timeframe } from '@shared/types'

export function intervalMs(timeframe: Timeframe): number {
  return TIMEFRAME_MINUTES[timeframe] * 60_000
}

export function bucketStart(timestamp: number, timeframe: Timeframe): number {
  const size = intervalMs(timeframe)
  return Math.floor(timestamp / size) * size
}

export function resample(candles: Candle[], timeframe: Timeframe): Candle[] {
  if (candles.length === 0) return []
  if (timeframe === '1M') return candles.map((c) => ({ ...c }))

  const size = intervalMs(timeframe)
  const groups = new Map<number, Candle[]>()

  for (const bar of candles) {
    const key = Math.floor(bar.timestamp / size) * size
    const list = groups.get(key)
    if (list) list.push(bar)
    else groups.set(key, [bar])
  }

  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([timestamp, bars]) => ({
      timestamp,
      open: bars[0].open,
      high: Math.max(...bars.map((b) => b.high)),
      low: Math.min(...bars.map((b) => b.low)),
      close: bars[bars.length - 1].close,
      volume: bars.reduce((sum, b) => sum + (b.volume ?? 0), 0)
    }))
}

export function finestTimeframe(available: Timeframe[]): Timeframe {
  return available.slice().sort((a, b) => intervalMs(a) - intervalMs(b))[0] ?? '1M'
}
