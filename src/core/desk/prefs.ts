import { DEFAULT_BALANCE, DEFAULT_COSTS, DEFAULT_RISK_PCT } from '@shared/constants'
import {
  DESK_THEMES,
  SPEED_OPTIONS,
  TIMEFRAMES,
  type AmbiguityRule,
  type CostConfig,
  type DeskPrefs,
  type DeskTheme,
  type Timeframe
} from '@shared/types'

const RULES: AmbiguityRule[] = ['sl-first', 'tp-first', 'random', 'ambiguous']

export const DEFAULT_DESK_PREFS: DeskPrefs = {
  symbol: 'XAUUSD',
  displayTimeframe: '1H',
  speed: 1,
  theme: 'dark',
  showFundamentals: false,
  costs: { ...DEFAULT_COSTS },
  ambiguityRule: 'ambiguous',
  riskPerTrade: DEFAULT_RISK_PCT,
  initialBalance: DEFAULT_BALANCE,
  lastStrategyId: null,
  lastDatasetId: null
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function costsOf(value: unknown): CostConfig {
  const row = value && typeof value === 'object' ? (value as Partial<CostConfig>) : {}
  return {
    spread: num(row.spread, DEFAULT_COSTS.spread),
    commission: num(row.commission, DEFAULT_COSTS.commission),
    slippage: num(row.slippage, DEFAULT_COSTS.slippage),
    minLot: num(row.minLot, DEFAULT_COSTS.minLot),
    lotStep: num(row.lotStep, DEFAULT_COSTS.lotStep),
    contractSize: num(row.contractSize, DEFAULT_COSTS.contractSize),
    tickSize: num(row.tickSize, DEFAULT_COSTS.tickSize),
    tickValue: num(row.tickValue, DEFAULT_COSTS.tickValue)
  }
}

export function parseDeskPrefs(raw: unknown): DeskPrefs {
  const row = raw && typeof raw === 'object' ? (raw as Partial<DeskPrefs>) : {}
  const timeframe = TIMEFRAMES.includes(row.displayTimeframe as Timeframe)
    ? (row.displayTimeframe as Timeframe)
    : DEFAULT_DESK_PREFS.displayTimeframe
  const speed = SPEED_OPTIONS.includes(row.speed as (typeof SPEED_OPTIONS)[number])
    ? (row.speed as number)
    : DEFAULT_DESK_PREFS.speed
  const ambiguityRule = RULES.includes(row.ambiguityRule as AmbiguityRule)
    ? (row.ambiguityRule as AmbiguityRule)
    : DEFAULT_DESK_PREFS.ambiguityRule
  const theme = DESK_THEMES.includes(row.theme as DeskTheme)
    ? (row.theme as DeskTheme)
    : DEFAULT_DESK_PREFS.theme
  return {
    symbol: text(row.symbol, DEFAULT_DESK_PREFS.symbol).toUpperCase(),
    displayTimeframe: timeframe,
    speed,
    theme,
    showFundamentals: row.showFundamentals === true,
    costs: costsOf(row.costs),
    ambiguityRule,
    riskPerTrade: num(row.riskPerTrade, DEFAULT_DESK_PREFS.riskPerTrade),
    initialBalance: num(row.initialBalance, DEFAULT_DESK_PREFS.initialBalance),
    lastStrategyId: typeof row.lastStrategyId === 'string' ? row.lastStrategyId : null,
    lastDatasetId: typeof row.lastDatasetId === 'number' && Number.isFinite(row.lastDatasetId)
      ? row.lastDatasetId
      : null
  }
}
