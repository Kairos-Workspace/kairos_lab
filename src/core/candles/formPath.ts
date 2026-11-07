import type { Candle } from '@shared/types'

/** How many morph frames fit in a play interval (keeps formation readable). */
export function formFrameCount(durationMs: number): number {
  if (durationMs <= 56) return 3
  if (durationMs <= 100) return 5
  if (durationMs <= 200) return 8
  return Math.min(16, Math.max(8, Math.round(durationMs / 40)))
}

/**
 * Progressive OHLC snapshots for one display candle so the tip bar can
 * grow on-chart instead of popping in fully formed.
 *
 * Prefers lower-timeframe ticks when available; otherwise synthesizes a
 * classic open → extremes → close itinerary.
 */
export function buildCandleFormPath(
  target: Candle,
  lowerTicks: Candle[] = [],
  frames = 8
): Candle[] {
  const n = Math.max(2, frames)
  if (lowerTicks.length >= 2) {
    return pathFromTicks(target, lowerTicks, n)
  }
  return synthesizePath(target, n)
}

function pathFromTicks(target: Candle, ticks: Candle[], frames: number): Candle[] {
  const usable = ticks.filter((t) => t.close > 0 || t.open > 0)
  if (usable.length < 2) return synthesizePath(target, frames)

  const out: Candle[] = []
  let high = Number.NEGATIVE_INFINITY
  let low = Number.POSITIVE_INFINITY
  const open = usable[0]?.open || target.open
  const step = Math.max(1, Math.ceil(usable.length / frames))

  for (let i = 0; i < usable.length; i++) {
    const tick = usable[i]!
    high = Math.max(high, tick.high, tick.open, tick.close)
    low = Math.min(low, tick.low, tick.open, tick.close)
    const isSample = i === 0 || i === usable.length - 1 || (i + 1) % step === 0
    if (!isSample) continue
    const close = tick.close || tick.open
    out.push({
      timestamp: target.timestamp,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
      volume: tick.volume
    })
  }

  const last = out[out.length - 1]
  if (!last || last.close !== target.close || last.high !== target.high || last.low !== target.low) {
    out.push({ ...target })
  }
  return out.length >= 2 ? out : synthesizePath(target, frames)
}

function synthesizePath(target: Candle, frames: number): Candle[] {
  const { open, high, low, close, timestamp, volume } = target
  const bullish = close >= open
  // Dip-then-rally for bulls, spike-then-dump for bears — reads like live tape.
  const itinerary = bullish ? [open, low, high, close] : [open, high, low, close]

  const out: Candle[] = []
  let runHigh = open
  let runLow = open

  for (let i = 0; i < frames; i++) {
    const t = frames === 1 ? 1 : i / (frames - 1)
    const price = sampleItinerary(itinerary, t)
    runHigh = Math.max(runHigh, price)
    runLow = Math.min(runLow, price)
    out.push({
      timestamp,
      open,
      high: i === frames - 1 ? high : Math.min(high, runHigh),
      low: i === frames - 1 ? low : Math.max(low, runLow),
      close: i === frames - 1 ? close : price,
      volume
    })
  }

  out[out.length - 1] = { ...target }
  return out
}

function sampleItinerary(points: number[], t: number): number {
  if (points.length === 0) return 0
  if (points.length === 1) return points[0]!
  const clamped = Math.min(1, Math.max(0, t))
  const scaled = clamped * (points.length - 1)
  const i = Math.floor(scaled)
  const frac = scaled - i
  const a = points[i]!
  const b = points[Math.min(points.length - 1, i + 1)]!
  return a + (b - a) * frac
}
