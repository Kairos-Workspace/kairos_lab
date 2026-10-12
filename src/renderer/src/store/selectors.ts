import { useMemo } from 'react'
import { calculatePerformance } from '@core/performance/stats'
import type { Candle } from '@shared/types'
import { useAppStore } from './useAppStore'

export function useVisibleCandles(): Candle[] {
  const mode = useAppStore((s) => s.mode)
  const displayCandles = useAppStore((s) => s.displayCandles)
  const replayIndex = useAppStore((s) => s.replayIndex)
  return useMemo(
    () => (mode === 'view' ? displayCandles : displayCandles.slice(0, replayIndex + 1)),
    [mode, displayCandles, replayIndex]
  )
}

export function useCurrentCandle(): Candle | undefined {
  return useAppStore((s) =>
    s.mode === 'view' ? s.displayCandles.at(-1) : s.displayCandles[s.replayIndex]
  )
}

export function usePerformance() {
  const trades = useAppStore((s) => s.trades)
  const skipped = useAppStore((s) => s.skipped)
  const initialBalance = useAppStore((s) => s.account.initialBalance)
  return useMemo(
    () => calculatePerformance(trades, initialBalance, skipped),
    [trades, skipped, initialBalance]
  )
}
