import { describe, expect, it } from 'vitest'
import { itemsOverlapTime } from '@/lib/pineChartPrimitive'

describe('itemsOverlapTime', () => {
  it('keeps bands that intersect the visible window', () => {
    const items = [
      { timestamp: 0, until: 4_000 },
      { timestamp: 10_000, until: 20_000 },
      { timestamp: 50_000, until: 60_000 }
    ]
    expect(itemsOverlapTime(items, 8_000, 22_000)).toEqual([items[1]])
  })

  it('treats a point with no until as a single timestamp', () => {
    expect(itemsOverlapTime([{ timestamp: 5_000 }], 0, 10_000)).toHaveLength(1)
    expect(itemsOverlapTime([{ timestamp: 15_000 }], 0, 10_000)).toHaveLength(0)
  })
})
