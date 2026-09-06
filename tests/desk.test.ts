import { describe, expect, it } from 'vitest'
import { DEFAULT_DESK_PREFS, parseDeskPrefs } from '@core/desk/prefs'

describe('parseDeskPrefs', () => {
  it('returns defaults for junk', () => {
    expect(parseDeskPrefs(null)).toEqual(DEFAULT_DESK_PREFS)
    expect(parseDeskPrefs('nope')).toEqual(DEFAULT_DESK_PREFS)
  })

  it('keeps a valid local desk snapshot', () => {
    const prefs = parseDeskPrefs({
      symbol: 'eurusd',
      displayTimeframe: '15M',
      speed: 5,
      costs: { spread: 1.2 },
      ambiguityRule: 'sl-first',
      riskPerTrade: 2,
      initialBalance: 25_000,
      lastStrategyId: 'abc',
      lastDatasetId: 12,
      theme: 'light'
    })
    expect(prefs.symbol).toBe('EURUSD')
    expect(prefs.displayTimeframe).toBe('15M')
    expect(prefs.speed).toBe(5)
    expect(prefs.costs.spread).toBe(1.2)
    expect(prefs.costs.commission).toBe(DEFAULT_DESK_PREFS.costs.commission)
    expect(prefs.ambiguityRule).toBe('sl-first')
    expect(prefs.riskPerTrade).toBe(2)
    expect(prefs.initialBalance).toBe(25_000)
    expect(prefs.lastStrategyId).toBe('abc')
    expect(prefs.lastDatasetId).toBe(12)
    expect(prefs.theme).toBe('light')
  })

  it('drops impossible timeframe and speed values', () => {
    const prefs = parseDeskPrefs({ displayTimeframe: '3H', speed: 99, theme: 'neon' })
    expect(prefs.displayTimeframe).toBe('1H')
    expect(prefs.speed).toBe(1)
    expect(prefs.theme).toBe('dark')
  })
})
