import { intervalMs } from '@core/candles/resample'
import { YAHOO_MAX_MS, yahooWindow } from '@core/market/catalog'
import { YAHOO_SYMBOLS } from '@shared/constants'
import type { Candle, Timeframe } from '@shared/types'

const INTERVAL_MAP: Record<Timeframe, string> = {
  '1M': '1m',
  '5M': '5m',
  '15M': '15m',
  '30M': '30m',
  '1H': '60m',
  '4H': '60m',
  '1D': '1d'
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>
          high?: Array<number | null>
          low?: Array<number | null>
          close?: Array<number | null>
          volume?: Array<number | null>
        }>
      }
    }>
    error?: { description?: string }
  }
}

export async function downloadYahoo(input: {
  symbol: string
  timeframe: Timeframe
  startTs: number
  endTs: number
  ticker?: string
  onProgress?: (message: string) => void
}): Promise<Candle[]> {
  const ticker = input.ticker ?? YAHOO_SYMBOLS[input.symbol] ?? input.symbol
  const interval = INTERVAL_MAP[input.timeframe]
  const range = yahooWindow(input.timeframe, input.startTs, input.endTs)
  const period1 = Math.floor(range.startTs / 1000)
  const period2 = Math.floor(range.endTs / 1000)
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?period1=${period1}&period2=${period2}&interval=${interval}&includePrePost=false`

  input.onProgress?.(`Requesting ${ticker} ${interval} from Yahoo Finance…`)

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'KairosStrategyTester/1.0',
      Accept: 'application/json'
    }
  })
  if (!response.ok) {
    const days = Math.round(YAHOO_MAX_MS[input.timeframe] / 86_400_000)
    throw new Error(
      `Yahoo Finance returned ${response.status} for ${ticker} ${interval}. That interval only keeps about ${days} days.`
    )
  }

  const payload = (await response.json()) as YahooChartResponse
  const result = payload.chart?.result?.[0]
  if (!result?.timestamp?.length) {
    throw new Error(
      payload.chart?.error?.description ??
        'Yahoo returned no candles. Intraday history is limited (1m ≈ 7 days, 5m ≈ 60 days).'
    )
  }

  const quote = result.indicators?.quote?.[0]
  const candles: Candle[] = []
  for (let i = 0; i < result.timestamp.length; i++) {
    const open = quote?.open?.[i]
    const high = quote?.high?.[i]
    const low = quote?.low?.[i]
    const close = quote?.close?.[i]
    if (![open, high, low, close].every((n) => typeof n === 'number' && Number.isFinite(n))) {
      continue
    }
    candles.push({
      timestamp: result.timestamp[i] * 1000,
      open: open as number,
      high: high as number,
      low: low as number,
      close: close as number,
      volume: quote?.volume?.[i] ?? undefined
    })
  }

  if (input.timeframe === '4H') {
    const size = intervalMs('4H')
    const grouped = new Map<number, Candle[]>()
    for (const c of candles) {
      const key = Math.floor(c.timestamp / size) * size
      const list = grouped.get(key)
      if (list) list.push(c)
      else grouped.set(key, [c])
    }
    return [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([timestamp, bars]) => ({
        timestamp,
        open: bars[0].open,
        high: Math.max(...bars.map((b) => b.high)),
        low: Math.min(...bars.map((b) => b.low)),
        close: bars[bars.length - 1].close,
        volume: bars.reduce((s, b) => s + (b.volume ?? 0), 0)
      }))
  }

  input.onProgress?.(`Received ${candles.length.toLocaleString()} candles.`)
  return candles
}
