import type { DrawingTool } from '@shared/types'

export interface Point {
  x: number
  y: number
}

export const HIT_TOLERANCE_PX = 6

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))
  const projX = a.x + t * dx
  const projY = a.y + t * dy
  return Math.hypot(p.x - projX, p.y - projY)
}

export function distanceToPolyline(p: Point, points: Point[]): number {
  if (points.length === 0) return Infinity
  if (points.length === 1) return Math.hypot(p.x - points[0].x, p.y - points[0].y)
  let min = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    min = Math.min(min, distanceToSegment(p, points[i], points[i + 1]))
  }
  return min
}

export function pointInRect(p: Point, a: Point, b: Point): boolean {
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxY = Math.max(a.y, b.y)
  return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
}

export function pointInEllipse(p: Point, a: Point, b: Point): boolean {
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2
  const rx = Math.abs(b.x - a.x) / 2
  const ry = Math.abs(b.y - a.y) / 2
  if (rx === 0 || ry === 0) return false
  const nx = (p.x - cx) / rx
  const ny = (p.y - cy) / ry
  return nx * nx + ny * ny <= 1
}

/**
 * Turns a drawing's raw anchor pixels into the pixels that are actually
 * rendered/hit-tested — e.g. a horizontal line's single anchor becomes a
 * segment spanning the full canvas width. Anchors for two-point shapes that
 * don't extend (trendline, rectangle, ellipse, fib) and brush strokes pass
 * through unchanged.
 */
export function projectedPixelPoints(
  type: DrawingTool,
  anchors: Point[],
  width: number,
  height: number
): Point[] {
  if (type === 'horizontal') {
    return [
      { x: 0, y: anchors[0].y },
      { x: width, y: anchors[0].y }
    ]
  }
  if (type === 'vertical') {
    return [
      { x: anchors[0].x, y: 0 },
      { x: anchors[0].x, y: height }
    ]
  }
  if (type === 'ray') {
    const [a, b] = anchors
    if (a.x === b.x) return [a, { x: a.x, y: b.y >= a.y ? height : 0 }]
    const slope = (b.y - a.y) / (b.x - a.x)
    const dirRight = b.x >= a.x
    const endX = dirRight ? width : 0
    const endY = a.y + slope * (endX - a.x)
    return [a, { x: endX, y: endY }]
  }
  return anchors
}
