import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { getHistoricalRates } from 'dukascopy-node'

const DB_PATH = join(process.cwd(), 'data', 'strategy-tester.db')
const END = new Date()
const JOBS = [
  { timeframe: '4H', dukas: 'h4', from: '2003-05-05' },
  { timeframe: '1H', dukas: 'h1', from: '2003-05-05' },
  { timeframe: '15M', dukas: 'm15', from: '2003-05-05' },
  { timeframe: '5M', dukas: 'm5', from: '2003-05-05' }
]

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
CREATE TABLE IF NOT EXISTS data_gaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id INTEGER NOT NULL,
  from_ts INTEGER NOT NULL,
  to_ts INTEGER NOT NULL,
  expected_bars INTEGER,
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
);
`

function toCandle(row) {
  if (Array.isArray(row)) {
    const [timestamp, open, high, low, close, volume] = row
    if (![open, high, low, close].every(Number.isFinite)) return null
    return { timestamp, open, high, low, close, volume }
  }
  if (![row.open, row.high, row.low, row.close].every(Number.isFinite)) return null
  return {
    timestamp: row.timestamp,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume
  }
}

function yearWindows(fromIso, end) {
  const windows = []
  let year = new Date(`${fromIso}T00:00:00.000Z`).getUTCFullYear()
  const first = new Date(`${fromIso}T00:00:00.000Z`)
  const lastYear = end.getUTCFullYear()
  while (year <= lastYear) {
    const start = year === first.getUTCFullYear() ? first : new Date(Date.UTC(year, 0, 1))
    const stop = year === lastYear ? end : new Date(Date.UTC(year + 1, 0, 1))
    windows.push({ year, start, stop })
    year++
  }
  return windows
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
  const info = db
    .prepare(
      `INSERT INTO datasets
        (symbol, timeframe, source, start_ts, end_ts, candle_count, created_at, version)
       VALUES ('XAUUSD', ?, 'dukascopy', 0, 0, 0, ?, 1)`
    )
    .run(timeframe, Date.now())
  return Number(info.lastInsertRowid)
}

function latestTimestamp(db, datasetId) {
  const row = db.prepare('SELECT MAX(timestamp) AS ts FROM candles WHERE dataset_id = ?').get(datasetId)
  return row?.ts ?? 0
}

function refreshDatasetMeta(db, datasetId) {
  db.prepare(
    `UPDATE datasets SET
      start_ts = COALESCE((SELECT MIN(timestamp) FROM candles WHERE dataset_id = ?), 0),
      end_ts = COALESCE((SELECT MAX(timestamp) FROM candles WHERE dataset_id = ?), 0),
      candle_count = (SELECT COUNT(*) FROM candles WHERE dataset_id = ?)
     WHERE id = ?`
  ).run(datasetId, datasetId, datasetId, datasetId)
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetry(label, fn) {
  let delay = 90000
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const retryable = /429|503|ECONNRESET|ETIMEDOUT|network/i.test(message)
      if (!retryable || attempt === 8) throw error
      process.stdout.write(`\n    ${label} ${message} — retry ${attempt}/8 in ${delay / 1000}s `)
      await sleep(delay)
      delay = Math.min(delay * 2, 60_000)
    }
  }
  throw new Error('unreachable')
}

async function downloadWindow(job, start, stop) {
  const rows = await getHistoricalRates({
    instrument: 'xauusd',
    dates: { from: start, to: stop },
    timeframe: job.dukas,
    format: 'json',
    priceType: 'bid',
    volumes: true,
    ignoreFlats: true,
    useCache: true,
    cacheFolderPath: '.dukascopy-cache',
    batchSize: 1,
    pauseBetweenBatchesMs: 2500,
    retryCount: 8,
    pauseBetweenRetriesMs: 2000
  })
  return rows.map(toCandle).filter(Boolean)
}

async function downloadJob(db, job) {
  const datasetId = getOrCreateDataset(db, job.timeframe)
  const resumeFrom = latestTimestamp(db, datasetId)
  let yearsSinceBreak = 0
  console.log(`\n=== XAUUSD ${job.timeframe} ===`)
  if (resumeFrom) {
    console.log(`Resuming after ${new Date(resumeFrom).toISOString()}`)
  }

  for (const window of yearWindows(job.from, END)) {
    if (window.stop.getTime() <= resumeFrom) {
      console.log(`  ${window.year}: already stored, skip`)
      continue
    }
    const from = new Date(Math.max(window.start.getTime(), resumeFrom + 1))
    process.stdout.write(`  ${window.year}: ${from.toISOString().slice(0, 10)} → ${window.stop.toISOString().slice(0, 10)} … `)
    try {
      const candles = await withRetry(`${job.timeframe} ${window.year}`, () =>
        downloadWindow(job, from, window.stop)
      )
      insertCandles(db, datasetId, candles)
      refreshDatasetMeta(db, datasetId)
      const meta = db.prepare('SELECT candle_count FROM datasets WHERE id = ?').get(datasetId)
      console.log(`${candles.length.toLocaleString()} new · ${meta.candle_count.toLocaleString()} total`)
      yearsSinceBreak += 1
      if (yearsSinceBreak >= 4) {
        console.log('    cooling down 3 minutes to stay under Dukascopy limits…')
        await sleep(180_000)
        yearsSinceBreak = 0
      } else {
        await sleep(8000)
      }
    } catch (error) {
      console.log('FAILED')
      console.error(`    ${error instanceof Error ? error.message : error}`)
      throw error
    }
  }

  const done = db
    .prepare('SELECT candle_count, start_ts, end_ts FROM datasets WHERE id = ?')
    .get(datasetId)
  console.log(
    `Done ${job.timeframe}: ${done.candle_count.toLocaleString()} candles · ${new Date(done.start_ts).toISOString().slice(0, 10)} → ${new Date(done.end_ts).toISOString().slice(0, 10)}`
  )
}

async function downloadYahooDaily(db) {
  const period2 = Math.floor(Date.now() / 1000)
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/GC=F` +
    `?period1=0&period2=${period2}&interval=1d&includePrePost=false`
  console.log('\n=== XAUUSD 1D (Yahoo GC=F, full daily tape) ===')
  const response = await fetch(url, {
    headers: { 'User-Agent': 'QuantifyStrategyTester/1.0', Accept: 'application/json' }
  })
  if (!response.ok) throw new Error(`Yahoo daily failed: ${response.status}`)
  const payload = await response.json()
  const result = payload.chart?.result?.[0]
  const quote = result?.indicators?.quote?.[0]
  const candles = []
  for (let i = 0; i < (result?.timestamp?.length ?? 0); i++) {
    const open = quote?.open?.[i]
    const high = quote?.high?.[i]
    const low = quote?.low?.[i]
    const close = quote?.close?.[i]
    if (![open, high, low, close].every((n) => typeof n === 'number' && Number.isFinite(n))) continue
    candles.push({
      timestamp: result.timestamp[i] * 1000,
      open,
      high,
      low,
      close,
      volume: quote?.volume?.[i]
    })
  }
  if (candles.length === 0) throw new Error('Yahoo returned no daily candles')
  const existing = db
    .prepare(`SELECT id FROM datasets WHERE symbol = 'XAUUSD' AND timeframe = '1D' AND source = 'yahoo'`)
    .get()
  const datasetId = existing
    ? existing.id
    : Number(
        db
          .prepare(
            `INSERT INTO datasets
              (symbol, timeframe, source, start_ts, end_ts, candle_count, created_at, version)
             VALUES ('XAUUSD', '1D', 'yahoo', 0, 0, 0, ?, 1)`
          )
          .run(Date.now()).lastInsertRowid
      )
  insertCandles(db, datasetId, candles)
  refreshDatasetMeta(db, datasetId)
  const meta = db.prepare('SELECT candle_count, start_ts, end_ts FROM datasets WHERE id = ?').get(datasetId)
  console.log(
    `Done 1D: ${meta.candle_count.toLocaleString()} candles · ${new Date(meta.start_ts).toISOString().slice(0, 10)} → ${new Date(meta.end_ts).toISOString().slice(0, 10)}`
  )
}

const db = openDb()
console.log(`Writing XAUUSD history into ${DB_PATH}`)
try {
  await downloadYahooDaily(db)
  console.log('Waiting 2 minutes before Dukascopy intraday…')
  await sleep(120_000)
  for (const job of JOBS) {
    await downloadJob(db, job)
  }
  const rows = db
    .prepare(
      `SELECT timeframe, candle_count, start_ts, end_ts
       FROM datasets
       WHERE symbol = 'XAUUSD' AND source = 'dukascopy'
       ORDER BY candle_count DESC`
    )
    .all()
  console.log('\nLocal datasets:')
  for (const row of rows) {
    console.log(
      `  ${row.timeframe.padEnd(4)}  ${String(row.candle_count).padStart(10)} bars   ${new Date(row.start_ts).toISOString().slice(0, 10)} → ${new Date(row.end_ts).toISOString().slice(0, 10)}`
    )
  }
} finally {
  db.close()
}
