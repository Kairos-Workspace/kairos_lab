import type { Strategy, StrategySettings } from '@shared/types'
import { BbmaStrategy } from './bbma'
import { BreakoutStrategy } from './breakout'
import { MaCrossoverStrategy } from './ma-crossover'
import { NoneStrategy } from './none'

export const STRATEGY_CATALOG = [
  {
    id: 'breakout',
    name: 'Breakout Strategy',
    description: 'Close breaks the prior N-bar high or low, with volume confirmation.'
  },
  {
    id: 'ma-crossover',
    name: 'MA Crossover',
    description: 'Fast SMA crossing the slow SMA.'
  },
  {
    id: 'bbma',
    name: 'BBMA',
    description: 'BB extreme, then re-entry on MA5/MA10 high-low toward MA50.'
  },
  {
    id: 'none',
    name: 'None',
    description: 'No automated signals — chart replay and manual trade entry only.'
  }
] as const

export function createStrategy(settings: StrategySettings): Strategy {
  if (settings.strategyId === 'none') {
    return new NoneStrategy()
  }
  if (settings.strategyId === 'ma-crossover') {
    return new MaCrossoverStrategy({
      fast: Math.max(2, Math.round(settings.lookback / 2)),
      slow: settings.lookback
    })
  }
  if (settings.strategyId === 'bbma') {
    return new BbmaStrategy({ bbPeriod: settings.lookback })
  }
  return new BreakoutStrategy({
    lookback: settings.lookback,
    volumeMultiplier: settings.volumeMultiplier
  })
}
