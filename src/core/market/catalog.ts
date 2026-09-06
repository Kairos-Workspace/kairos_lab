import type { Timeframe } from '@shared/types'

export type MarketGroup = 'metal' | 'fx' | 'index' | 'crypto'
export type MarketSource = 'dukascopy' | 'yahoo'

export interface MarketInstrument {
  symbol: string
  name: string
  group: MarketGroup
  dukascopy?: string
  yahoo?: string
}

export interface MarketRoute {
  source: MarketSource
  instrument: string
}

export const MARKET_CATALOG: MarketInstrument[] = [
  { symbol: 'XAUUSD', name: 'Gold', group: 'metal', dukascopy: 'xauusd', yahoo: 'GC=F' },
  { symbol: 'XAGUSD', name: 'Silver', group: 'metal', dukascopy: 'xagusd', yahoo: 'SI=F' },
  { symbol: 'EURUSD', name: 'Euro / Dollar', group: 'fx', dukascopy: 'eurusd', yahoo: 'EURUSD=X' },
  { symbol: 'GBPUSD', name: 'Cable', group: 'fx', dukascopy: 'gbpusd', yahoo: 'GBPUSD=X' },
  { symbol: 'USDJPY', name: 'Dollar / Yen', group: 'fx', dukascopy: 'usdjpy', yahoo: 'JPY=X' },
  { symbol: 'AUDUSD', name: 'Aussie', group: 'fx', dukascopy: 'audusd', yahoo: 'AUDUSD=X' },
  { symbol: 'USDCAD', name: 'Loonie', group: 'fx', dukascopy: 'usdcad', yahoo: 'CAD=X' },
  { symbol: 'USDCHF', name: 'Swissy', group: 'fx', dukascopy: 'usdchf', yahoo: 'CHF=X' },
  { symbol: 'NZDUSD', name: 'Kiwi', group: 'fx', dukascopy: 'nzdusd', yahoo: 'NZDUSD=X' },
  { symbol: 'NAS100', name: 'Nasdaq 100', group: 'index', dukascopy: 'usatechidxusd', yahoo: 'NQ=F' },
  { symbol: 'US30', name: 'Dow Jones', group: 'index', dukascopy: 'usa30idxusd', yahoo: 'YM=F' },
  { symbol: 'SPX500', name: 'S&P 500', group: 'index', dukascopy: 'usa500idxusd', yahoo: 'ES=F' },
  { symbol: 'BTCUSD', name: 'Bitcoin', group: 'crypto', dukascopy: 'btcusd', yahoo: 'BTC-USD' }
]

const DAY = 86_400_000
const MIN_REFRESH_SPAN = 3 * DAY
const RECENT_LOOKBACK = 14 * DAY
const EARLIEST_SANE_TS = Date.UTC(1990, 0, 1)

export const YAHOO_MAX_MS: Record<Timeframe, number> = {
  '1M': 7 * DAY,
  '5M': 60 * DAY,
  '15M': 60 * DAY,
  '30M': 60 * DAY,
  '1H': 730 * DAY,
  '4H': 730 * DAY,
  '1D': 10 * 365 * DAY
}

export const DOWNLOAD_LOOKBACKS = [
  { id: '6m', label: '6 months', ms: 180 * DAY },
  { id: '1y', label: '1 year', ms: 365 * DAY },
  { id: '2y', label: '2 years', ms: 2 * 365 * DAY },
  { id: '5y', label: '5 years', ms: 5 * 365 * DAY }
] as const

export type DownloadLookbackId = (typeof DOWNLOAD_LOOKBACKS)[number]['id']

export function normalizeSymbol(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

export function findMarketInstrument(symbol: string): MarketInstrument | undefined {
  const code = normalizeSymbol(symbol)
  return MARKET_CATALOG.find((row) => row.symbol === code)
}

export function resolveMarketSource(symbol: string): MarketRoute {
  const code = normalizeSymbol(symbol)
  const row = findMarketInstrument(code)
  if (row?.dukascopy) return { source: 'dukascopy', instrument: row.dukascopy }
  if (row?.yahoo) return { source: 'yahoo', instrument: row.yahoo }
  if (/^[A-Z]{6}$/.test(code)) return { source: 'dukascopy', instrument: code.toLowerCase() }
  return { source: 'yahoo', instrument: symbol.trim() || code }
}

export function timeframeCapMs(timeframe: Timeframe): number {
  if (timeframe === '1M') return 30 * DAY
  if (timeframe === '5M') return 180 * DAY
  if (timeframe === '15M') return 365 * DAY
  if (timeframe === '30M') return 2 * 365 * DAY
  return 10 * 365 * DAY
}

export function downloadWindow(
  timeframe: Timeframe,
  lookbackMs: number,
  now = Date.now()
): { startTs: number; endTs: number } {
  const span = Math.max(DAY, Math.min(lookbackMs, timeframeCapMs(timeframe)))
  return { startTs: now - span, endTs: now }
}

export function latestWindow(lastTs: number, now = Date.now()): { startTs: number; endTs: number } {
  const endTs = now
  const saneLast = lastTs >= EARLIEST_SANE_TS && lastTs < now + DAY ? lastTs : now - RECENT_LOOKBACK
  return {
    startTs: Math.min(saneLast, endTs - MIN_REFRESH_SPAN),
    endTs
  }
}

export function recentWindow(now = Date.now()): { startTs: number; endTs: number } {
  return { startTs: now - RECENT_LOOKBACK, endTs: now }
}

export function yahooWindow(
  timeframe: Timeframe,
  startTs: number,
  endTs: number
): { startTs: number; endTs: number } {
  const end = Math.max(endTs, startTs + DAY)
  const maxSpan = YAHOO_MAX_MS[timeframe]
  let start = startTs
  if (end - start > maxSpan) start = end - maxSpan
  if (end - start < DAY) start = end - DAY
  return { startTs: start, endTs: end }
}
