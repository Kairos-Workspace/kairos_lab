import type { CostConfig, StrategySettings, Timeframe } from './types'

export const PRODUCT_NAME = 'Quantify'
export const DEFAULT_SYMBOL = 'XAUUSD'

export const TIMEFRAME_MINUTES: Record<Timeframe, number> = {
  '1M': 1,
  '5M': 5,
  '15M': 15,
  '30M': 30,
  '1H': 60,
  '4H': 240,
  '1D': 1440
}

export const DEFAULT_COSTS: CostConfig = {
  spread: 0.2,
  commission: 0,
  slippage: 0.05,
  minLot: 0.01,
  lotStep: 0.01,
  contractSize: 100,
  tickSize: 0.01,
  tickValue: 1
}

export const DEFAULT_STRATEGY_SETTINGS: StrategySettings = {
  strategyId: 'breakout',
  lookback: 20,
  defaultRr: 3,
  autoEntry: false,
  pauseOnSetup: true,
  volumeMultiplier: 1.2
}

export const DEFAULT_BALANCE = 10_000
export const DEFAULT_RISK_PCT = 1
export const BASE_TICK_MS = 280
export const WARMUP_BARS = 50

export const YAHOO_SYMBOLS: Record<string, string> = {
  XAUUSD: 'GC=F',
  EURUSD: 'EURUSD=X',
  GBPUSD: 'GBPUSD=X',
  USDJPY: 'JPY=X',
  NAS100: 'NQ=F',
  US30: 'YM=F',
  SPX500: 'ES=F'
}
