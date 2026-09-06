import {
  readBbma,
  resolveBbmaConfig,
  touchesMaHighZone,
  touchesMaLowZone,
  type BbmaConfig
} from '@core/indicators/bbma'
import type { Candle, Strategy, StrategyContext, StrategySignal } from '@shared/types'

export type { BbmaConfig }

export class BbmaStrategy implements Strategy {
  readonly id = 'bbma'
  readonly name = 'BBMA'
  readonly description =
    'BB extreme, then re-entry on MA5/MA10 high-low toward MA50.'
  private config: ReturnType<typeof resolveBbmaConfig>
  private armed: 'LONG' | 'SHORT' | null = null

  constructor(config: BbmaConfig = {}) {
    this.config = resolveBbmaConfig(config)
  }

  initialize(): void {
    this.armed = null
  }

  onCandle(candle: Candle, context: StrategyContext): StrategySignal | null {
    const levels = readBbma(context.candles, this.config)
    if (!levels) return null

    if (candle.low <= levels.lower) this.armed = 'LONG'
    if (candle.high >= levels.upper) this.armed = 'SHORT'
    if (candle.low <= levels.lower && candle.high >= levels.upper) {
      this.armed = candle.close >= levels.ma50 ? 'SHORT' : 'LONG'
    }

    const inside = candle.close > levels.lower && candle.close < levels.upper
    if (!inside) return null

    if (this.armed === 'LONG' && touchesMaLowZone(candle.high, levels) && candle.close <= levels.ma50) {
      this.armed = null
      return {
        type: 'LONG',
        timestamp: candle.timestamp,
        price: candle.close,
        reason: 'BBMA re-entry on MA5/MA10 lows toward MA50',
        strategy: this.name
      }
    }
    if (this.armed === 'SHORT' && touchesMaHighZone(candle.low, levels) && candle.close >= levels.ma50) {
      this.armed = null
      return {
        type: 'SHORT',
        timestamp: candle.timestamp,
        price: candle.close,
        reason: 'BBMA re-entry on MA5/MA10 highs toward MA50',
        strategy: this.name
      }
    }
    return null
  }
}
