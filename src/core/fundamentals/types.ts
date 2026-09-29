export type FundamentalSeriesId =
  | 'fed_funds'
  | 'fed_funds_lower'
  | 'unemployment'
  | 'cpi_yoy'
  | 'cpi_core'
  | 'nfp'
  | 'dxy'

export type FundamentalEventKind = 'fomc' | 'cpi' | 'nfp' | 'other'

export interface FundamentalPoint {
  ts: number
  value: number
  /** Reference period label when different from release day, e.g. "Aug 2026". */
  period?: string
}

export interface FundamentalSeries {
  id: FundamentalSeriesId
  unit: string
  points: FundamentalPoint[]
}

export interface FundamentalEvent {
  ts: number
  kind: FundamentalEventKind
  title: string
  actual?: number
  prior?: number
  impact: 'high' | 'medium'
}

export interface FundamentalBundle {
  series: FundamentalSeries[]
  events: FundamentalEvent[]
}

export interface FundamentalSnapshot {
  asOfTs: number
  /** Target range upper bound (DFEDTARU). */
  fedFunds: FundamentalPoint | null
  /** Target range lower bound (DFEDTARL). */
  fedFundsLower: FundamentalPoint | null
  unemployment: FundamentalPoint | null
  /** Headline CPI YoY % (CPIAUCSL). */
  cpiYoy: FundamentalPoint | null
  /** Core CPI YoY % (CPILFESL). */
  cpiCore: FundamentalPoint | null
  nfp: FundamentalPoint | null
  dxy: FundamentalPoint | null
  lastEvent: FundamentalEvent | null
  nextEvent: FundamentalEvent | null
  /** True when lastEvent falls on the same UTC calendar day as asOfTs. */
  justPrinted: boolean
}
