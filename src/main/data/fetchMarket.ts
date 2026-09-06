import { findMarketInstrument, recentWindow, resolveMarketSource, yahooWindow } from '@core/market/catalog'
import type { Candle, Timeframe } from '@shared/types'
import { downloadDukascopy } from './dukascopy'
import { downloadYahoo } from './yahoo'

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
