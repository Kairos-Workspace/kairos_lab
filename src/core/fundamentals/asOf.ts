import type {
  FundamentalBundle,
  FundamentalEvent,
  FundamentalEventKind,
  FundamentalPoint,
  FundamentalSeries,
  FundamentalSeriesId,
  FundamentalSnapshot
} from './types'

export function latestPoint(series: FundamentalSeries, asOfTs: number): FundamentalPoint | null {
  const pts = series.points
  if (pts.length === 0 || asOfTs < pts[0].ts) return null
  let lo = 0
  let hi = pts.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (pts[mid].ts <= asOfTs) lo = mid + 1
    else hi = mid - 1
  }
  return hi >= 0 ? pts[hi] : null
}

export function lastEvent(
  events: FundamentalEvent[],
  asOfTs: number,
  kinds?: FundamentalEventKind[]
): FundamentalEvent | null {
  const allow = kinds ? new Set(kinds) : null
  let best: FundamentalEvent | null = null
  for (const ev of events) {
    if (ev.ts > asOfTs) break
    if (allow && !allow.has(ev.kind)) continue
    best = ev
  }
  return best
}

export function nextEvent(
  events: FundamentalEvent[],
  asOfTs: number,
  kinds?: FundamentalEventKind[]
): FundamentalEvent | null {
  const allow = kinds ? new Set(kinds) : null
  for (const ev of events) {
    if (ev.ts <= asOfTs) continue
    if (allow && !allow.has(ev.kind)) continue
    return ev
  }
  return null
}

function sameUtcDay(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  )
}

function seriesById(bundle: FundamentalBundle, id: FundamentalSeriesId): FundamentalSeries | null {
  return bundle.series.find((s) => s.id === id) ?? null
}

export function resolveFundamentals(bundle: FundamentalBundle, asOfTs: number): FundamentalSnapshot {
  const pick = (id: FundamentalSeriesId): FundamentalPoint | null => {
    const s = seriesById(bundle, id)
    return s ? latestPoint(s, asOfTs) : null
  }
  const last = lastEvent(bundle.events, asOfTs, ['fomc', 'cpi', 'nfp'])
  const next = nextEvent(bundle.events, asOfTs, ['fomc', 'cpi', 'nfp'])
  return {
    asOfTs,
    fedFunds: pick('fed_funds'),
    unemployment: pick('unemployment'),
    cpiYoy: pick('cpi_yoy'),
    nfp: pick('nfp'),
    dxy: pick('dxy'),
    lastEvent: last,
    nextEvent: next,
    justPrinted: last != null && sameUtcDay(last.ts, asOfTs)
  }
}

export function fundamentalsAsOf(state: {
  mode: 'view' | 'replay'
  replayIndex: number
  displayCandles: { timestamp: number }[]
}): number | null {
  const { displayCandles, mode, replayIndex } = state
  if (displayCandles.length === 0) return null
  if (mode === 'replay') return displayCandles[replayIndex]?.timestamp ?? null
  return displayCandles.at(-1)?.timestamp ?? null
}
