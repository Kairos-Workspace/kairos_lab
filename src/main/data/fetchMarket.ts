import { findMarketInstrument, recentWindow, resolveMarketSource, yahooWindow } from '@core/market/catalog'
import type { Candle, Timeframe } from '@shared/types'
import {
  DUKASCOPY_BATCH_SIZE,
  DUKASCOPY_PAUSE_BETWEEN_BATCHES_MS,
  downloadDukascopy,
  estimateDukascopyChunks
} from './dukascopy'
import { downloadYahoo } from './yahoo'

/**
 * A rough, honestly-labeled estimate for how long a download will take,
 * grounded in real numbers (the actual chunk count dukascopy-node will fetch,
 * and its own configured batch pacing) rather than a guess — used to drive a
 * progress bar since the underlying library has no public per-chunk hook.
 * Yahoo-sourced symbols fetch in a single request, so there's nothing to
 * estimate chunk-by-chunk; `chunks: null` tells the caller to show an
 * indeterminate progress state instead of a fake percentage.
 */
export function estimateDownload(input: {
  symbol: string
  timeframe: Timeframe
  startTs: number
  endTs: number
}): { chunks: number | null; batchSize: number; pauseBetweenBatchesMs: number } {
  const route = resolveMarketSource(input.symbol)
  if (route.source === 'yahoo') {
    return { chunks: null, batchSize: 1, pauseBetweenBatchesMs: 0 }
  }
  const chunks = estimateDukascopyChunks({ ...input, instrument: route.instrument })
  return { chunks, batchSize: DUKASCOPY_BATCH_SIZE, pauseBetweenBatchesMs: DUKASCOPY_PAUSE_BETWEEN_BATCHES_MS }
}

async function pullDukascopy(
  input: {
    symbol: string
    timeframe: Timeframe
    startTs: number
    endTs: number
  },
  instrument: string
): Promise<{ candles: Candle[]; source: string }> {
  return {
    source: 'dukascopy',
    candles: await downloadDukascopy({
      symbol: input.symbol,
      instrument,
      timeframe: input.timeframe,
      startTs: input.startTs,
      endTs: input.endTs
    })
  }
}

async function pullYahoo(input: {
  symbol: string
  timeframe: Timeframe
  startTs: number
  endTs: number
  ticker: string
}): Promise<{ candles: Candle[]; source: string }> {
  const range = yahooWindow(input.timeframe, input.startTs, input.endTs)
  return {
    source: 'yahoo',
    candles: await downloadYahoo({
      symbol: input.symbol,
      ticker: input.ticker,
      timeframe: input.timeframe,
      startTs: range.startTs,
      endTs: range.endTs
    })
  }
}

export async function fetchMarketCandles(input: {
  symbol: string
  timeframe: Timeframe
  startTs: number
  endTs: number
}): Promise<{ candles: Candle[]; source: string }> {
  const route = resolveMarketSource(input.symbol)
  if (route.source === 'yahoo') {
    return pullYahoo({ ...input, ticker: route.instrument })
  }

  try {
    return await pullDukascopy(input, route.instrument)
  } catch (first) {
    // Only tip-fallback when the caller asked for a short recent window.
    // Falling back on a multi-year refresh silently glues Aug–now onto an
    // incomplete historical stump (e.g. XAUUSD 5M ending in 2011).
    const spanMs = Math.max(0, input.endTs - input.startTs)
    const tipFallbackOk = spanMs <= 60 * 86_400_000
    if (!tipFallbackOk) throw first
    try {
      const recent = recentWindow()
      return await pullDukascopy({ ...input, ...recent }, route.instrument)
    } catch {
      const ticker = findMarketInstrument(input.symbol)?.yahoo ?? input.symbol
      try {
        return await pullYahoo({ ...input, ticker })
      } catch {
        throw first
      }
    }
  }
}
