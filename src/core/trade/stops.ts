import type { CostConfig, Direction, StrategySettings } from '@shared/types'

export function defaultStopTarget(
  direction: Direction,
  entry: number,
  costs: CostConfig,
  settings: StrategySettings
): { stopLoss: number; takeProfit: number } {
  const slDist = Math.max(costs.tickSize * 50, entry * 0.0015)
  const stopLoss = direction === 'BUY' ? entry - slDist : entry + slDist
  const takeProfit =
    direction === 'BUY' ? entry + slDist * settings.defaultRr : entry - slDist * settings.defaultRr
  return { stopLoss, takeProfit }
}
