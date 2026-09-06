export const TIMEFRAMES = ['1M', '5M', '15M', '30M', '1H', '4H', '1D'] as const
export type Timeframe = (typeof TIMEFRAMES)[number]

export const SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'NAS100', 'US30', 'SPX500'] as const
export type SymbolCode = (typeof SYMBOLS)[number]

export interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export type Direction = 'BUY' | 'SELL'
export type TradeResult = 'WIN' | 'LOSS' | 'BREAKEVEN' | 'AMBIGUOUS'
export type AmbiguityRule = 'sl-first' | 'tp-first' | 'random' | 'ambiguous'
export type SessionName = 'Asia' | 'London' | 'New York'

export interface StrategySignal {
  type: 'LONG' | 'SHORT'
  timestamp: number
  price: number
  reason?: string
  strategy: string
}

export interface StrategyContext {
  candles: Candle[]
  symbol: string
  timeframe: Timeframe
}

export interface Strategy {
  id: string
  name: string
  description: string
  initialize(): void
  onCandle(candle: Candle, context: StrategyContext): StrategySignal | null
}

export interface CostConfig {
  spread: number
  commission: number
  slippage: number
  minLot: number
  lotStep: number
  contractSize: number
  tickSize: number
  tickValue: number
}

export interface AccountState {
  initialBalance: number
  balance: number
  equity: number
  riskPerTrade: number
}

export interface Trade {
  id: string
  sessionId: string
  symbol: string
  direction: Direction
  entry: number
  stopLoss: number
  takeProfit: number
  positionSize: number
  riskAmount: number
  result?: TradeResult
  pnl?: number
  rMultiple?: number
  openedAt: number
  closedAt?: number
  strategy?: string
  reason?: string
  skipped?: boolean
}

export interface DatasetInfo {
  id: number
  symbol: string
  timeframe: Timeframe
  source: string
  startTs: number
  endTs: number
  candleCount: number
  createdAt: number
  version: number
  gapCount: number
}

export interface DataGap {
  fromTs: number
  toTs: number
  expectedBars?: number
}

export interface ValidationReport {
  valid: boolean
  duplicates: number
  invalidOhlc: number
  unordered: number
  gaps: DataGap[]
}

export interface PerformanceStats {
  totalTrades: number
  winningTrades: number
  losingTrades: number
  breakevenTrades: number
  skippedSetups: number
  totalSetups: number
  takenSetups: number
  winRate: number
  lossRate: number
  netPnl: number
  grossProfit: number
  grossLoss: number
  profitFactor: number
  averageWin: number
  averageLoss: number
  averageWinR: number
  averageLossR: number
  averageR: number
  expectancy: number
  maxDrawdownPct: number
  maxDrawdownUsd: number
  maxConsecutiveWins: number
  maxConsecutiveLosses: number
  equityCurve: Array<{ trade: number; equity: number; timestamp: number }>
}

export interface ReplayState {
  symbol: string
  timeframe: Timeframe
  currentTimestamp: number
  isPlaying: boolean
  playbackSpeed: number
  hideReplayDate: boolean
}

export interface BacktestSession {
  id: string
  name: string
  symbol: string
  timeframe: Timeframe
  strategyId: string
  strategyConfig: Record<string, unknown>
  replayTimestamp: number
  account: AccountState
  costs: CostConfig
  createdAt: number
  updatedAt: number
}

export interface StrategySettings {
  strategyId: string
  lookback: number
  defaultRr: number
  autoEntry: boolean
  pauseOnSetup: boolean
  volumeMultiplier: number
}

export interface SavedStrategy {
  id: string
  name: string
  notes: string
  settings: StrategySettings
  createdAt: number
  updatedAt: number
}

export const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 5, 10, 20] as const
export type PlaybackSpeed = (typeof SPEED_OPTIONS)[number]
export const DESK_THEMES = ['dark', 'light'] as const
export type DeskTheme = (typeof DESK_THEMES)[number]

export interface DeskPrefs {
  symbol: string
  displayTimeframe: Timeframe
  speed: number
  theme: DeskTheme
  costs: CostConfig
  ambiguityRule: AmbiguityRule
  riskPerTrade: number
  initialBalance: number
  lastStrategyId: string | null
  lastDatasetId: number | null
}
