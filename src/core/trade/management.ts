import type { CostConfig, Direction, Trade } from '@shared/types'
import { applyCosts, roundLot } from './sizing'

/**
 * Moves stop loss to entry price (or entry + offset to cover spread/costs).
 */
export function moveToBreakEven(trade: Trade, offset = 0): Trade {
  const dir = trade.direction === 'BUY' ? 1 : -1
  const stopLoss = Number((trade.entry + offset * dir).toFixed(2))
  return {
    ...trade,
    stopLoss
  }
}

/**
 * Calculates a take profit price given an entry, stop loss, direction, and target R:R.
 */
export function calculateTargetPriceFromRr(
  entry: number,
  stopLoss: number,
  direction: Direction,
  targetRr: number
): number {
  const risk = Math.abs(entry - stopLoss)
  const dir = direction === 'BUY' ? 1 : -1
  return Number((entry + risk * targetRr * dir).toFixed(2))
}

export interface PartialCloseResult {
  remainingTrade: Trade | null
  closedTrade: Trade
  realizedPnl: number
  closedLots: number
}

/**
 * Partially (or fully) closes an open trade at current market price.
 */
export function partialCloseTrade(
  trade: Trade,
  percent: number,
  currentPrice: number,
  costs: CostConfig,
  closedAt: number = Date.now(),
  idGenerator: () => string = () => `trade-${Date.now()}`
): PartialCloseResult {
  const pct = Math.max(1, Math.min(100, percent))
  const isFullClose = pct >= 100

  // Calculate closed lot size
  const rawClosingLots = (trade.positionSize * pct) / 100
  const closedLots = isFullClose
    ? trade.positionSize
    : roundLot(rawClosingLots, costs.minLot, costs.lotStep)

  const rawRemaining = Number((trade.positionSize - closedLots).toFixed(4))
  const actuallyFullClose = isFullClose || rawRemaining < costs.minLot

  const effectiveClosedLots = actuallyFullClose ? trade.positionSize : closedLots
  const remainingLots = actuallyFullClose
    ? 0
    : roundLot(rawRemaining, costs.minLot, costs.lotStep)

  // Calculate P&L for closed lots
  const dir = trade.direction === 'BUY' ? 1 : -1
  const rawPnl =
    (currentPrice - trade.entry) * dir * effectiveClosedLots * costs.contractSize
  const realizedPnl = applyCosts(rawPnl, effectiveClosedLots, costs)

  // Calculate R-multiple
  const riskDist = Math.abs(trade.entry - trade.stopLoss)
  const rMultiple =
    riskDist > 0 ? ((currentPrice - trade.entry) * dir) / riskDist : 0

  const closedTrade: Trade = {
    ...trade,
    id: actuallyFullClose ? trade.id : idGenerator(),
    positionSize: effectiveClosedLots,
    riskAmount: trade.riskAmount * (effectiveClosedLots / trade.positionSize),
    result: realizedPnl >= 0 ? 'WIN' : 'LOSS',
    pnl: realizedPnl,
    rMultiple,
    closedAt,
    reason: actuallyFullClose
      ? 'Market close'
      : `Partial close (${pct}%)`
  }

  const remainingTrade: Trade | null = actuallyFullClose
    ? null
    : {
        ...trade,
        positionSize: remainingLots,
        riskAmount: Math.max(0, trade.riskAmount - closedTrade.riskAmount)
      }

  return {
    remainingTrade,
    closedTrade,
    realizedPnl,
    closedLots: effectiveClosedLots
  }
}
