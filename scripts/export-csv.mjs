import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DB_PATH = join(process.cwd(), 'data', 'strategy-tester.db')
const CSV_DIR = join(process.cwd(), 'data', 'csv')

function iso(ts) {
  return new Date(ts).toISOString().replace('.000Z', 'Z')
}

function writeDataset(db, row) {
  const candles = db
    .prepare(
      `SELECT timestamp, open, high, low, close, volume
       FROM candles WHERE dataset_id = ? ORDER BY timestamp`
    )
    .all(row.id)
  if (candles.length === 0) return null
  const name = `${row.symbol}_${row.timeframe}.csv`
  const lines = ['timestamp,open,high,low,close,volume']
  for (const c of candles) {
    lines.push(
      `${iso(c.timestamp)},${c.open},${c.high},${c.low},${c.close},${c.volume ?? ''}`
    )
  }
  const path = join(CSV_DIR, name)
  writeFileSync(path, `${lines.join('\n')}\n`)
  writeFileSync(
    join(CSV_DIR, `${row.symbol}_${row.timeframe}.meta.json`),
    `${JSON.stringify({
      symbol: row.symbol,
      timeframe: row.timeframe,
      startTs: candles[0].timestamp,
      endTs: candles[candles.length - 1].timestamp,
      candleCount: candles.length
    })}\n`
  )
  return { name, count: candles.length, path }
}

if (!existsSync(DB_PATH)) {
  console.error(`No database at ${DB_PATH}`)
  process.exit(1)
}

mkdirSync(CSV_DIR, { recursive: true })
const db = new DatabaseSync(DB_PATH)
const datasets = db
  .prepare(
    `SELECT id, symbol, timeframe, candle_count
     FROM datasets WHERE candle_count > 0
     ORDER BY symbol, timeframe`
  )
  .all()

console.log(`Exporting ${datasets.length} dataset(s) to ${CSV_DIR}`)
for (const row of datasets) {
  const written = writeDataset(db, row)
  if (!written) {
    console.log(`  skip ${row.symbol} ${row.timeframe} (empty)`)
    continue
  }
  console.log(`  ${written.name}  ${written.count.toLocaleString()} bars`)
}
db.close()
