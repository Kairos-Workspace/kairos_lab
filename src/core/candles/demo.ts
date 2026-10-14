import type { Candle } from '@shared/types'
import { sessionAt } from './session'

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generateDemoCandles(options?: {
  days?: number
  startPrice?: number
  startTs?: number
  seed?: number
}): Candle[] {
  const now = Date.now()
  const days = options?.days ?? 15
  const startPrice = options?.startPrice ?? 4340.0
  const startTs = options?.startTs ?? (now - days * 24 * 3600 * 1000)
  const rand = mulberry32(options?.seed ?? 20250906)

  const candles: Candle[] = []
  let price = startPrice
  const minutes = days * 23 * 60

  for (let i = 0; i < minutes; i++) {
    const timestamp = startTs + i * 60_000
    const hour = new Date(timestamp).getUTCHours()
    if (hour === 21) continue

    const session = sessionAt(timestamp)
    const vol =
      session === 'New York' ? 0.55 : session === 'London' ? 0.45 : 0.22
    const drift = 0.0004 * (rand() - 0.48)
    const shock = rand() < 0.004 ? (rand() - 0.5) * 4 : 0
    const change = (rand() - 0.5) * vol + drift * price + shock
    const open = price
    const close = Math.max(100, open + change)
    const wick = vol * (0.2 + rand())
    const high = Math.max(open, close) + wick * rand()
    const low = Math.min(open, close) - wick * rand()
    const volume = Math.round(40 + rand() * 220 * (session === 'Asia' ? 0.5 : 1.2))

    candles.push({
      timestamp,
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume
    })
    price = close
  }

  return candles
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
