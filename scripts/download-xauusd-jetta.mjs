import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DB_PATH = join(process.cwd(), 'data', 'strategy-tester.db')
const CACHE = join(process.cwd(), '.dukascopy-cache')
const ROOT = 'https://jetta.dukascopy.com/v1'
const START = new Date(Date.UTC(2003, 4, 5))
const END = new Date()
const DELAY_MS = 700

const SCHEMA = `
CREATE TABLE IF NOT EXISTS datasets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  source TEXT NOT NULL,
  start_ts INTEGER NOT NULL,
  end_ts INTEGER NOT NULL,
  candle_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS candles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL,
  UNIQUE (dataset_id, timestamp),
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_candles_dataset_ts ON candles(dataset_id, timestamp);
`

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function cacheName(url) {
  const path = url.replace(`${ROOT}/`, '')
  return join(CACHE, `${path.replaceAll('/', '%2F')}.json`)
}

function decodeCandles(data) {
  const length = data.times.length
  if (length === 0) return []
  const scale = (() => {
    const [coefficient, exponentText = '0'] = String(data.multiplier).toLowerCase().split('e')
    const decimalPlaces = coefficient.split('.')[1]?.length || 0
    return Math.max(0, decimalPlaces - Number(exponentText))
  })()
  const price = (units) => Number((units * data.multiplier).toFixed(scale))
  let timestamp = data.timestamp
  let openUnits = Math.round(data.open / data.multiplier)
  let highUnits = Math.round(data.high / data.multiplier)
  let lowUnits = Math.round(data.low / data.multiplier)
  let closeUnits = Math.round(data.close / data.multiplier)
  const out = []
  for (let i = 0; i < length; i++) {
    timestamp += data.times[i] * data.shift
    openUnits += data.opens[i]
    highUnits += data.highs[i]
    lowUnits += data.lows[i]
    closeUnits += data.closes[i]
    const volume = data.volumes?.[i] ?? 0
    if (volume === 0) continue
    out.push({
      timestamp,
      open: price(openUnits),
      high: price(highUnits),
      low: price(lowUnits),
      close: price(closeUnits),
      volume
    })
  }
  return out
}

async function fetchJson(url) {
  const file = cacheName(url)
  if (existsSync(file)) {
    return JSON.parse(readFileSync(file, 'utf8'))
  }
  for (let attempt = 1; attempt <= 6; attempt++) {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'QuantifyStrategyTester/1.0' }
    })
    if (response.status === 429) {
      const wait = attempt * 45_000
      console.log(`    429 on ${url} — waiting ${wait / 1000}s`)
      await sleep(wait)
      continue
    }
    if (response.status === 404 || response.status === 400) return null
    if (!response.ok) throw new Error(`${response.status} ${url}`)
    const json = await response.json()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(json))
    await sleep(DELAY_MS)
    return json
  }
  throw new Error(`Gave up on ${url}`)
}

