import { WARMUP_BARS } from '@shared/constants'
import type {
  AmbiguityRule,
  Candle,
  CostConfig,
  Direction,
  Strategy,
  StrategySettings,
  Timeframe,
  Trade
} from '@shared/types'
import { calculatePerformance } from '@core/performance/stats'
import { applyClosedTrade, createAccount } from '@core/trade/account'
import { calculatePositionSize } from '@core/trade/sizing'
import { defaultStopTarget } from '@core/trade/stops'
import { evaluateTradeOnCandle } from '@core/trade/simulation'

export type HeadlessBacktestInput = {
  strategy: Strategy
  candles: Candle[]
  symbol: string
  timeframe: Timeframe
  settings: StrategySettings
  costs: CostConfig
  ambiguityRule?: AmbiguityRule
  initialBalance: number
  riskPerTrade: number
  leverage: number
  fromTs?: number
  toTs?: number
}

export type HeadlessBacktestResult = {
  trades: Trade[]
  account: ReturnType<typeof createAccount>
  stats: ReturnType<typeof calculatePerformance>
  barsPlayed: number
}

function newId(): string {
  return `bt_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`
}

export function runHeadlessEaBacktest(input: HeadlessBacktestInput): HeadlessBacktestResult {
  const {
    strategy,
    candles,
    symbol,
    timeframe,
    settings,
    costs,
    ambiguityRule = 'sl-first',
    initialBalance,
    riskPerTrade,
    leverage,
    fromTs,
    toTs
  } = input

  strategy.initialize()
  let account = createAccount(initialBalance, riskPerTrade, leverage)
  const sessionId = newId()
  const trades: Trade[] = []
  let active: Trade | null = null
  let barsPlayed = 0

  const startIndex = Math.min(WARMUP_BARS, Math.max(0, candles.length - 1))
  for (let index = startIndex; index < candles.length; index++) {
    const candle = candles[index]
    if (!candle) break
    if (fromTs != null && candle.timestamp < fromTs) continue
    if (toTs != null && candle.timestamp > toTs) break
    barsPlayed++

    if (active) {
      const result = evaluateTradeOnCandle(active, candle, {
        contractSize: costs.contractSize,
        costs,
        ambiguityRule
      })
      if (result.closed) {
        trades.push({
          ...active,
          result: result.result,
          pnl: result.pnl,
          rMultiple: result.rMultiple,
          closedAt: candle.timestamp
        })
        account = applyClosedTrade(account, result.pnl ?? 0)
        active = null
      }
    }

    if (active) continue

    const signal = strategy.onCandle(candle, {
      candles: candles.slice(0, index + 1),
      symbol,
      timeframe
    })
    if (!signal) continue

    const direction: Direction = signal.type === 'LONG' ? 'BUY' : 'SELL'
    const entry = signal.price
    const { stopLoss, takeProfit } = defaultStopTarget(direction, entry, costs, settings)
    const sized = calculatePositionSize({
      balance: account.balance,
      riskPercent: account.riskPerTrade,
      entry,
      stopLoss,
      costs,
      leverage: account.leverage
    })
    active = {
      id: newId(),
      sessionId,
      symbol,
      direction,
      entry,
      stopLoss,
      takeProfit,
      positionSize: sized.positionSize,
      riskAmount: sized.riskAmount,
      openedAt: candle.timestamp,
      strategy: signal.strategy,
      reason: signal.reason
    }
  }

  if (active) {
    const last = candles[candles.length - 1]
    if (last) {
      const result = evaluateTradeOnCandle(active, last, {
        contractSize: costs.contractSize,
        costs,
        ambiguityRule
      })
      if (result.closed) {
        trades.push({
          ...active,
          result: result.result,
          pnl: result.pnl,
          rMultiple: result.rMultiple,
          closedAt: last.timestamp
        })
        account = applyClosedTrade(account, result.pnl ?? 0)
      }
    }
  }

  return {
    trades,
    account,
    stats: calculatePerformance(trades, initialBalance),
    barsPlayed
  }
}
