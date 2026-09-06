import { sma } from '@core/indicators/math'
import type { Candle, Strategy, StrategyContext, StrategySignal } from '@shared/types'

export interface MaCrossoverConfig {
  fast?: number
  slow?: number
}

export class MaCrossoverStrategy implements Strategy {
  readonly id = 'ma-crossover'
  readonly name = 'MA Crossover'
  readonly description = 'Fast SMA crossing the slow SMA.'
  private fast: number
  private slow: number
  private prevDiff: number | null = null

  constructor(config: MaCrossoverConfig = {}) {
    this.fast = config.fast ?? 9
    this.slow = config.slow ?? 21
  }

  initialize(): void {
    this.prevDiff = null
  }

  onCandle(candle: Candle, context: StrategyContext): StrategySignal | null {
    const fast = sma(context.candles, this.fast)
    const slow = sma(context.candles, this.slow)
    if (fast === null || slow === null) return null
    const diff = fast - slow
    const prev = this.prevDiff
    this.prevDiff = diff
    if (prev === null) return null
    if (prev <= 0 && diff > 0) {
      return {
        type: 'LONG',
        timestamp: candle.timestamp,
        price: candle.close,
        reason: `SMA${this.fast} crossed above SMA${this.slow}`,
        strategy: this.name
      }
    }
    if (prev >= 0 && diff < 0) {
      return {
        type: 'SHORT',
        timestamp: candle.timestamp,
        price: candle.close,
        reason: `SMA${this.fast} crossed below SMA${this.slow}`,
        strategy: this.name
      }
    }
    return null
  }
}
