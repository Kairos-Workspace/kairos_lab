import { useEffect, useRef, useState } from 'react'
import type { IChartApi, ISeriesApi, MouseEventParams, UTCTimestamp } from 'lightweight-charts'
import type { ChartTool, Drawing, DrawingPoint, DrawingTool } from '@shared/types'
import { fibLevels } from '@core/drawings/fib'
import {
  distanceToPolyline,
  pointInEllipse,
  pointInRect,
  projectedPixelPoints,
  type Point
} from '@core/drawings/geometry'
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
  const [measureReadout, setMeasureReadout] = useState<{
    left: number
    top: number
    text: string
  } | null>(null)

  const activeTool = useAppStore((s) => s.activeTool)
  const activeToolRef = useRef<ChartTool | null>(activeTool)
  activeToolRef.current = activeTool
  const pendingPointsRef = useRef<DrawingPoint[]>([])
  const previewPointRef = useRef<DrawingPoint | null>(null)

  useEffect(() => {
    pendingPointsRef.current = []
    previewPointRef.current = null
  }, [activeTool])

  function fromPixel(pixel: Point): DrawingPoint | null {
    if (!chart || !series) return null
    const time = chart.timeScale().coordinateToTime(pixel.x) as UTCTimestamp | null
    const price = series.coordinateToPrice(pixel.y)
    if (time == null || price == null) return null
    return { time: time * 1000, price }
  }

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
    const dpr = window.devicePixelRatio || 1
    const targetWidth = Math.round(width * dpr)
    const targetHeight = Math.round(height * dpr)
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth
      canvas.height = targetHeight
    }
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    if (drawingsHidden) return
    for (const drawing of drawingsRef.current) {
      const pixels = drawingPixels(drawing, width, height)
      if (!pixels) continue
      paintShape(ctx, drawing, pixels, (price) => series.priceToCoordinate(price))
    }

    const tool = activeToolRef.current
    if (tool && tool !== 'brush' && tool !== 'measure' && pendingPointsRef.current.length > 0) {
      const anchorPixel = toPixel(pendingPointsRef.current[0])
      const livePoint = previewPointRef.current
      const livePixel = livePoint ? toPixel(livePoint) : null
      if (anchorPixel && livePixel) {
        const preview: Drawing = {
          id: '__preview__',
          symbol: '',
          type: tool,
          points: [pendingPointsRef.current[0], livePoint as DrawingPoint],
          style: { color: '#4a45d4', lineWidth: 1, dashed: true },
          createdAt: 0,
          updatedAt: 0
        }
        const previewPixels = projectedPixelPoints(tool, [anchorPixel, livePixel], width, height)
        paintShape(ctx, preview, previewPixels, (price) => series.priceToCoordinate(price))
      }
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

  useEffect(() => {
    if (!chart || !series || !host) return

    const commitPoint = (point: DrawingPoint, tool: DrawingTool): void => {
      if (tool === 'horizontal' || tool === 'vertical' || tool === 'text') {
        if (tool === 'text') {
          const value = window.prompt('Note text', '')
          if (!value) {
            useAppStore.getState().setActiveTool(null)
            return
          }
          useAppStore.getState().addDrawing({ type: tool, points: [point], text: value })
          return
        }
        useAppStore.getState().addDrawing({ type: tool, points: [point] })
        return
      }
      const pending = pendingPointsRef.current
      if (pending.length === 0) {
        pendingPointsRef.current = [point]
        return
      }
      useAppStore.getState().addDrawing({ type: tool, points: [pending[0], point] })
      pendingPointsRef.current = []
    }

    const onClick = (param: MouseEventParams): void => {
      if (!param.point) return
      const tool = activeToolRef.current
      if (!tool) {
        const width = host.clientWidth
        const height = host.clientHeight
        const hitId = hitTest(param.point, width, height)
        useAppStore.getState().selectDrawing(hitId)
        return
      }
      if (tool === 'brush' || tool === 'measure') return
      const point = fromPixel(param.point)
      if (!point) return
      commitPoint(point, tool)
    }

    const onCrosshairMove = (param: MouseEventParams): void => {
      if (!param.point || pendingPointsRef.current.length === 0) {
        previewPointRef.current = null
        return
      }
      previewPointRef.current = fromPixel(param.point)
    }

    chart.subscribeClick(onClick)
    chart.subscribeCrosshairMove(onCrosshairMove)
    return () => {
      chart.unsubscribeClick(onClick)
      chart.unsubscribeCrosshairMove(onCrosshairMove)
    }
  }, [chart, series, host])

  function hitTest(target: Point, width: number, height: number): string | null {
    for (let i = drawingsRef.current.length - 1; i >= 0; i--) {
      const drawing = drawingsRef.current[i]
      const pixels = drawingPixels(drawing, width, height)
      if (!pixels) continue
      if (drawing.type === 'rectangle' || drawing.type === 'fib') {
        if (pointInRect(target, pixels[0], pixels[1])) return drawing.id
      } else if (drawing.type === 'ellipse') {
        if (pointInEllipse(target, pixels[0], pixels[1])) return drawing.id
      } else if (drawing.type === 'text') {
        if (Math.hypot(target.x - pixels[0].x, target.y - pixels[0].y) <= 14) return drawing.id
      } else if (distanceToPolyline(target, pixels) <= 6) {
        return drawing.id
      }
    }
    return null
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !host) return
    const capturing = activeTool === 'brush' || activeTool === 'measure'
    canvas.dataset.capture = capturing ? 'true' : 'false'
    if (!capturing) return

    const bounds = (): DOMRect => host.getBoundingClientRect()

    if (activeTool === 'brush') {
      let points: DrawingPoint[] = []
      let lastPixel: Point | null = null
      const onDown = (event: PointerEvent): void => {
        const box = bounds()
        const pixel = { x: event.clientX - box.left, y: event.clientY - box.top }
        const point = fromPixel(pixel)
        if (!point) return
        points = [point]
        lastPixel = pixel
        canvas.setPointerCapture(event.pointerId)
      }
      const onMove = (event: PointerEvent): void => {
        if (points.length === 0) return
        const box = bounds()
        const pixel = { x: event.clientX - box.left, y: event.clientY - box.top }
        if (lastPixel && Math.hypot(pixel.x - lastPixel.x, pixel.y - lastPixel.y) < 3) return
        const point = fromPixel(pixel)
        if (!point) return
        points = [...points, point]
        lastPixel = pixel
        pendingPointsRef.current = points
      }
      const onUp = (): void => {
        if (points.length >= 2) useAppStore.getState().addDrawing({ type: 'brush', points })
        points = []
        pendingPointsRef.current = []
        useAppStore.getState().setActiveTool(null)
      }
      const onCancel = (): void => {
        points = []
        pendingPointsRef.current = []
        useAppStore.getState().setActiveTool(null)
      }
      canvas.addEventListener('pointerdown', onDown)
      canvas.addEventListener('pointermove', onMove)
      canvas.addEventListener('pointerup', onUp)
      canvas.addEventListener('pointercancel', onCancel)
      return () => {
        canvas.removeEventListener('pointerdown', onDown)
        canvas.removeEventListener('pointermove', onMove)
        canvas.removeEventListener('pointerup', onUp)
        canvas.removeEventListener('pointercancel', onCancel)
      }
    }

    let anchor: DrawingPoint | null = null
    const onDown = (event: PointerEvent): void => {
      const box = bounds()
      anchor = fromPixel({ x: event.clientX - box.left, y: event.clientY - box.top })
      canvas.setPointerCapture(event.pointerId)
    }
    const onMove = (event: PointerEvent): void => {
      if (!anchor) return
      const box = bounds()
      const pixel = { x: event.clientX - box.left, y: event.clientY - box.top }
      const point = fromPixel(pixel)
      if (!point) return
      const deltaPrice = point.price - anchor.price
      const deltaPct = (deltaPrice / anchor.price) * 100
      const candles = useAppStore.getState().displayCandles
      const lo = Math.min(anchor.time, point.time)
      const hi = Math.max(anchor.time, point.time)
      const bars = candles.filter((c) => c.timestamp >= lo && c.timestamp <= hi).length
      setMeasureReadout({
        left: pixel.x,
        top: pixel.y,
        text: `${deltaPrice >= 0 ? '+' : ''}${deltaPrice.toFixed(2)} (${deltaPct.toFixed(2)}%) · ${bars} bars`
      })
    }
    const onUp = (): void => {
      anchor = null
      setMeasureReadout(null)
      useAppStore.getState().setActiveTool(null)
    }
    const onCancel = (): void => {
      anchor = null
      setMeasureReadout(null)
      useAppStore.getState().setActiveTool(null)
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onCancel)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onCancel)
    }
  }, [activeTool, chart, series, host])

  return (
    <>
      <canvas className="drawing-layer-canvas" ref={canvasRef} data-capture="false" />
      {measureReadout ? (
        <div
          className="drawing-measure-label"
          style={{ left: measureReadout.left, top: measureReadout.top }}
        >
          {measureReadout.text}
        </div>
      ) : null}
    </>
  )
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
