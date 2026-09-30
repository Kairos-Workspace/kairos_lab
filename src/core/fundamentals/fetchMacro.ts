import type {
  FundamentalBundle,
  FundamentalEvent,
  FundamentalPoint,
  FundamentalSeries
} from './types'

const START = '2019-11-01'

type FredObs = { date: string; value: number }

async function fredObs(
  apiKey: string,
  id: string,
  opts: { start?: string; end?: string; units?: string } = {}
): Promise<FredObs[]> {
  const params = new URLSearchParams({
    series_id: id,
    api_key: apiKey,
    file_type: 'json',
    observation_start: opts.start ?? START,
    sort_order: 'asc'
  })
  if (opts.end) params.set('observation_end', opts.end)
  if (opts.units) params.set('units', opts.units)
  const j = (await (
    await fetch(`https://api.stlouisfed.org/fred/series/observations?${params}`)
  ).json()) as { observations?: { date: string; value: string }[]; error_message?: string }
  if (!j.observations) {
    throw new Error(j.error_message ?? `FRED ${id} returned no observations`)
  }
  return j.observations
    .filter((o) => o.value !== '.')
    .map((o) => ({ date: o.date, value: Number(o.value) }))
}

function parse(d: string): { y: number; m: number; day: number } {
  const [y, m, day] = d.split('-').map(Number)
  return { y, m, day }
}

function utc(y: number, m: number, d: number, h = 12): number {
  return Date.UTC(y, m - 1, d, h, 0, 0)
}

function firstFriday(y: number, m: number): Date {
  let d = new Date(Date.UTC(y, m - 1, 1))
  while (d.getUTCDay() !== 5) d = new Date(d.getTime() + 864e5)
  return d
}

function cpiRelease(y: number, m: number): number {
  return Date.UTC(y, m - 1, 12, 12, 30, 0)
}

