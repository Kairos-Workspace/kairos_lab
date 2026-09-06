import { describe, expect, it } from 'vitest'
import { generateDemoCandles } from '@core/candles/demo'
import { resample } from '@core/candles/resample'
import { ReplayEngine } from '@core/replay/engine'
import { BreakoutStrategy } from '@core/strategy/breakout'
import { createAccount, applyClosedTrade } from '@core/trade/account'
import { calculatePositionSize } from '@core/trade/sizing'
import { evaluateTradeOnCandle } from '@core/trade/simulation'
import { calculatePerformance } from '@core/performance/stats'
import type { Trade } from '@shared/types'

describe('replay → setup → trade → statistics', () => {
  it('keeps future candles hidden and books a completed trade', () => {
    const m1 = generateDemoCandles({ days: 3, seed: 7 })
    const bars = resample(m1, '5M')
    const engine = new ReplayEngine(bars, { warmup: 30 })
    const strategy = new BreakoutStrategy({ lookback: 8, volumeMultiplier: 0 })
    strategy.initialize()

    let signal = null
    while (!engine.isAtEnd() && !signal) {
      engine.step(1)
      const candle = engine.current()
      if (!candle) break
      const visible = engine.visibleCandles()
      expect(visible.at(-1)?.timestamp).toBe(candle.timestamp)
      expect(visible.some((c) => c.timestamp > candle.timestamp)).toBe(false)
      signal = strategy.onCandle(candle, {
        candles: visible,
        symbol: 'XAUUSD',
        timeframe: '5M'
      })
    }

    expect(signal).not.toBeNull()
    expect(engine.futureCandles().length).toBeGreaterThan(0)

    const direction = signal!.type === 'LONG' ? 'BUY' : 'SELL'
    const entry = signal!.price
    const sl = direction === 'BUY' ? entry - 3 : entry + 3
    const tp = direction === 'BUY' ? entry + 9 : entry - 9
    const account = createAccount(10_000, 1)
    const sized = calculatePositionSize({
      balance: account.balance,
      riskPercent: 1,
      entry,
      stopLoss: sl
    })
    const trade: Trade = {
      id: 'wf-1',
      sessionId: 'wf',
      symbol: 'XAUUSD',
      direction,
      entry,
      stopLoss: sl,
      takeProfit: tp,
      positionSize: sized.positionSize,
      riskAmount: sized.riskAmount,
      openedAt: signal!.timestamp
    }

    let closed = null
    while (!engine.isAtEnd() && !closed) {
      engine.step(1)
      const candle = engine.current()
      if (!candle) break
      const result = evaluateTradeOnCandle(trade, candle, { contractSize: 100 })
      if (result.closed) {
        closed = {
          ...trade,
          result: result.result,
          pnl: result.pnl,
          rMultiple: result.rMultiple,
          closedAt: candle.timestamp
        }
      }
    }

    expect(closed).not.toBeNull()
    expect(closed!.result === 'WIN' || closed!.result === 'LOSS').toBe(true)
    const next = applyClosedTrade(account, closed!.pnl ?? 0)
    const stats = calculatePerformance([closed!], 10_000, [])
    expect(next.balance).toBe(10_000 + (closed!.pnl ?? 0))
    expect(stats.totalTrades).toBe(1)
    expect(stats.equityCurve.at(-1)?.equity).toBe(next.balance)
  })
})
