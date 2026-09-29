import { describe, expect, it } from 'vitest'
import {
  fundamentalsAsOf,
  lastEvent,
  latestPoint,
  nextEvent,
  resolveFundamentals
} from '@core/fundamentals/asOf'
import type { FundamentalEvent, FundamentalSeries } from '@core/fundamentals/types'

const fed: FundamentalSeries = {
  id: 'fed_funds',
  unit: '%',
  points: [
    { ts: 1_000, value: 5.25 },
    { ts: 2_000, value: 5.5 },
    { ts: 3_000, value: 5.25 }
  ]
}

const events: FundamentalEvent[] = [
  { ts: 1_500, kind: 'fomc', title: 'FOMC hold', impact: 'high', actual: 5.25 },
  { ts: 2_500, kind: 'cpi', title: 'CPI YoY', impact: 'high', actual: 3.2, prior: 3.4 },
  { ts: 3_500, kind: 'nfp', title: 'NFP', impact: 'high', actual: 180 }
]

describe('latestPoint', () => {
  it('returns null before the first point', () => {
    expect(latestPoint(fed, 500)).toBeNull()
  })

  it('returns the point on an exact timestamp', () => {
    expect(latestPoint(fed, 2_000)).toEqual({ ts: 2_000, value: 5.5 })
  })

  it('returns the last point at or before asOf', () => {
    expect(latestPoint(fed, 2_500)).toEqual({ ts: 2_000, value: 5.5 })
  })

  it('returns the last point when asOf is after the series', () => {
    expect(latestPoint(fed, 9_999)).toEqual({ ts: 3_000, value: 5.25 })
  })
})

describe('lastEvent / nextEvent', () => {
  it('finds the last event at or before asOf', () => {
    expect(lastEvent(events, 2_600)?.kind).toBe('cpi')
  })

  it('finds the next event after asOf', () => {
    expect(nextEvent(events, 2_000)?.kind).toBe('cpi')
  })

  it('filters by kind', () => {
    expect(nextEvent(events, 1_000, ['nfp'])?.kind).toBe('nfp')
    expect(lastEvent(events, 9_999, ['fomc'])?.kind).toBe('fomc')
  })

  it('returns null when none match', () => {
    expect(nextEvent(events, 9_999)).toBeNull()
    expect(lastEvent(events, 100)).toBeNull()
  })
})

describe('fundamentalsAsOf', () => {
  const candles = [
    { timestamp: 1_000 },
    { timestamp: 2_000 },
    { timestamp: 3_000 }
  ]

  it('uses replayIndex candle in replay mode', () => {
    expect(fundamentalsAsOf({ mode: 'replay', replayIndex: 1, displayCandles: candles })).toBe(2_000)
  })

  it('uses the last candle in view mode', () => {
    expect(fundamentalsAsOf({ mode: 'view', replayIndex: 0, displayCandles: candles })).toBe(3_000)
  })

  it('returns null when the tape is empty', () => {
    expect(fundamentalsAsOf({ mode: 'view', replayIndex: 0, displayCandles: [] })).toBeNull()
  })
})

describe('resolveFundamentals', () => {
  it('builds a snapshot from series + events', () => {
    const snap = resolveFundamentals(
      {
        series: [fed, { id: 'unemployment', unit: '%', points: [{ ts: 1_800, value: 4.1 }] }],
        events
      },
      2_600
    )
    expect(snap.fedFunds?.value).toBe(5.5)
    expect(snap.unemployment?.value).toBe(4.1)
    expect(snap.lastEvent?.kind).toBe('cpi')
    expect(snap.nextEvent?.kind).toBe('nfp')
    expect(snap.justPrinted).toBe(true)
  })
})
