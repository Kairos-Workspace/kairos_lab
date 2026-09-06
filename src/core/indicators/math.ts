import type { Candle } from '@shared/types'

export interface Bands {
  mid: number
  upper: number
  lower: number
}

export function smaField(
  bars: Candle[],
  period: number,
  field: 'open' | 'high' | 'low' | 'close'
): number | null {
  if (bars.length < period) return null
  const slice = bars.slice(-period)
  return slice.reduce((sum, bar) => sum + bar[field], 0) / period
}

export function sma(bars: Candle[], period: number): number | null {
  return smaField(bars, period, 'close')
}

export function bollinger(bars: Candle[], period: number, k: number): Bands | null {
  if (bars.length < period) return null
  const slice = bars.slice(-period)
  const mid = slice.reduce((sum, bar) => sum + bar.close, 0) / period
  const variance = slice.reduce((sum, bar) => sum + (bar.close - mid) ** 2, 0) / period
  const stdev = Math.sqrt(variance)
  if (stdev === 0) return null
  return {
    mid,
    upper: mid + k * stdev,
    lower: mid - k * stdev
  }
}

export function rangeHighLow(bars: Candle[]): { high: number; low: number } | null {
  if (bars.length === 0) return null
  let high = Number.NEGATIVE_INFINITY
  let low = Number.POSITIVE_INFINITY
  for (const bar of bars) {
    high = Math.max(high, bar.high)
    low = Math.min(low, bar.low)
  }
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null
  return { high, low }
}
