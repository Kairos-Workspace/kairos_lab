import { DEFAULT_COSTS } from '@shared/constants'
import type { CostConfig } from '@shared/types'

export function roundLot(raw: number, minLot: number, lotStep: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return minLot
  const stepped = Math.floor(raw / lotStep) * lotStep
  const rounded = Math.round(stepped * 100) / 100
  return Math.max(minLot, rounded)
}

export function calculatePositionSize(input: {
  balance: number
  riskPercent: number
  entry: number
  stopLoss: number
  costs?: CostConfig
}): { positionSize: number; riskAmount: number; stopDistance: number } {
  const costs = input.costs ?? DEFAULT_COSTS
  const riskAmount = input.balance * (input.riskPercent / 100)
  const stopDistance = Math.abs(input.entry - input.stopLoss)
  if (stopDistance === 0) {
    return { positionSize: costs.minLot, riskAmount, stopDistance: 0 }
  }
  const rawLots = riskAmount / (stopDistance * costs.contractSize)
  return {
    positionSize: roundLot(rawLots, costs.minLot, costs.lotStep),
    riskAmount,
    stopDistance
  }
}

export function riskReward(entry: number, stopLoss: number, takeProfit: number): number {
  const risk = Math.abs(entry - stopLoss)
  const reward = Math.abs(takeProfit - entry)
  if (risk === 0) return 0
  return reward / risk
}

export function applyCosts(
  rawPnl: number,
  positionSize: number,
  costs: CostConfig
): number {
  const spreadCost = costs.spread * positionSize * costs.contractSize
  const slipCost = costs.slippage * positionSize * costs.contractSize
  return rawPnl - spreadCost - slipCost - costs.commission
}
