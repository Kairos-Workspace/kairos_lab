import { describe, expect, it } from 'vitest'
import { shouldLoadOlder, shiftedVisibleRange } from '@core/candles/pagination'

describe('shouldLoadOlder', () => {
  it('is false when there is no visible range yet', () => {
    expect(shouldLoadOlder(null, 200)).toBe(false)
  })

  it('is false when the visible range is well within the loaded data', () => {
    expect(shouldLoadOlder({ from: 500, to: 700 }, 200)).toBe(false)
  })

  it('is true once the visible range gets within the threshold of the start', () => {
    expect(shouldLoadOlder({ from: 150, to: 350 }, 200)).toBe(true)
  })

  it('treats the threshold itself as not yet close enough', () => {
    expect(shouldLoadOlder({ from: 200, to: 400 }, 200)).toBe(false)
  })
})

describe('shiftedVisibleRange', () => {
  it('shifts both edges by the added count', () => {
    expect(shiftedVisibleRange({ from: 100, to: 300 }, 40)).toEqual({ from: 140, to: 340 })
  })

  it('is a no-op when nothing was added', () => {
    expect(shiftedVisibleRange({ from: 100, to: 300 }, 0)).toEqual({ from: 100, to: 300 })
  })
})
