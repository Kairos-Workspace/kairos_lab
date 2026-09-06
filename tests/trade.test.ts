import { describe, expect, it } from 'vitest'
import { evaluateTradeOnCandle, resolveAmbiguousTouch } from '@core/trade/simulation'
import { applyClosedTrade, createAccount } from '@core/trade/account'
import { candle } from './helpers'
import type { Trade } from '@shared/types'

function openTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 't1',
    sessionId: 's1',
    symbol: 'XAUUSD',
    direction: 'BUY',
    entry: 2000,
    stopLoss: 1990,
    takeProfit: 2030,
    positionSize: 0.2,
    riskAmount: 200,
    openedAt: 1,
    ...overrides
  }
}

describe('trade simulation', () => {
  it('closes a long as a loss when the low trades through the stop', () => {
    const trade = openTrade()
    const bar = candle(2, 2001, 2002, 1988, 1995)
    const result = evaluateTradeOnCandle(trade, bar, { contractSize: 100 })
    expect(result.closed).toBe(true)
    expect(result.result).toBe('LOSS')
    expect(result.exit).toBe(1990)
    expect(result.rMultiple).toBe(-1)
    expect(result.pnl).toBe(-200)
  })

  it('closes a long as a win when the high trades through take profit', () => {
    const trade = openTrade()
    const bar = candle(2, 2001, 2031, 1999, 2025)
    const result = evaluateTradeOnCandle(trade, bar, { contractSize: 100 })
    expect(result.closed).toBe(true)
    expect(result.result).toBe('WIN')
    expect(result.exit).toBe(2030)
    expect(result.rMultiple).toBe(3)
    expect(result.pnl).toBe(600)
  })

  it('closes a short as a loss when the high trades through the stop', () => {
    const trade = openTrade({ direction: 'SELL', stopLoss: 2010, takeProfit: 1970 })
    const bar = candle(2, 1999, 2012, 1995, 2005)
    const result = evaluateTradeOnCandle(trade, bar, { contractSize: 100 })
    expect(result.closed).toBe(true)
    expect(result.result).toBe('LOSS')
    expect(result.exit).toBe(2010)
  })

  it('uses lower-timeframe path when both levels trade in the same bar', () => {
    const trade = openTrade()
    const bar = candle(10, 2000, 2031, 1988, 2020)
    const path = [
      candle(10, 2000, 2001, 1999, 2000),
      candle(11, 2000, 2001, 1988, 1992),
      candle(12, 1992, 2031, 1991, 2020)
    ]
    const result = evaluateTradeOnCandle(trade, bar, { contractSize: 100, lowerTimeframe: path })
    expect(result.result).toBe('LOSS')
    expect(result.exit).toBe(1990)
  })

  it('marks the outcome ambiguous when both levels trade and no path exists', () => {
    const trade = openTrade()
    const bar = candle(2, 2000, 2031, 1988, 2020)
    const result = evaluateTradeOnCandle(trade, bar, {
      contractSize: 100,
      ambiguityRule: 'ambiguous'
    })
    expect(result.result).toBe('AMBIGUOUS')
    expect(result.closed).toBe(true)
  })

  it('applies sl-first when configured and both levels trade', () => {
    const outcome = resolveAmbiguousTouch('sl-first')
    expect(outcome).toBe('LOSS')
  })

  it('updates account equity after a winning trade', () => {
    const account = createAccount(10_000, 1)
    const next = applyClosedTrade(account, 600)
    expect(next.balance).toBe(10_600)
    expect(next.equity).toBe(10_600)
  })
})
