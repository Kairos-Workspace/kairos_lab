import type { Candle, DataGap, ValidationReport } from '@shared/types'

function isValidOhlc(c: Candle): boolean {
  if (!(c.high >= c.low)) return false
  if (!(c.high >= c.open && c.high >= c.close)) return false
  if (!(c.low <= c.open && c.low <= c.close)) return false
  if (![c.open, c.high, c.low, c.close].every((n) => Number.isFinite(n))) return false
  return true
}

export function validateCandles(candles: Candle[], expectedIntervalMs: number): ValidationReport {
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp)
  let duplicates = 0
  let invalidOhlc = 0
  let unordered = 0
  const gaps: DataGap[] = []

  for (let i = 0; i < candles.length; i++) {
    if (!isValidOhlc(candles[i])) invalidOhlc++
    if (i > 0 && candles[i].timestamp < candles[i - 1].timestamp) unordered++
  }

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]
    if (curr.timestamp === prev.timestamp) {
      duplicates++
      continue
    }
    const delta = curr.timestamp - prev.timestamp
    if (expectedIntervalMs > 0 && delta > expectedIntervalMs * 1.5) {
      const missing = Math.round(delta / expectedIntervalMs) - 1
      if (missing > 0) {
        gaps.push({
          fromTs: prev.timestamp,
          toTs: curr.timestamp,
          expectedBars: missing
        })
      }
    }
  }

  return {
    valid: duplicates === 0 && invalidOhlc === 0 && unordered === 0,
    duplicates,
    invalidOhlc,
    unordered,
    gaps
  }
}

export function dedupeCandles(candles: Candle[]): Candle[] {
  const byTs = new Map<number, Candle>()
  for (const c of candles) byTs.set(c.timestamp, c)
  return [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp)
}
