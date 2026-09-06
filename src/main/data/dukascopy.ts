import { getHistoricalRates } from 'dukascopy-node'
import type { Candle, Timeframe } from '@shared/types'

const TF_MAP: Record<Timeframe, string> = {
  '1M': 'm1',
  '5M': 'm5',
  '15M': 'm15',
  '30M': 'm30',
  '1H': 'h1',
  '4H': 'h4',
  '1D': 'd1'
}

export const DUKASCOPY_START: Record<Timeframe, string> = {
  '1M': '2003-05-05',
  '5M': '2003-05-05',
  '15M': '2003-05-05',
  '30M': '2003-05-05',
  '1H': '2003-05-05',
  '4H': '2003-05-05',
  '1D': '1999-06-03'
}

type RawRow =
  | { timestamp: number; open: number; high: number; low: number; close: number; volume?: number }
  | [number, number, number, number, number, number?]

function toCandle(row: RawRow): Candle | null {
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

export async function downloadDukascopy(input: {
  symbol: string
  timeframe: Timeframe
  startTs: number
  endTs: number
  instrument?: string
  onProgress?: (message: string) => void
}): Promise<Candle[]> {
  const timeframe = TF_MAP[input.timeframe]
  const from = new Date(input.startTs)
  const to = new Date(input.endTs)
  const instrument = (input.instrument ?? input.symbol).toLowerCase()
  input.onProgress?.(
    `Dukascopy ${input.symbol} ${input.timeframe} ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`
  )

  const rows = (await getHistoricalRates({
    instrument: instrument as 'xauusd',
    dates: { from, to },
    timeframe: timeframe as 'm5',
    format: 'json',
    priceType: 'bid',
    volumes: true,
    ignoreFlats: true,
    useCache: true,
    cacheFolderPath: '.dukascopy-cache',
    batchSize: 15,
    pauseBetweenBatchesMs: 400,
    retryCount: 5,
    pauseBetweenRetriesMs: 500
  })) as RawRow[]

  const candles = rows.map(toCandle).filter((c): c is Candle => c !== null)
  input.onProgress?.(`Received ${candles.length.toLocaleString()} ${input.timeframe} candles.`)
  return candles
}
