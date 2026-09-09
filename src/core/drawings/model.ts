import type { Drawing, DrawingPoint, DrawingStyle, DrawingTool } from '@shared/types'

export const DRAWING_TOOLS: DrawingTool[] = [
  'trendline',
  'horizontal',
  'ray',
  'vertical',
  'rectangle',
  'ellipse',
  'fib',
  'text',
  'brush'
]

export const DEFAULT_DRAWING_STYLE: DrawingStyle = {
  color: '#4a45d4',
  lineWidth: 2,
  dashed: false
}

const SINGLE_POINT_TOOLS: DrawingTool[] = ['horizontal', 'vertical', 'text']

export function isDrawingComplete(type: DrawingTool, points: DrawingPoint[]): boolean {
  if (type === 'brush') return points.length >= 2
  if (SINGLE_POINT_TOOLS.includes(type)) return points.length >= 1
  return points.length >= 2
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function parsePoint(raw: unknown): DrawingPoint | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Partial<DrawingPoint>
  if (!Number.isFinite(row.time) || !Number.isFinite(row.price)) return null
  return { time: row.time as number, price: row.price as number }
}

function parseStyle(raw: unknown): DrawingStyle {
  const row = raw && typeof raw === 'object' ? (raw as Partial<DrawingStyle>) : {}
  return {
    color: text(row.color, DEFAULT_DRAWING_STYLE.color),
    lineWidth: num(row.lineWidth, DEFAULT_DRAWING_STYLE.lineWidth),
    dashed: typeof row.dashed === 'boolean' ? row.dashed : DEFAULT_DRAWING_STYLE.dashed
  }
}

export function parseDrawing(raw: unknown): Drawing | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Partial<Drawing>
  if (typeof row.id !== 'string' || !row.id) return null
  if (typeof row.symbol !== 'string' || !row.symbol) return null
  if (!DRAWING_TOOLS.includes(row.type as DrawingTool)) return null
  const type = row.type as DrawingTool
  const points = Array.isArray(row.points)
    ? row.points.map(parsePoint).filter((p): p is DrawingPoint => p !== null)
    : []
  if (!isDrawingComplete(type, points)) return null
  const now = Date.now()
  return {
    id: row.id,
    symbol: row.symbol,
    type,
    points,
    text: typeof row.text === 'string' ? row.text : undefined,
    style: parseStyle(row.style),
    createdAt: num(row.createdAt, now),
    updatedAt: num(row.updatedAt, now)
  }
}
