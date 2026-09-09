import { intervalMs } from './resample'
import type { DatasetInfo, Timeframe } from '@shared/types'

export function datasetsForSymbol(datasets: DatasetInfo[], symbol: string): DatasetInfo[] {
  return datasets.filter((d) => d.symbol === symbol && d.candleCount > 0)
}

export function localSymbols(datasets: DatasetInfo[]): string[] {
  return [...new Set(datasets.filter((d) => d.candleCount > 0).map((d) => d.symbol))].sort()
}

export function exactTimeframesForSymbol(datasets: DatasetInfo[], symbol: string): Timeframe[] {
  return [...new Set(datasetsForSymbol(datasets, symbol).map((d) => d.timeframe))]
}

function coverage(dataset: DatasetInfo): number {
  return Math.max(0, dataset.endTs - dataset.startTs)
}

export function pickLocalDataset(
  datasets: DatasetInfo[],
  symbol: string,
  preferred: Timeframe
): DatasetInfo | null {
  const available = datasetsForSymbol(datasets, symbol)
  if (available.length === 0) return null

  const exact = available.find((d) => d.timeframe === preferred)
  if (exact) return exact

  const usable = available.filter((d) => intervalMs(d.timeframe) <= intervalMs(preferred))
  const pool = usable.length > 0 ? usable : available
  return pool.slice().sort((a, b) => {
    const byRange = coverage(b) - coverage(a)
    if (byRange !== 0) return byRange
    return intervalMs(a.timeframe) - intervalMs(b.timeframe) || b.candleCount - a.candleCount
  })[0]
}
