import { describe, expect, it } from 'vitest'
import { parseCandleCsv } from '@core/csv/parse'

describe('parseCandleCsv', () => {
  it('parses ISO timestamps and numeric OHLC', () => {
    const csv = [
      'timestamp,open,high,low,close,volume',
      '2025-06-10T08:00:00.000Z,3342.5,3344,3341,3343,120',
      '2025-06-10T08:01:00.000Z,3343,3345,3342,3344.2,80'
    ].join('\n')
    const bars = parseCandleCsv(csv)
    expect(bars).toHaveLength(2)
    expect(bars[0].open).toBe(3342.5)
    expect(bars[0].timestamp).toBe(Date.parse('2025-06-10T08:00:00.000Z'))
    expect(bars[1].volume).toBe(80)
  })

  it('accepts unix milliseconds without a header', () => {
    const ts = Date.UTC(2025, 5, 10, 8, 0, 0)
    const csv = `${ts},100,101,99,100.5,10`
    const bars = parseCandleCsv(csv)
    expect(bars[0].timestamp).toBe(ts)
    expect(bars[0].close).toBe(100.5)
  })
})
