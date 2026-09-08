import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { parseCandleCsv } from '@core/csv/parse'
import { TIMEFRAMES, type Candle, type DatasetInfo, type Timeframe } from '@shared/types'
import { projectDataDir } from '../database/db'

export const CSV_ID_BASE = 10_000

interface CsvMeta {
  symbol: string
  timeframe: Timeframe
  startTs: number
  endTs: number
  candleCount: number
}

interface CachedTape {
  id: number
  file: string
  mtime: number
  dataset: DatasetInfo
  candles?: Candle[]
}

const cache = new Map<string, CachedTape>()

export function csvDir(): string {
  return join(projectDataDir(), 'csv')
}

function parseName(file: string): { symbol: string; timeframe: Timeframe } | null {
  const match = file.match(/^([A-Za-z0-9]+)_([0-9A-Za-z]+)\.csv$/)
  if (!match) return null
  const timeframe = match[2].toUpperCase() as Timeframe
  if (!TIMEFRAMES.includes(timeframe)) return null
  return { symbol: match[1].toUpperCase(), timeframe }
}

function idFor(file: string): number {
  let hash = 0
  for (const char of file) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return CSV_ID_BASE + (hash % 89_999)
}

function metaPath(csvFile: string): string {
  return csvFile.replace(/\.csv$/i, '.meta.json')
}

export function isCsvDataset(id: number): boolean {
  return id >= CSV_ID_BASE
}

function readMeta(csvFile: string, mtime: number): CsvMeta | null {
  const path = metaPath(csvFile)
  if (!existsSync(path)) return null
  if (statSync(path).mtimeMs < mtime) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as CsvMeta
  } catch {
    return null
  }
}

function writeMeta(csvFile: string, meta: CsvMeta): void {
  writeFileSync(metaPath(csvFile), `${JSON.stringify(meta)}\n`)
}

export function refreshCsvDatasets(): DatasetInfo[] {
  const dir = csvDir()
  if (!existsSync(dir)) {
    cache.clear()
    return []
  }

  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.csv'))
    .sort()
  const keep = new Set<string>()
  const datasets: DatasetInfo[] = []

  for (const file of files) {
    const parsed = parseName(file)
    if (!parsed) continue
    const full = join(dir, file)
    const mtime = statSync(full).mtimeMs
    const id = idFor(file)
    keep.add(full)
    const prev = cache.get(full)
    if (prev && prev.mtime === mtime) {
      datasets.push(prev.dataset)
      continue
    }

    const meta = readMeta(full, mtime)
    const dataset: DatasetInfo = {
      id,
      symbol: parsed.symbol,
      timeframe: parsed.timeframe,
      source: 'csv',
      startTs: meta?.startTs ?? 0,
      endTs: meta?.endTs ?? 0,
      candleCount: meta?.candleCount ?? 0,
      createdAt: Math.round(mtime),
      version: 1,
      gapCount: 0
    }
    cache.set(full, { id, file: full, mtime, dataset, candles: prev?.candles })
    datasets.push(dataset)
  }

  for (const key of cache.keys()) {
    if (!keep.has(key)) cache.delete(key)
  }
  return datasets
}

export function deleteCsvTape(id: number): boolean {
  if (cache.size === 0) refreshCsvDatasets()
  const row = [...cache.values()].find((item) => item.id === id)
  if (!row) return false
  if (existsSync(row.file)) unlinkSync(row.file)
  const meta = metaPath(row.file)
  if (existsSync(meta)) unlinkSync(meta)
  cache.delete(row.file)
  return true
}


export function csvCandles(id: number, fromTs?: number, toTs?: number): Candle[] {
  if (cache.size === 0) refreshCsvDatasets()
  const row = [...cache.values()].find((item) => item.id === id)
  if (!row) return []
  if (!row.candles) {
    row.candles = parseCandleCsv(readFileSync(row.file, 'utf8'))
    writeMeta(row.file, {
      symbol: row.dataset.symbol,
      timeframe: row.dataset.timeframe,
      startTs: row.candles[0]?.timestamp ?? 0,
      endTs: row.candles.at(-1)?.timestamp ?? 0,
      candleCount: row.candles.length
    })
    row.dataset = {
      ...row.dataset,
      startTs: row.candles[0]?.timestamp ?? 0,
      endTs: row.candles.at(-1)?.timestamp ?? 0,
      candleCount: row.candles.length
    }
  }
  let candles = row.candles
  if (fromTs != null) candles = candles.filter((c) => c.timestamp >= fromTs)
  if (toTs != null) candles = candles.filter((c) => c.timestamp <= toTs)
  return candles
}
