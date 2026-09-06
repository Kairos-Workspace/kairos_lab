import { WARMUP_BARS } from '@shared/constants'
import type { Candle } from '@shared/types'

export interface ReplayOptions {
  warmup?: number
}

export class ReplayEngine {
  readonly candles: Candle[]
  readonly warmup: number
  index: number

  constructor(candles: Candle[], options: ReplayOptions = {}) {
    this.candles = candles
    this.warmup = options.warmup ?? WARMUP_BARS
    this.index = Math.min(this.warmup, Math.max(0, candles.length - 1))
  }

  visibleCandles(): Candle[] {
    return this.candles.slice(0, this.index + 1)
  }

  futureCandles(): Candle[] {
    return this.candles.slice(this.index + 1)
  }

  current(): Candle | undefined {
    return this.candles[this.index]
  }

  currentTimestamp(): number {
    return this.current()?.timestamp ?? 0
  }

  isAtEnd(): boolean {
    return this.index >= this.candles.length - 1
  }

  jumpToIndex(index: number): void {
    if (this.candles.length === 0) {
      this.index = 0
      return
    }
    this.index = Math.max(0, Math.min(index, this.candles.length - 1))
  }

  jumpToTimestamp(timestamp: number): void {
    this.jumpToIndex(ReplayEngine.mapTimestampToIndex(this.candles, timestamp))
  }

  step(n: number): number {
    const before = this.index
    if (n >= 0) {
      this.index = Math.min(this.candles.length - 1, this.index + n)
    } else {
      const min = Math.min(this.warmup, this.candles.length - 1)
      this.index = Math.max(min, this.index + n)
    }
    return this.index - before
  }

  reset(): void {
    this.index = Math.min(this.warmup, Math.max(0, this.candles.length - 1))
  }

  randomStart(rng: () => number = Math.random): number {
    const min = Math.min(this.warmup, this.candles.length - 1)
    const span = Math.max(0, this.candles.length - 1 - min)
    return min + Math.floor(rng() * (span + 1))
  }

  static mapTimestampToIndex(candles: Candle[], timestamp: number): number {
    if (candles.length === 0) return 0
    let lo = 0
    let hi = candles.length - 1
    let best = 0
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (candles[mid].timestamp <= timestamp) {
        best = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return best
  }
}