function resample(candles, minutes) {
  const size = minutes * 60_000
  const groups = new Map()
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

function openDb() {
  mkdirSync(dirname(DB_PATH), { recursive: true })
  const db = new DatabaseSync(DB_PATH)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}

function getOrCreateDataset(db, timeframe) {
  const existing = db
    .prepare(
      `SELECT id FROM datasets WHERE symbol = 'XAUUSD' AND timeframe = ? AND source = 'dukascopy'`
    )
    .get(timeframe)
  if (existing) return existing.id
  return Number(
    db
      .prepare(
        `INSERT INTO datasets
          (symbol, timeframe, source, start_ts, end_ts, candle_count, created_at, version)
         VALUES ('XAUUSD', ?, 'dukascopy', 0, 0, 0, ?, 1)`
      )
      .run(timeframe, Date.now()).lastInsertRowid
  )
}

function insertCandles(db, datasetId, candles) {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO candles
      (dataset_id, timestamp, open, high, low, close, volume)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  db.exec('BEGIN')
  try {
    for (const c of candles) {
      stmt.run(datasetId, c.timestamp, c.open, c.high, c.low, c.close, c.volume ?? null)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function refreshMeta(db, datasetId) {
  db.prepare(
    `UPDATE datasets SET
      start_ts = COALESCE((SELECT MIN(timestamp) FROM candles WHERE dataset_id = ?), 0),
      end_ts = COALESCE((SELECT MAX(timestamp) FROM candles WHERE dataset_id = ?), 0),
      candle_count = (SELECT COUNT(*) FROM candles WHERE dataset_id = ?)
     WHERE id = ?`
  ).run(datasetId, datasetId, datasetId, datasetId)
}

function latest(db, datasetId) {
  return db.prepare('SELECT MAX(timestamp) AS ts FROM candles WHERE dataset_id = ?').get(datasetId)?.ts ?? 0
}

async function downloadHourTape(db) {
  const id1h = getOrCreateDataset(db, '1H')
  const id4h = getOrCreateDataset(db, '4H')
  let cursor = new Date(Math.max(START.getTime(), latest(db, id1h) + 1))
  cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1))
  console.log(`\n=== 1H / 4H from ${cursor.toISOString().slice(0, 7)} ===`)

  while (cursor < END) {
    const year = cursor.getUTCFullYear()
    const month = cursor.getUTCMonth() + 1
    const url = `${ROOT}/candles/hour/XAU-USD/BID/${year}/${month}`
    process.stdout.write(`  ${year}-${String(month).padStart(2, '0')} … `)
    const json = await fetchJson(url)
    const hour = json ? decodeCandles(json) : []
    if (hour.length) {
      insertCandles(db, id1h, hour)
      insertCandles(db, id4h, resample(hour, 240))
      refreshMeta(db, id1h)
      refreshMeta(db, id4h)
    }
    const counts = db
      .prepare(
        `SELECT timeframe, candle_count FROM datasets WHERE id IN (?, ?) ORDER BY timeframe`
      )
      .all(id1h, id4h)
    console.log(
      `${hour.length.toLocaleString()} hour bars · ${counts.map((r) => `${r.timeframe} ${r.candle_count.toLocaleString()}`).join(' · ')}`
    )
    cursor = new Date(Date.UTC(year, month, 1))
  }

  const liveFrom = Date.UTC(END.getUTCFullYear(), END.getUTCMonth(), 1)
  const live = await fetchJson(`${ROOT}/candles/hour/XAU-USD/BID?from=${liveFrom}`)
  if (live) {
    const hour = decodeCandles(live)
    insertCandles(db, id1h, hour)
    insertCandles(db, id4h, resample(hour, 240))
    refreshMeta(db, id1h)
    refreshMeta(db, id4h)
    console.log(`  current month live: ${hour.length.toLocaleString()} hour bars`)
  }
}

async function downloadMinuteTape(db) {
  const id5 = getOrCreateDataset(db, '5M')
  const id15 = getOrCreateDataset(db, '15M')
  let cursor = new Date(Math.max(START.getTime(), latest(db, id5) + 1))
  cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate()))
  console.log(`\n=== 5M / 15M from ${cursor.toISOString().slice(0, 10)} ===`)

  while (cursor < END) {
    const dow = cursor.getUTCDay()
    if (dow === 0 || dow === 6) {
      cursor = new Date(cursor.getTime() + 86_400_000)
      continue
    }
    const year = cursor.getUTCFullYear()
    const month = cursor.getUTCMonth() + 1
    const day = cursor.getUTCDate()
    const url = `${ROOT}/candles/minute/XAU-USD/BID/${year}/${month}/${day}`
    if (day === 1) process.stdout.write(`  ${year}-${String(month).padStart(2, '0')} … `)
    const json = await fetchJson(url)
    const minute = json ? decodeCandles(json) : []
    if (minute.length) {
      insertCandles(db, id5, resample(minute, 5))
      insertCandles(db, id15, resample(minute, 15))
    }
    if (day === 1 || cursor.getTime() + 86_400_000 >= END.getTime()) {
      refreshMeta(db, id5)
      refreshMeta(db, id15)
      const five = db.prepare('SELECT candle_count FROM datasets WHERE id = ?').get(id5)
      console.log(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} · 5M ${five.candle_count.toLocaleString()}`)
    }
    cursor = new Date(cursor.getTime() + 86_400_000)
  }
  refreshMeta(db, id5)
  refreshMeta(db, id15)
}

mkdirSync(CACHE, { recursive: true })
const db = openDb()
console.log(`Writing XAUUSD history into ${DB_PATH}`)
try {
  await downloadHourTape(db)
  await downloadMinuteTape(db)
  const rows = db
    .prepare(
      `SELECT timeframe, source, candle_count, start_ts, end_ts
       FROM datasets WHERE symbol = 'XAUUSD'
       ORDER BY timeframe`
    )
    .all()
  console.log('\nLocal XAUUSD datasets:')
  for (const row of rows) {
    const from = row.start_ts ? new Date(row.start_ts).toISOString().slice(0, 10) : '—'
    const to = row.end_ts ? new Date(row.end_ts).toISOString().slice(0, 10) : '—'
    console.log(
      `  ${row.timeframe.padEnd(4)}  ${row.source.padEnd(10)}  ${String(row.candle_count).padStart(10)}  ${from} → ${to}`
    )
  }
  const { spawnSync } = await import('node:child_process')
  console.log('\nWriting CSV tapes to data/csv …')
  spawnSync(process.execPath, ['scripts/export-csv.mjs'], { stdio: 'inherit' })
} finally {
  db.close()
}
