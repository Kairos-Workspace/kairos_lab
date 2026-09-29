export type FundamentalSeriesId = 'fed_funds' | 'unemployment' | 'cpi_yoy' | 'nfp' | 'dxy'

export type FundamentalEventKind = 'fomc' | 'cpi' | 'nfp' | 'other'

export interface FundamentalPoint {
  ts: number
  value: number
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
  fedFunds: FundamentalPoint | null
  unemployment: FundamentalPoint | null
  cpiYoy: FundamentalPoint | null
  nfp: FundamentalPoint | null
  dxy: FundamentalPoint | null
  lastEvent: FundamentalEvent | null
  nextEvent: FundamentalEvent | null
  /** True when lastEvent falls on the same UTC calendar day as asOfTs. */
  justPrinted: boolean
}
