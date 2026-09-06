import type { Candle } from '@shared/types'
import { bollinger, sma, smaField } from './math'

export interface BbmaConfig {
  bbPeriod?: number
  stdDev?: number
  ma50?: number
  maFast?: number
  maSlow?: number
}

export interface BbmaSnapshot {
  upper: number
  lower: number
  mid: number
  ma50: number
  ma5High: number
  ma5Low: number
  ma10High: number
  ma10Low: number
}

export const BBMA_DEFAULTS = {
  bbPeriod: 20,
  stdDev: 2,
  ma50: 50,
  maFast: 5,
  maSlow: 10
} as const

export function resolveBbmaConfig(config: BbmaConfig = {}): Required<BbmaConfig> {
  return {
    bbPeriod: Math.max(2, config.bbPeriod ?? BBMA_DEFAULTS.bbPeriod),
    stdDev: config.stdDev ?? BBMA_DEFAULTS.stdDev,
    ma50: Math.max(2, config.ma50 ?? BBMA_DEFAULTS.ma50),
    maFast: Math.max(2, config.maFast ?? BBMA_DEFAULTS.maFast),
    maSlow: Math.max(2, config.maSlow ?? BBMA_DEFAULTS.maSlow)
  }
}

export function readBbma(candles: Candle[], config: BbmaConfig = {}): BbmaSnapshot | null {
  const resolved = resolveBbmaConfig(config)
  const bands = bollinger(candles.slice(0, -1), resolved.bbPeriod, resolved.stdDev)
  const ma50 = sma(candles, resolved.ma50)
  const ma5High = smaField(candles, resolved.maFast, 'high')
  const ma5Low = smaField(candles, resolved.maFast, 'low')
  const ma10High = smaField(candles, resolved.maSlow, 'high')
  const ma10Low = smaField(candles, resolved.maSlow, 'low')
  if (!bands || ma50 == null || ma5High == null || ma5Low == null || ma10High == null || ma10Low == null) {
    return null
  }
  return {
    upper: bands.upper,
    lower: bands.lower,
    mid: bands.mid,
    ma50,
    ma5High,
    ma5Low,
    ma10High,
    ma10Low
  }
}

export function touchesMaLowZone(high: number, snapshot: BbmaSnapshot): boolean {
  return high >= Math.max(snapshot.ma5Low, snapshot.ma10Low)
}

export function touchesMaHighZone(low: number, snapshot: BbmaSnapshot): boolean {
  return low <= Math.min(snapshot.ma5High, snapshot.ma10High)
}
