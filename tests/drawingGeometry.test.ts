import { describe, expect, it } from 'vitest'
import {
  clampHandlePixel,
  distanceToPolyline,
  distanceToSegment,
  pointInEllipse,
  pointInRect,
  projectedPixelPoints
} from '@core/drawings/geometry'

describe('distanceToSegment', () => {
  it('is zero for a point on the segment', () => {
    expect(distanceToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0)
  })

  it('measures perpendicular distance to the segment body', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3)
  })

  it('measures distance to the nearest endpoint beyond the segment', () => {
    expect(distanceToSegment({ x: -4, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(4)
  })
})

describe('distanceToPolyline', () => {
  it('finds the closest of several segments', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 }
    ]
    expect(distanceToPolyline({ x: 10, y: 5 }, points)).toBe(0)
    expect(distanceToPolyline({ x: 5, y: 2 }, points)).toBe(2)
  })
})

describe('pointInRect', () => {
  it('accepts corners defined in either order', () => {
    expect(pointInRect({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 10 })).toBe(true)
    expect(pointInRect({ x: 5, y: 5 }, { x: 10, y: 10 }, { x: 0, y: 0 })).toBe(true)
    expect(pointInRect({ x: 15, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 10 })).toBe(false)
  })
})

describe('pointInEllipse', () => {
  it('accepts the center and rejects far corners', () => {
    expect(pointInEllipse({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 10 })).toBe(true)
    expect(pointInEllipse({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 })).toBe(false)
  })
})

describe('projectedPixelPoints', () => {
  const width = 100
  const height = 100

  it('extends a horizontal line across the full width', () => {
    const points = projectedPixelPoints('horizontal', [{ x: 40, y: 30 }], width, height)
    expect(points).toEqual([
      { x: 0, y: 30 },
      { x: width, y: 30 }
    ])
  })

  it('extends a vertical line across the full height', () => {
    const points = projectedPixelPoints('vertical', [{ x: 40, y: 30 }], width, height)
    expect(points).toEqual([
      { x: 40, y: 0 },
      { x: 40, y: height }
    ])
  })

  it('extends a ray from its anchor to the right edge', () => {
    const points = projectedPixelPoints(
      'ray',
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 }
      ],
      width,
      height
    )
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points[1].x).toBe(width)
    expect(points[1].y).toBe(100)
  })

  it('extends a ray from its anchor to the left edge when pointing left', () => {
    const points = projectedPixelPoints(
      'ray',
      [
        { x: 10, y: 10 },
        { x: 0, y: 0 }
      ],
      width,
      height
    )
    expect(points[1]).toEqual({ x: 0, y: 0 })
  })

  it('passes trendline and brush anchors through unchanged', () => {
    const anchors = [
      { x: 1, y: 2 },
      { x: 3, y: 4 }
    ]
    expect(projectedPixelPoints('trendline', anchors, width, height)).toEqual(anchors)
    expect(projectedPixelPoints('brush', anchors, width, height)).toEqual(anchors)
  })
})

describe('clampHandlePixel', () => {
  const width = 100
  const height = 100

  it('leaves an on-screen horizontal handle alone', () => {
    expect(clampHandlePixel('horizontal', { x: 40, y: 30 }, width, height)).toEqual({ x: 40, y: 30 })
  })

  it('pulls an off-screen horizontal handle back onto the visible edge', () => {
    expect(clampHandlePixel('horizontal', { x: -5000, y: 30 }, width, height)).toEqual({
      x: 12,
      y: 30
    })
    expect(clampHandlePixel('horizontal', { x: 5000, y: 30 }, width, height)).toEqual({
      x: 88,
      y: 30
    })
  })

  it('pulls an off-screen vertical handle back onto the visible edge', () => {
    expect(clampHandlePixel('vertical', { x: 40, y: -5000 }, width, height)).toEqual({
      x: 40,
      y: 12
    })
    expect(clampHandlePixel('vertical', { x: 40, y: 5000 }, width, height)).toEqual({
      x: 40,
      y: 88
    })
  })

  it('passes other drawing types through unchanged, even off-screen', () => {
    expect(clampHandlePixel('trendline', { x: -5000, y: 5000 }, width, height)).toEqual({
      x: -5000,
      y: 5000
    })
  })
})