function periodLabel(periodDate: string): string {
  const { y, m } = parse(periodDate)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function laborReleasePoints(rows: FredObs[]): FundamentalPoint[] {
  return rows.map((o) => {
    const { y, m } = parse(o.date)
    let ry = y
    let rm = m + 1
    if (rm > 12) {
      rm = 1
      ry++
    }
    const rel = firstFriday(ry, rm)
    return {
      ts: rel.getTime() + 12.5 * 3600e3,
      value: o.value,
      period: periodLabel(o.date)
    }
  })
}

function cpiReleasePoints(rows: FredObs[]): FundamentalPoint[] {
  return rows.map((o) => {
    const { y, m } = parse(o.date)
    let ry = y
    let rm = m + 1
    if (rm > 12) {
      rm = 1
      ry++
    }
    return {
      ts: cpiRelease(ry, rm),
      value: round1(o.value),
      period: periodLabel(o.date)
    }
  })
}

function targetChangePoints(rows: FredObs[]): FundamentalPoint[] {
  const out: FundamentalPoint[] = []
  let prev: number | null = null
  for (const o of rows) {
    if (prev == null || o.value !== prev) {
      const { y, m, day } = parse(o.date)
      out.push({ ts: utc(y, m, day, 18), value: o.value })
      prev = o.value
    }
  }
  return out
}

async function yahooDxyDaily(startDate: string, endDate: string): Promise<FundamentalPoint[]> {
  const start = parse(startDate)
  const end = parse(endDate)
  const period1 = Math.floor(utc(start.y, start.m, start.day, 0) / 1000)
  const period2 = Math.floor(utc(end.y, end.m, end.day, 23) / 1000) + 86400
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?period1=${period1}&period2=${period2}&interval=1d`
  const yj = (await (
    await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  ).json()) as {
    chart?: { result?: { timestamp: number[]; indicators: { quote: { close: (number | null)[] }[] } }[] }
  }
  const r = yj.chart?.result?.[0]
  if (!r) throw new Error('Yahoo DXY daily failed')
  const closes = r.indicators.quote[0].close
  const out: FundamentalPoint[] = []
  for (let i = 0; i < r.timestamp.length; i++) {
    const c = closes[i]
    if (c == null) continue
    const d = new Date(r.timestamp[i] * 1000)
    const ts = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 21, 0, 0)
    out.push({ ts, value: round1(c) })
  }
  const byDay = new Map<string, FundamentalPoint>()
  for (const p of out) byDay.set(new Date(p.ts).toISOString().slice(0, 10), p)
  return [...byDay.values()].sort((a, b) => a.ts - b.ts)
}

export interface FundamentalsFetchRange {
  /** Inclusive YYYY-MM-DD */
  startDate: string
  /** Inclusive YYYY-MM-DD */
  endDate: string
}

function normalizeRange(range?: FundamentalsFetchRange): FundamentalsFetchRange {
  const today = new Date().toISOString().slice(0, 10)
  const startDate = range?.startDate?.trim() || START
  const endDate = range?.endDate?.trim() || today
  if (startDate > endDate) {
    throw new Error('Start date must be on or before end date.')
  }
  return { startDate, endDate }
}

function inRange(ts: number, startTs: number, endTs: number): boolean {
  return ts >= startTs && ts <= endTs
}

const SCHEDULED_FOMC = [
  '2026-11-05',
  '2026-12-16',
  '2027-01-27',
  '2027-03-17',
  '2027-05-05',
  '2027-06-16',
  '2027-07-28',
  '2027-09-15',
  '2027-11-03',
  '2027-12-15'
]

/** Pull FRED + Yahoo and build a fundamentals bundle for the given window. */
export async function buildFundamentalsBundle(
  apiKey: string,
  range?: FundamentalsFetchRange
): Promise<FundamentalBundle> {
  const key = apiKey.trim()
  if (!key) throw new Error('FRED API key is required')
  const { startDate, endDate } = normalizeRange(range)
  // Pad FRED start a year early so YoY / MoM deltas near the window edge resolve.
  const padStart = (() => {
    const { y, m, day } = parse(startDate)
    return `${Math.max(1990, y - 1)}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  })()
  const start = parse(startDate)
  const end = parse(endDate)
  const startTs = utc(start.y, start.m, start.day, 0)
  const endTs = utc(end.y, end.m, end.day, 23) + 3_600_000

  const fredOpts = { start: padStart, end: endDate }
  const [fedUpper, fedLower, unrate, cpiYoy, cpiCore, payems, dxy] = await Promise.all([
    fredObs(key, 'DFEDTARU', fredOpts),
    fredObs(key, 'DFEDTARL', fredOpts),
    fredObs(key, 'UNRATE', fredOpts),
    fredObs(key, 'CPIAUCSL', { ...fredOpts, units: 'pc1' }),
    fredObs(key, 'CPILFESL', { ...fredOpts, units: 'pc1' }),
    fredObs(key, 'PAYEMS', fredOpts),
    yahooDxyDaily(startDate, endDate)
  ])

  const clip = (pts: FundamentalPoint[]): FundamentalPoint[] =>
    pts.filter((p) => inRange(p.ts, startTs, endTs))

  const fedUpperPts = clip(targetChangePoints(fedUpper))
  const fedLowerPts = clip(targetChangePoints(fedLower))
  const unempPts = clip(laborReleasePoints(unrate))
  const cpiPts = clip(cpiReleasePoints(cpiYoy))
  const corePts = clip(cpiReleasePoints(cpiCore))

  const nfpPts: FundamentalPoint[] = []
  for (let i = 1; i < payems.length; i++) {
    const o = payems[i]
    const prev = payems[i - 1]
    const delta = Math.round(o.value - prev.value)
    const { y, m } = parse(o.date)
    let ry = y
    let rm = m + 1
    if (rm > 12) {
      rm = 1
      ry++
    }
    const rel = firstFriday(ry, rm)
    const ts = rel.getTime() + 12.5 * 3600e3
    if (!inRange(ts, startTs, endTs)) continue
    nfpPts.push({
      ts,
      value: delta,
      period: periodLabel(o.date)
    })
  }

  const events: FundamentalEvent[] = []
  for (let i = 0; i < fedUpperPts.length; i++) {
    const cur = fedUpperPts[i]
    const prior = i > 0 ? fedUpperPts[i - 1].value : null
    let title = 'FOMC target'
    if (prior != null) {
      if (cur.value > prior) title = `FOMC hike ${Math.round((cur.value - prior) * 100)}bp`
      else if (cur.value < prior) title = `FOMC cut ${Math.round((prior - cur.value) * 100)}bp`
      else title = 'FOMC hold'
    }
    const row: FundamentalEvent = {
      ts: cur.ts,
      kind: 'fomc',
      title,
      impact: 'high',
      actual: cur.value
    }
    if (prior != null) row.prior = prior
    events.push(row)
  }
  for (const p of cpiPts) {
    events.push({
      ts: p.ts,
      kind: 'cpi',
      title: `CPI YoY ${p.period ?? ''}`.trim(),
      impact: 'high',
      actual: p.value
    })
  }
  for (const p of nfpPts) {
    events.push({
      ts: p.ts,
      kind: 'nfp',
      title: `NFP ${p.period ?? ''}`.trim(),
      impact: 'high',
      actual: p.value
    })
  }

  const lastFedTs = fedUpperPts.at(-1)?.ts ?? 0
  for (const d of SCHEDULED_FOMC) {
    const { y, m, day } = parse(d)
    const ts = utc(y, m, day, 18)
    if (ts <= lastFedTs || !inRange(ts, startTs, endTs)) continue
    events.push({ ts, kind: 'fomc', title: 'FOMC meeting', impact: 'high' })
  }
  events.sort((a, b) => a.ts - b.ts || a.kind.localeCompare(b.kind))

  const series: FundamentalSeries[] = [
    { id: 'fed_funds', unit: '%', points: fedUpperPts },
    { id: 'fed_funds_lower', unit: '%', points: fedLowerPts },
    { id: 'unemployment', unit: '%', points: unempPts },
    { id: 'cpi_yoy', unit: '%', points: cpiPts },
    { id: 'cpi_core', unit: '%', points: corePts },
    { id: 'nfp', unit: 'k', points: nfpPts },
    { id: 'dxy', unit: 'idx', points: dxy }
  ]

  return { series, events }
}

