import { describe, expect, it } from 'vitest'
import { sessionAt } from '@core/candles/session'

describe('sessionAt', () => {
  it('labels London during the London cash window', () => {
    const ts = Date.UTC(2025, 5, 10, 8, 30, 0)
    expect(sessionAt(ts)).toBe('London')
  })

  it('labels New York during the New York cash window', () => {
    const ts = Date.UTC(2025, 5, 10, 14, 35, 0)
    expect(sessionAt(ts)).toBe('New York')
  })

  it('labels Asia overnight', () => {
    const ts = Date.UTC(2025, 5, 10, 1, 0, 0)
    expect(sessionAt(ts)).toBe('Asia')
  })
})
