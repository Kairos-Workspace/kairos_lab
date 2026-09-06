import type { Candle, Strategy, StrategyContext, StrategySignal } from '@shared/types'

export interface BreakoutConfig {
  lookback?: number
  volumeMultiplier?: number
}

export class BreakoutStrategy implements Strategy {
  readonly id = 'breakout'
  readonly name = 'Breakout Strategy'
  readonly description = 'Close breaks the prior N-bar high or low, with optional volume confirmation.'
  private lookback: number
  private volumeMultiplier: number

  constructor(config: BreakoutConfig = {}) {
    this.lookback = config.lookback ?? 20
    this.volumeMultiplier = config.volumeMultiplier ?? 0
  }

  initialize(): void {}

  onCandle(candle: Candle, context: StrategyContext): StrategySignal | null {
    const bars = context.candles
    if (bars.length < this.lookback + 1) return null
    const window = bars.slice(-this.lookback - 1, -1)
    const priorHigh = Math.max(...window.map((b) => b.high))
    const priorLow = Math.min(...window.map((b) => b.low))
    const avgVol =
      window.reduce((s, b) => s + (b.volume ?? 0), 0) / Math.max(1, window.length)
    const volOk =
      this.volumeMultiplier <= 0 || (candle.volume ?? 0) >= avgVol * this.volumeMultiplier

    if (candle.close > priorHigh && volOk) {
      return {
        type: 'LONG',
        timestamp: candle.timestamp,
        price: candle.close,
        reason: `Break of ${this.lookback}-bar high ${priorHigh.toFixed(2)}`,
        strategy: this.name
      }
    }
    if (candle.close < priorLow && volOk) {
      return {
        type: 'SHORT',
        timestamp: candle.timestamp,
        price: candle.close,
        reason: `Break of ${this.lookback}-bar low ${priorLow.toFixed(2)}`,
        strategy: this.name
      }
    }
    return null
  }
}
