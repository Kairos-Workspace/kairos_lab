import { describe, expect, it } from 'vitest'
import { exactTimeframesForSymbol, pickLocalDataset } from '@core/candles/dataset'
import type { DatasetInfo } from '@shared/types'

function ds(partial: Partial<DatasetInfo> & Pick<DatasetInfo, 'id' | 'symbol' | 'timeframe'>): DatasetInfo {
  return {
    source: 'dukascopy',
    startTs: 1,
    endTs: 2,
    candleCount: 1000,
    createdAt: 1,
    version: 1,
    gapCount: 0,
    ...partial
  }
}

describe('pickLocalDataset', () => {
  const tapes = [
    ds({
      id: 1,
      symbol: 'XAUUSD',
      timeframe: '1H',
      candleCount: 140000,
      startTs: 100,
      endTs: 10_000
    }),
    ds({
      id: 2,
      symbol: 'XAUUSD',
      timeframe: '4H',
      candleCount: 37000,
      startTs: 100,
      endTs: 9_000
    }),
    ds({
      id: 3,
      symbol: 'XAUUSD',
      timeframe: '1D',
      candleCount: 6500,
      startTs: 50,
      endTs: 8_000
    }),
    ds({
      id: 4,
      symbol: 'XAUUSD',
      timeframe: '5M',
      candleCount: 35000,
      startTs: 100,
      endTs: 400
    })
  ]

  it('prefers an exact timeframe tape when one exists', () => {
    expect(pickLocalDataset(tapes, 'XAUUSD', '4H')?.id).toBe(2)
    expect(pickLocalDataset(tapes, 'XAUUSD', '1H')?.id).toBe(1)
    expect(pickLocalDataset(tapes, 'XAUUSD', '1D')?.id).toBe(3)
  })

  it('uses a short finer tape only when nothing coarser can build that timeframe', () => {
    expect(pickLocalDataset(tapes, 'XAUUSD', '5M')?.id).toBe(4)
  })

  it('returns null when the pair is not stored locally', () => {
    expect(pickLocalDataset(tapes, 'EURUSD', '1H')).toBeNull()
  })

  describe('exactTimeframesForSymbol', () => {
    it('lists only the timeframes actually downloaded for that symbol', () => {
      expect(exactTimeframesForSymbol(tapes, 'XAUUSD').sort()).toEqual(
        ['1D', '1H', '4H', '5M'].sort()
      )
    })

    it('does not include coarser timeframes that could only be derived by resampling', () => {
      expect(exactTimeframesForSymbol(tapes, 'XAUUSD')).not.toContain('30M')
      expect(exactTimeframesForSymbol(tapes, 'XAUUSD')).not.toContain('1M')
    })

    it('returns an empty list for a symbol with no local tapes', () => {
      expect(exactTimeframesForSymbol(tapes, 'EURUSD')).toEqual([])
    })
  })
})
