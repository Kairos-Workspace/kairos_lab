import type { AmbiguityRule, Candle, Trade, TradeResult } from '@shared/types'
import { applyCosts } from './sizing'
import { DEFAULT_COSTS } from '@shared/constants'

export interface SimulationOptions {
  contractSize?: number
  lowerTimeframe?: Candle[]
  ambiguityRule?: AmbiguityRule
  costs?: typeof DEFAULT_COSTS
  rng?: () => number
}

export interface TradeTickResult {
  closed: boolean
  result?: TradeResult
  exit?: number
  pnl?: number
  rMultiple?: number
}

function riskDistance(trade: Trade): number {
  return Math.abs(trade.entry - trade.stopLoss)
}

function pnlAt(trade: Trade, exit: number, contractSize: number): number {
  const dir = trade.direction === 'BUY' ? 1 : -1
  return (exit - trade.entry) * dir * trade.positionSize * contractSize
}

function rAt(trade: Trade, exit: number): number {
  const risk = riskDistance(trade)
  if (risk === 0) return 0
  const dir = trade.direction === 'BUY' ? 1 : -1
  return ((exit - trade.entry) * dir) / risk
}

function touches(trade: Trade, candle: Candle): { sl: boolean; tp: boolean } {
  if (trade.direction === 'BUY') {
    return {
      sl: candle.low <= trade.stopLoss,
      tp: candle.high >= trade.takeProfit
    }
  }
  return {
    sl: candle.high >= trade.stopLoss,
    tp: candle.low <= trade.takeProfit
  }
}

export function resolveAmbiguousTouch(
  rule: AmbiguityRule,
  rng: () => number = Math.random
): TradeResult {
  if (rule === 'sl-first') return 'LOSS'
  if (rule === 'tp-first') return 'WIN'
  if (rule === 'random') return rng() < 0.5 ? 'LOSS' : 'WIN'
  return 'AMBIGUOUS'
}

function closeTrade(
  trade: Trade,
  result: TradeResult,
  exit: number,
  contractSize: number,
  costs?: typeof DEFAULT_COSTS
): TradeTickResult {
  if (result === 'AMBIGUOUS') {
    return { closed: true, result, exit, pnl: 0, rMultiple: 0 }
  }
  const raw = pnlAt(trade, exit, contractSize)
  const pnl = costs ? applyCosts(raw, trade.positionSize, costs) : raw
  return {
    closed: true,
    result,
    exit,
    pnl,
    rMultiple: rAt(trade, exit)
  }
}

export function evaluateTradeOnCandle(
  trade: Trade,
  candle: Candle,
  options: SimulationOptions = {}
): TradeTickResult {
  const contractSize = options.contractSize ?? 100
  const costs = options.costs
  const hit = touches(trade, candle)

  if (!hit.sl && !hit.tp) return { closed: false }

  if (hit.sl && hit.tp) {
    if (options.lowerTimeframe && options.lowerTimeframe.length > 0) {
      for (const micro of options.lowerTimeframe) {
        const inner = evaluateTradeOnCandle(trade, micro, {
          contractSize,
          costs,
          ambiguityRule: options.ambiguityRule
        })
        if (inner.closed) return inner
      }
    }
    const result = resolveAmbiguousTouch(options.ambiguityRule ?? 'ambiguous', options.rng)
    const exit = result === 'WIN' ? trade.takeProfit : result === 'LOSS' ? trade.stopLoss : trade.entry
    return closeTrade(trade, result, exit, contractSize, costs)
  }

  if (hit.sl) return closeTrade(trade, 'LOSS', trade.stopLoss, contractSize, costs)
  return closeTrade(trade, 'WIN', trade.takeProfit, contractSize, costs)
}

export function lowerTimeframeWindow(
  source: Candle[],
  fromTs: number,
  toTs: number
): Candle[] {
  if (source.length === 0) return []
  let lo = 0
  let hi = source.length - 1
  let start = source.length
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (source[mid].timestamp < fromTs) lo = mid + 1
    else {
      start = mid
      hi = mid - 1
    }
  }
  lo = start
  hi = source.length - 1
  let end = source.length
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (source[mid].timestamp <= toTs) lo = mid + 1
    else {
      end = mid
      hi = mid - 1
    }
  }
  return source.slice(start, end)
}
