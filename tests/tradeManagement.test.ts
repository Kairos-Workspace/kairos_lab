import { describe, expect, it } from 'vitest'
import {
  calculateTargetPriceFromRr,
  moveToBreakEven,
  partialCloseTrade
} from '@core/trade/management'
import type { CostConfig, Trade } from '@shared/types'

const ZERO_COSTS: CostConfig = {
  spread: 0,
  slippage: 0,
  commission: 0,
  contractSize: 100,
  minLot: 0.01,
  lotStep: 0.01,
  tickSize: 0.01,
  tickValue: 1
}

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
    openedAt: 1000,
    ...overrides
  }
}

describe('trade management', () => {
  it('moves stop loss to break-even on BUY trade', () => {
    const trade = openTrade({ direction: 'BUY', entry: 2000, stopLoss: 1990 })
    const beTrade = moveToBreakEven(trade)
    expect(beTrade.stopLoss).toBe(2000)
    expect(beTrade.entry).toBe(2000)
  })

  it('moves stop loss to break-even with offset on BUY trade', () => {
    const trade = openTrade({ direction: 'BUY', entry: 2000, stopLoss: 1990 })
    const beTrade = moveToBreakEven(trade, 0.5)
    expect(beTrade.stopLoss).toBe(2000.5)
  })

  it('moves stop loss to break-even on SELL trade', () => {
    const trade = openTrade({ direction: 'SELL', entry: 2000, stopLoss: 2010 })
    const beTrade = moveToBreakEven(trade)
    expect(beTrade.stopLoss).toBe(2000)
  })

  it('moves stop loss to break-even with offset on SELL trade', () => {
    const trade = openTrade({ direction: 'SELL', entry: 2000, stopLoss: 2010 })
    const beTrade = moveToBreakEven(trade, 0.5)
    expect(beTrade.stopLoss).toBe(1999.5)
  })

  it('calculates target price from target R:R correctly for BUY and SELL', () => {
    // BUY: entry 2000, stop 1990 => risk = 10. 1:2 RR => 2020. 1:3 RR => 2030.
    expect(calculateTargetPriceFromRr(2000, 1990, 'BUY', 2)).toBe(2020)
    expect(calculateTargetPriceFromRr(2000, 1990, 'BUY', 1.5)).toBe(2015)
    expect(calculateTargetPriceFromRr(2000, 1990, 'BUY', 3)).toBe(2030)

    // SELL: entry 2000, stop 2015 => risk = 15. 1:2 RR => 1970.
    expect(calculateTargetPriceFromRr(2000, 2015, 'SELL', 2)).toBe(1970)
    expect(calculateTargetPriceFromRr(2000, 2015, 'SELL', 3)).toBe(1955)
  })

  it('partially closes 50% of position and realizes proportional P&L', () => {
    const trade = openTrade({ positionSize: 0.2, entry: 2000, stopLoss: 1990 })
    // Current price is 2010 (+10 pts) -> 0.10 lots * 10 pts * 100 contract size = +$100
    const result = partialCloseTrade(trade, 50, 2010, ZERO_COSTS, 2000, () => 'part-1')

    expect(result.closedLots).toBe(0.1)
    expect(result.remainingTrade).not.toBeNull()
    expect(result.remainingTrade?.positionSize).toBe(0.1)
    expect(result.closedTrade.positionSize).toBe(0.1)
    expect(result.closedTrade.pnl).toBe(100)
    expect(result.closedTrade.rMultiple).toBe(1)
    expect(result.closedTrade.result).toBe('WIN')
    expect(result.closedTrade.reason).toBe('Partial close (50%)')
  })

  it('fully closes position when 100% is requested', () => {
    const trade = openTrade({ positionSize: 0.2, entry: 2000, stopLoss: 1990 })
    const result = partialCloseTrade(trade, 100, 2015, ZERO_COSTS, 2500)

    expect(result.remainingTrade).toBeNull()
    expect(result.closedTrade.positionSize).toBe(0.2)
    expect(result.closedTrade.pnl).toBe(300) // 0.2 * 15 * 100 = 300
    expect(result.closedTrade.rMultiple).toBe(1.5)
    expect(result.closedTrade.reason).toBe('Market close')
  })

  it('closes entire position if remaining lots would fall below minLot', () => {
    const trade = openTrade({ positionSize: 0.01, entry: 2000, stopLoss: 1990 })
    const result = partialCloseTrade(trade, 50, 2010, ZERO_COSTS, 2000)

    expect(result.remainingTrade).toBeNull()
    expect(result.closedTrade.positionSize).toBe(0.01)
  })
})
