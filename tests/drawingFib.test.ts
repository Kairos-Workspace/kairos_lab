import { describe, expect, it } from 'vitest'
import { FIB_RATIOS, fibLevels } from '@core/drawings/fib'

describe('fibLevels', () => {
  it('interpolates the standard ratios from the first anchor to the second', () => {
    const levels = fibLevels(100, 200)
    expect(levels).toHaveLength(FIB_RATIOS.length)
    expect(levels[0]).toEqual({ ratio: 0, price: 100 })
    expect(levels.find((l) => l.ratio === 0.5)?.price).toBe(150)
    expect(levels.find((l) => l.ratio === 0.618)?.price).toBeCloseTo(161.8)
    expect(levels[levels.length - 1]).toEqual({ ratio: 1, price: 200 })
  })

  it('works in reverse when the second anchor is lower than the first', () => {
    const levels = fibLevels(200, 100)
    expect(levels[0]).toEqual({ ratio: 0, price: 200 })
    expect(levels.find((l) => l.ratio === 0.5)?.price).toBe(150)
    expect(levels[levels.length - 1]).toEqual({ ratio: 1, price: 100 })
  })
})
