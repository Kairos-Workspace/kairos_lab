import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DRAWING_STYLE,
  DRAWING_TOOLS,
  isDrawingComplete,
  parseDrawing
} from '@core/drawings/model'

describe('isDrawingComplete', () => {
  it('requires exactly one point for single-anchor tools', () => {
    expect(isDrawingComplete('horizontal', [{ time: 1, price: 1 }])).toBe(true)
    expect(isDrawingComplete('horizontal', [])).toBe(false)
    expect(isDrawingComplete('text', [{ time: 1, price: 1 }])).toBe(true)
  })

  it('requires two points for two-anchor tools', () => {
    expect(isDrawingComplete('trendline', [{ time: 1, price: 1 }])).toBe(false)
    expect(
      isDrawingComplete('rectangle', [
        { time: 1, price: 1 },
        { time: 2, price: 2 }
      ])
    ).toBe(true)
  })

  it('requires at least two points for brush strokes', () => {
    expect(isDrawingComplete('brush', [{ time: 1, price: 1 }])).toBe(false)
    expect(
      isDrawingComplete('brush', [
        { time: 1, price: 1 },
        { time: 2, price: 2 },
        { time: 3, price: 1.5 }
      ])
    ).toBe(true)
  })
})

describe('parseDrawing', () => {
  it('rejects junk', () => {
    expect(parseDrawing(null)).toBeNull()
    expect(parseDrawing('nope')).toBeNull()
    expect(parseDrawing({})).toBeNull()
  })

  it('rejects an unknown type', () => {
    expect(parseDrawing({ id: 'a', symbol: 'XAUUSD', type: 'pitchfork', points: [] })).toBeNull()
  })

  it('rejects a drawing with too few points for its type', () => {
    expect(parseDrawing({ id: 'a', symbol: 'XAUUSD', type: 'trendline', points: [{ time: 1, price: 1 }] })).toBeNull()
  })

  it('accepts a valid drawing and fills in default style', () => {
    const drawing = parseDrawing({
      id: 'a',
      symbol: 'xauusd',
      type: 'trendline',
      points: [
        { time: 1000, price: 10 },
        { time: 2000, price: 20 }
      ]
    })
    expect(drawing).not.toBeNull()
    expect(drawing?.symbol).toBe('xauusd')
    expect(drawing?.style).toEqual(DEFAULT_DRAWING_STYLE)
    expect(drawing?.points).toHaveLength(2)
  })

  it('keeps a provided style and drops malformed points', () => {
    const drawing = parseDrawing({
      id: 'b',
      symbol: 'EURUSD',
      type: 'horizontal',
      points: [{ time: 1000, price: 1.2 }, { bogus: true }],
      style: { color: '#fff', lineWidth: 3, dashed: true }
    })
    expect(drawing?.points).toHaveLength(1)
    expect(drawing?.style).toEqual({ color: '#fff', lineWidth: 3, dashed: true })
  })

  it('exposes every drawing tool exactly once', () => {
    expect(new Set(DRAWING_TOOLS).size).toBe(DRAWING_TOOLS.length)
    expect(DRAWING_TOOLS).toContain('fib')
  })
})
