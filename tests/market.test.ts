import { describe, expect, it } from 'vitest'
import { downloadWindow, latestWindow, resolveMarketSource, yahooWindow } from '@core/market/catalog'

describe('resolveMarketSource', () => {
  it('sends gold and FX to Dukascopy', () => {
    expect(resolveMarketSource('XAUUSD')).toEqual({ source: 'dukascopy', instrument: 'xauusd' })
    expect(resolveMarketSource('eurusd')).toEqual({ source: 'dukascopy', instrument: 'eurusd' })
    expect(resolveMarketSource('AUDUSD')).toEqual({ source: 'dukascopy', instrument: 'audusd' })
  })

  it('maps index aliases to Dukascopy instruments', () => {
    expect(resolveMarketSource('NAS100').instrument).toBe('usatechidxusd')
    expect(resolveMarketSource('US30').instrument).toBe('usa30idxusd')
    expect(resolveMarketSource('SPX500').instrument).toBe('usa500idxusd')
  })

  it('falls back to Yahoo for unknown tickers', () => {
    expect(resolveMarketSource('AAPL')).toEqual({ source: 'yahoo', instrument: 'AAPL' })
  })
})

describe('downloadWindow', () => {
  const now = Date.UTC(2026, 8, 6)

  it('uses the requested lookback for hourly tapes', () => {
    const span = 2 * 365 * 86_400_000
    expect(downloadWindow('1H', span, now)).toEqual({ startTs: now - span, endTs: now })
  })

  it('clamps minute tapes so the free pull stays light', () => {
    const huge = 5 * 365 * 86_400_000
    const window = downloadWindow('1M', huge, now)
    expect(window.endTs - window.startTs).toBeLessThanOrEqual(30 * 86_400_000)
  })
})

describe('latestWindow', () => {
  const now = Date.UTC(2026, 8, 6)
  const day = 86_400_000

  it('starts from the last stored bar up to now', () => {
    const last = now - 10 * day
    expect(latestWindow(last, now)).toEqual({ startTs: last, endTs: now })
  })

  it('overlaps a few days so a fresh tape still has a real range', () => {
    const window = latestWindow(now - 60_000, now)
    expect(window.endTs).toBe(now)
    expect(window.endTs - window.startTs).toBeGreaterThanOrEqual(3 * day)
  })

  it('ignores impossible last timestamps', () => {
    expect(latestWindow(1_000, now)).toEqual({ startTs: now - 14 * day, endTs: now })
  })
})

describe('yahooWindow', () => {
  const now = Date.UTC(2026, 8, 6)
  const day = 86_400_000

  it('clamps 5M history to 60 days', () => {
    const window = yahooWindow('5M', now - 200 * day, now)
    expect(window.endTs - window.startTs).toBeLessThanOrEqual(60 * day)
  })

  it('clamps hourly history to 730 days', () => {
    const window = yahooWindow('1H', now - 5 * 365 * day, now)
    expect(window.endTs - window.startTs).toBeLessThanOrEqual(730 * day)
  })

  it('never asks Yahoo for a near-zero range', () => {
    const window = yahooWindow('1H', now, now)
    expect(window.endTs - window.startTs).toBeGreaterThanOrEqual(day)
  })
})