export function upsertSeriesPoint(
  bundle: FundamentalBundle,
  seriesId: string,
  point: FundamentalPoint
): FundamentalBundle {
  const series = bundle.series.map((s) => {
    if (s.id !== seriesId) return s
    const without = s.points.filter((p) => p.ts !== point.ts)
    const points = [...without, point].sort((a, b) => a.ts - b.ts)
    return { ...s, points }
  })
  if (!series.some((s) => s.id === seriesId)) {
    throw new Error(`Unknown series: ${seriesId}`)
  }
  return { ...bundle, series }
}

export function upsertEvent(
  bundle: FundamentalBundle,
  event: FundamentalEvent
): FundamentalBundle {
  const without = bundle.events.filter((e) => !(e.ts === event.ts && e.kind === event.kind))
  const events = [...without, event].sort((a, b) => a.ts - b.ts || a.kind.localeCompare(b.kind))
  return { ...bundle, events }
}

export const SERIES_META: {
  id: FundamentalSeries['id']
  label: string
  hint: string
}[] = [
  { id: 'fed_funds', label: 'Fed target (upper)', hint: 'FRED DFEDTARU' },
  { id: 'fed_funds_lower', label: 'Fed target (lower)', hint: 'FRED DFEDTARL' },
  { id: 'unemployment', label: 'Unemployment', hint: 'FRED UNRATE' },
  { id: 'cpi_yoy', label: 'CPI YoY', hint: 'FRED CPIAUCSL' },
  { id: 'cpi_core', label: 'Core CPI YoY', hint: 'FRED CPILFESL' },
  { id: 'nfp', label: 'NFP (k)', hint: 'MoM Δ PAYEMS' },
  { id: 'dxy', label: 'DXY', hint: 'Yahoo DX-Y.NYB' }
]
