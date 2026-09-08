import type { Candle, StrategySettings } from '@shared/types'
import { BBMA_DEFAULTS } from './bbma'
import { bollinger, rangeHighLow, sma, smaField } from './math'

export interface IndicatorSpec {
  id: string
  title: string
  color: string
  lineWidth?: 1 | 2 | 3 | 4
  dashed?: boolean
}

export interface IndicatorLine extends IndicatorSpec {
  points: { timestamp: number; value: number }[]
}

export function strategyIndicatorSpecs(settings: StrategySettings): IndicatorSpec[] {
  if (settings.strategyId === 'bbma') {
    const period = Math.max(2, settings.lookback)
    return [
      { id: 'bb-upper', title: `BB Upper ${period}`, color: '#8b9bb4', dashed: true },
      { id: 'bb-lower', title: `BB Lower ${period}`, color: '#8b9bb4', dashed: true },
      { id: 'ma50', title: 'MA50', color: '#4a45d4', lineWidth: 2 },
      { id: 'ma5-high', title: 'MA5 High', color: '#5dcec0' },
      { id: 'ma5-low', title: 'MA5 Low', color: '#3d9b8f' },
      { id: 'ma10-high', title: 'MA10 High', color: '#d4a574' },
      { id: 'ma10-low', title: 'MA10 Low', color: '#c9863a' }
    ]
  }
  if (settings.strategyId === 'ma-crossover') {
    const slow = Math.max(2, settings.lookback)
    const fast = Math.max(2, Math.round(slow / 2))
    return [
      { id: 'sma-fast', title: `SMA ${fast}`, color: '#5dcec0' },
      { id: 'sma-slow', title: `SMA ${slow}`, color: '#4a45d4' }
    ]
  }
  const lookback = Math.max(1, settings.lookback)
  return [
    { id: 'break-high', title: `${lookback}-bar high`, color: '#5dcec0' },
    { id: 'break-low', title: `${lookback}-bar low`, color: '#e07a5f' }
  ]
}

export function strategyIndicatorLines(
  settings: StrategySettings,
  candles: Candle[]
): IndicatorLine[] {
  const specs = strategyIndicatorSpecs(settings)
  const buckets = new Map(specs.map((spec) => [spec.id, [] as IndicatorLine['points']]))

  if (settings.strategyId === 'bbma') {
    const period = Math.max(2, settings.lookback)
    const maxWindow = Math.max(BBMA_DEFAULTS.ma50, BBMA_DEFAULTS.maFast, BBMA_DEFAULTS.maSlow)
    for (let i = 0; i < candles.length; i++) {
      const time = candles[i].timestamp
      const window = candles.slice(Math.max(0, i + 1 - maxWindow), i + 1)
      const bands = bollinger(candles.slice(Math.max(0, i - period), i), period, 2)
      if (bands) {
        buckets.get('bb-upper')?.push({ timestamp: time, value: bands.upper })
        buckets.get('bb-lower')?.push({ timestamp: time, value: bands.lower })
      }
      const ma50 = sma(window, BBMA_DEFAULTS.ma50)
      const ma5High = smaField(window, BBMA_DEFAULTS.maFast, 'high')
      const ma5Low = smaField(window, BBMA_DEFAULTS.maFast, 'low')
      const ma10High = smaField(window, BBMA_DEFAULTS.maSlow, 'high')
      const ma10Low = smaField(window, BBMA_DEFAULTS.maSlow, 'low')
      if (ma50 != null) buckets.get('ma50')?.push({ timestamp: time, value: ma50 })
      if (ma5High != null) buckets.get('ma5-high')?.push({ timestamp: time, value: ma5High })
      if (ma5Low != null) buckets.get('ma5-low')?.push({ timestamp: time, value: ma5Low })
      if (ma10High != null) buckets.get('ma10-high')?.push({ timestamp: time, value: ma10High })
      if (ma10Low != null) buckets.get('ma10-low')?.push({ timestamp: time, value: ma10Low })
    }
  } else if (settings.strategyId === 'ma-crossover') {
    const slow = Math.max(2, settings.lookback)
    const fast = Math.max(2, Math.round(slow / 2))
    for (let i = 0; i < candles.length; i++) {
      const window = candles.slice(Math.max(0, i + 1 - slow), i + 1)
      const time = candles[i].timestamp
      const fastMa = sma(window, fast)
      const slowMa = sma(window, slow)
      if (fastMa != null) buckets.get('sma-fast')?.push({ timestamp: time, value: fastMa })
      if (slowMa != null) buckets.get('sma-slow')?.push({ timestamp: time, value: slowMa })
    }
  } else {
    const lookback = Math.max(1, settings.lookback)
    for (let i = 0; i < candles.length; i++) {
      const prior = candles.slice(Math.max(0, i - lookback), i)
      const range = rangeHighLow(prior)
      if (!range) continue
      const time = candles[i].timestamp
      buckets.get('break-high')?.push({ timestamp: time, value: range.high })
      buckets.get('break-low')?.push({ timestamp: time, value: range.low })
    }
  }

  return specs.map((spec) => ({
    ...spec,
    points: buckets.get(spec.id) ?? []
  }))
}

export function strategyIndicatorLast(
  settings: StrategySettings,
  candles: Candle[]
): { id: string; timestamp: number; value: number }[] {
  const last = candles.at(-1)
  if (!last) return []
  if (settings.strategyId === 'bbma') {
    const period = Math.max(2, settings.lookback)
    const bands = bollinger(candles.slice(0, -1), period, 2)
    const values = [
      { id: 'bb-upper', value: bands?.upper ?? null },
      { id: 'bb-lower', value: bands?.lower ?? null },
      { id: 'ma50', value: sma(candles, BBMA_DEFAULTS.ma50) },
      { id: 'ma5-high', value: smaField(candles, BBMA_DEFAULTS.maFast, 'high') },
      { id: 'ma5-low', value: smaField(candles, BBMA_DEFAULTS.maFast, 'low') },
      { id: 'ma10-high', value: smaField(candles, BBMA_DEFAULTS.maSlow, 'high') },
      { id: 'ma10-low', value: smaField(candles, BBMA_DEFAULTS.maSlow, 'low') }
    ]
    return values.flatMap((row) =>
      row.value == null ? [] : [{ id: row.id, timestamp: last.timestamp, value: row.value }]
    )
  }
  if (settings.strategyId === 'ma-crossover') {
    const slow = Math.max(2, settings.lookback)
    const fast = Math.max(2, Math.round(slow / 2))
    const values = [
      { id: 'sma-fast', value: sma(candles, fast) },
      { id: 'sma-slow', value: sma(candles, slow) }
    ]
    return values.flatMap((row) =>
      row.value == null ? [] : [{ id: row.id, timestamp: last.timestamp, value: row.value }]
    )
  }
  const range = rangeHighLow(candles.slice(-settings.lookback - 1, -1))
  if (!range) return []
  return [
    { id: 'break-high', timestamp: last.timestamp, value: range.high },
    { id: 'break-low', timestamp: last.timestamp, value: range.low }
  ]
}
