import { describe, expect, it } from 'vitest'
import { calculatePerformance } from '@core/performance/stats'
import type { Trade } from '@shared/types'

function closed(
  id: string,
  result: Trade['result'],
  pnl: number,
  rMultiple: number,
  openedAt: number
): Trade {
  return {
    id,
    sessionId: 's',
    symbol: 'XAUUSD',
    direction: 'BUY',
    entry: 1,
    stopLoss: 0,
    takeProfit: 2,
    positionSize: 0.1,
    riskAmount: 100,
    result,
    pnl,
    rMultiple,
    openedAt,
    closedAt: openedAt + 1
  }
}

describe('calculatePerformance', () => {
  it('computes win rate, profit factor, expectancy, and drawdown', () => {
    const trades = [
      closed('1', 'WIN', 300, 3, 1),
      closed('2', 'LOSS', -100, -1, 2),
      closed('3', 'WIN', 200, 2, 3),
      closed('4', 'LOSS', -100, -1, 4)
    ]
    const stats = calculatePerformance(trades, 10_000, [])
    expect(stats.totalTrades).toBe(4)
    expect(stats.winningTrades).toBe(2)
    expect(stats.losingTrades).toBe(2)
    expect(stats.winRate).toBe(50)
    expect(stats.netPnl).toBe(300)
    expect(stats.grossProfit).toBe(500)
    expect(stats.grossLoss).toBe(200)
    expect(stats.profitFactor).toBeCloseTo(2.5)
    expect(stats.averageR).toBeCloseTo(0.75)
    expect(stats.expectancy).toBeCloseTo(0.75)
    expect(stats.maxDrawdownUsd).toBe(100)
    expect(stats.equityCurve).toHaveLength(5)
    expect(stats.equityCurve.at(-1)?.equity).toBe(10_300)
  })

  it('tracks skipped setups separately from taken trades', () => {
    const taken = [closed('1', 'WIN', 100, 1, 1)]
    const skipped = [
      { ...closed('2', undefined, 0, 0, 2), skipped: true, result: undefined, pnl: undefined }
    ]
    const stats = calculatePerformance(taken, 10_000, skipped)
    expect(stats.totalTrades).toBe(1)
    expect(stats.skippedSetups).toBe(1)
    expect(stats.totalSetups).toBe(2)
    expect(stats.takenSetups).toBe(1)
  })

  it('counts consecutive wins and losses', () => {
    const trades = [
      closed('1', 'WIN', 100, 1, 1),
      closed('2', 'WIN', 100, 1, 2),
      closed('3', 'WIN', 100, 1, 3),
      closed('4', 'LOSS', -100, -1, 4),
      closed('5', 'LOSS', -100, -1, 5)
    ]
    const stats = calculatePerformance(trades, 10_000, [])
    expect(stats.maxConsecutiveWins).toBe(3)
    expect(stats.maxConsecutiveLosses).toBe(2)
  })
})
