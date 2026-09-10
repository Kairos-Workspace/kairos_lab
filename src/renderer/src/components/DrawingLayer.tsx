import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import type { Drawing, DrawingPoint } from '@shared/types'
import { fibLevels } from '@core/drawings/fib'
import { projectedPixelPoints, type Point } from '@core/drawings/geometry'
import { useAppStore } from '../store/useAppStore'

interface Props {
  chart: IChartApi | null
  series: ISeriesApi<'Candlestick'> | null
  host: HTMLDivElement | null
}

export function DrawingLayer({ chart, series, host }: Props): React.JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawings = useAppStore((s) => s.drawings)
  const drawingsHidden = useAppStore((s) => s.drawingsHidden)
  const drawingsRef = useRef(drawings)
  drawingsRef.current = drawings

  function toPixel(point: DrawingPoint): Point | null {
    if (!chart || !series) return null
    const x = chart.timeScale().timeToCoordinate((point.time / 1000) as UTCTimestamp)
    const y = series.priceToCoordinate(point.price)
    if (x == null || y == null) return null
    return { x, y }
  }

  function drawingPixels(drawing: Drawing, width: number, height: number): Point[] | null {
    const pixels: Point[] = []
    for (const point of drawing.points) {
      const pixel = toPixel(point)
      if (!pixel) return null
      pixels.push(pixel)
    }
    return projectedPixelPoints(drawing.type, pixels, width, height)
  }

  function paint(): void {
    const canvas = canvasRef.current
    if (!canvas || !chart || !series || !host) return
    const width = host.clientWidth
    const height = host.clientHeight
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    if (drawingsHidden) return
    for (const drawing of drawingsRef.current) {
      const pixels = drawingPixels(drawing, width, height)
      if (!pixels) continue
      paintShape(ctx, drawing, pixels, (price) => series.priceToCoordinate(price))
    }
  }

  useEffect(() => {
    if (!chart || !series || !host) return
    let raf = 0
    const loop = (): void => {
      paint()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [chart, series, host, drawings, drawingsHidden])

  return <canvas className="drawing-layer-canvas" ref={canvasRef} data-capture="false" />
}

function paintShape(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  pixels: Point[],
  toY: (price: number) => number | null
): void {
  ctx.save()
  ctx.strokeStyle = drawing.style.color
  ctx.fillStyle = drawing.style.color
  ctx.lineWidth = drawing.style.lineWidth
  ctx.setLineDash(drawing.style.dashed ? [6, 4] : [])
  ctx.font = '11px "IBM Plex Mono", monospace'

  if (drawing.type === 'rectangle') {
    const [a, b] = pixels
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    const w = Math.abs(b.x - a.x)
    const h = Math.abs(b.y - a.y)
    ctx.globalAlpha = 0.12
    ctx.fillRect(x, y, w, h)
    ctx.globalAlpha = 1
    ctx.strokeRect(x, y, w, h)
  } else if (drawing.type === 'ellipse') {
    const [a, b] = pixels
    const cx = (a.x + b.x) / 2
    const cy = (a.y + b.y) / 2
    const rx = Math.abs(b.x - a.x) / 2
    const ry = Math.abs(b.y - a.y) / 2
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.globalAlpha = 0.12
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.stroke()
  } else if (drawing.type === 'text') {
    const [a] = pixels
    ctx.textBaseline = 'bottom'
    ctx.fillText(drawing.text ?? '', a.x + 4, a.y - 4)
  } else if (drawing.type === 'fib') {
    const [a, b] = drawing.points
    const x0 = Math.min(pixels[0].x, pixels[1].x)
    const x1 = Math.max(pixels[0].x, pixels[1].x)
    for (const level of fibLevels(a.price, b.price)) {
      const y = toY(level.price)
      if (y == null) continue
      ctx.beginPath()
      ctx.moveTo(x0, y)
      ctx.lineTo(x1, y)
      ctx.stroke()
      ctx.fillText(`${(level.ratio * 100).toFixed(1)}%  ${level.price.toFixed(2)}`, x1 + 4, y - 2)
    }
  } else {
    ctx.beginPath()
    pixels.forEach((point, i) => (i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)))
    ctx.stroke()
  }
  ctx.restore()
}
