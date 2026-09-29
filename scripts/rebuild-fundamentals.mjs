#!/usr/bin/env node
/**
 * Rebuild src/core/fundamentals/macro.json from FRED + Yahoo DXY.
 * Requires FRED_API_KEY in .env
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const OUT = join(ROOT, 'src/core/fundamentals/macro.json')
const START = '2019-11-01'

function loadKey() {
  if (process.env.FRED_API_KEY) return process.env.FRED_API_KEY.trim()
  const envPath = join(ROOT, '.env')
  if (!existsSync(envPath)) throw new Error('Missing FRED_API_KEY / .env')
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*FRED_API_KEY\s*=\s*(.+)\s*$/)
    if (m) return m[1].trim()
  }
  throw new Error('FRED_API_KEY not found in .env')
}

const KEY = loadKey()

async function fredObs(id, { start = START, units } = {}) {
  const params = new URLSearchParams({
    series_id: id,
    api_key: KEY,
    file_type: 'json',
    observation_start: start,
    sort_order: 'asc'
  })
  if (units) params.set('units', units)
  const j = await (await fetch(`https://api.stlouisfed.org/fred/series/observations?${params}`)).json()
  if (!j.observations) throw new Error(`FRED ${id}: ${JSON.stringify(j).slice(0, 180)}`)
  return j.observations
    .filter((o) => o.value !== '.')
    .map((o) => ({ date: o.date, value: Number(o.value) }))
}

function parse(d) {
  const [y, m, day] = d.split('-').map(Number)
  return { y, m, day }
}
function utc(y, m, d, h = 12) {
  return Date.UTC(y, m - 1, d, h, 0, 0)
}
function firstFriday(y, m) {
  let d = new Date(Date.UTC(y, m - 1, 1))
  while (d.getUTCDay() !== 5) d = new Date(d.getTime() + 864e5)
  return d
}
function cpiRelease(y, m) {
  return Date.UTC(y, m - 1, 12, 12, 30, 0)
}
function periodLabel(periodDate) {
  const { y, m } = parse(periodDate)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  })
}
function round1(n) {
  return Math.round(n * 10) / 10
}
function round2(n) {
  return Math.round(n * 100) / 100
}

/** Stamp monthly labor prints on first Friday of the following month. */
function laborReleasePoints(rows) {
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

function cpiReleasePoints(rows) {
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

/** Keep only target-change days. */
function targetChangePoints(rows) {
  const out = []
  let prev = null
  for (const o of rows) {
    if (prev == null || o.value !== prev) {
      const { y, m, day } = parse(o.date)
      out.push({ ts: utc(y, m, day, 18), value: o.value })
      prev = o.value
    }
  }
  return out
}

async function yahooDxyDaily() {
  const period1 = Math.floor(Date.UTC(2019, 10, 1) / 1000)
  const period2 = Math.floor(Date.now() / 1000) + 86400
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?period1=${period1}&period2=${period2}&interval=1d`
  const yj = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).json()
  const r = yj.chart?.result?.[0]
  if (!r) throw new Error('Yahoo DXY daily failed')
  const closes = r.indicators.quote[0].close
  const out = []
  for (let i = 0; i < r.timestamp.length; i++) {
    const c = closes[i]
    if (c == null) continue
    // Daily bar time is session; stamp ~21:00 UTC that calendar day.
    const d = new Date(r.timestamp[i] * 1000)
    const ts = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 21, 0, 0)
    out.push({ ts, value: round1(c) })
  }
  // de-dupe by calendar day
  const byDay = new Map()
  for (const p of out) byDay.set(new Date(p.ts).toISOString().slice(0, 10), p)
  return [...byDay.values()].sort((a, b) => a.ts - b.ts)
}

function strip(pts) {
  return pts.map(({ ts, value, period }) => {
    const row = { ts, value }
    if (period) row.period = period
    return row
  })
}

const [fedUpper, fedLower, unrate, cpiYoy, cpiCore, payems, dxy] = await Promise.all([
  fredObs('DFEDTARU'),
  fredObs('DFEDTARL'),
  fredObs('UNRATE'),
  fredObs('CPIAUCSL', { units: 'pc1' }),
  fredObs('CPILFESL', { units: 'pc1' }),
  fredObs('PAYEMS'),
  yahooDxyDaily()
])

const fedUpperPts = targetChangePoints(fedUpper)
const fedLowerPts = targetChangePoints(fedLower)
const unempPts = laborReleasePoints(unrate)
const cpiPts = cpiReleasePoints(cpiYoy)
const corePts = cpiReleasePoints(cpiCore)

const nfpPts = []
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
  nfpPts.push({
    ts: rel.getTime() + 12.5 * 3600e3,
    value: delta,
    period: periodLabel(o.date)
  })
}

const events = []
for (let i = 0; i < fedUpperPts.length; i++) {
  const cur = fedUpperPts[i]
  const prior = i > 0 ? fedUpperPts[i - 1].value : null
  let title = 'FOMC target'
  if (prior != null) {
    if (cur.value > prior) title = `FOMC hike ${Math.round((cur.value - prior) * 100)}bp`
    else if (cur.value < prior) title = `FOMC cut ${Math.round((prior - cur.value) * 100)}bp`
    else title = 'FOMC hold'
  }
  const row = { ts: cur.ts, kind: 'fomc', title, impact: 'high', actual: cur.value }
  if (prior != null) row.prior = prior
  events.push(row)
}
for (const p of cpiPts) {
  events.push({
    ts: p.ts,
    kind: 'cpi',
    title: `CPI YoY ${p.period}`,
    impact: 'high',
    actual: p.value
  })
}
for (const p of nfpPts) {
  events.push({
    ts: p.ts,
    kind: 'nfp',
    title: `NFP ${p.period}`,
    impact: 'high',
    actual: p.value
  })
}

const scheduledFomc = [
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
const lastFedTs = fedUpperPts.at(-1)?.ts ?? 0
for (const d of scheduledFomc) {
  const { y, m, day } = parse(d)
  const ts = utc(y, m, day, 18)
  if (ts <= lastFedTs) continue
  events.push({ ts, kind: 'fomc', title: 'FOMC meeting', impact: 'high' })
}
events.sort((a, b) => a.ts - b.ts || a.kind.localeCompare(b.kind))

const bundle = {
  series: [
    { id: 'fed_funds', unit: '%', points: strip(fedUpperPts) },
    { id: 'fed_funds_lower', unit: '%', points: strip(fedLowerPts) },
    { id: 'unemployment', unit: '%', points: strip(unempPts) },
    { id: 'cpi_yoy', unit: '%', points: strip(cpiPts) },
    { id: 'cpi_core', unit: '%', points: strip(corePts) },
    { id: 'nfp', unit: 'k', points: strip(nfpPts) },
    { id: 'dxy', unit: 'idx', points: dxy }
  ],
  events
}

writeFileSync(OUT, JSON.stringify(bundle, null, 2) + '\n')

const asOf = Date.now()
function latest(pts) {
  let best = null
  for (const p of pts) {
    if (p.ts <= asOf) best = p
    else break
  }
  return best
}
console.log('wrote', OUT)
console.log({
  fed: latest(fedUpperPts),
  fedLow: latest(fedLowerPts),
  unemp: latest(unempPts),
  cpi: latest(cpiPts),
  core: latest(corePts),
  nfp: latest(nfpPts),
  dxy: latest(dxy),
  events: events.length,
  dxyBars: dxy.length
})
