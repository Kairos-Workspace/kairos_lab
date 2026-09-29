import { useEffect, useRef, useState } from 'react'
import type { IChartApi, ISeriesApi, Logical, MouseEventParams, UTCTimestamp } from 'lightweight-charts'
import type { ChartTool, Drawing, DrawingPoint, DrawingTool } from '@shared/types'
import { fibLevels } from '@core/drawings/fib'
import {
  clampHandlePixel,
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

interface DragAnchor {
  logical: number
  price: number
}

/** Shift anchors by continuous logical/price deltas — avoids bar-time snapping jitter. */
function shiftAnchors(
  type: DrawingTool,
  anchors: DragAnchor[],
  dLogical: number,
  dPrice: number,
  logicalToTime: (logical: number) => number | null
): DrawingPoint[] | null {
  const next: DrawingPoint[] = []
  for (const anchor of anchors) {
    const logical = type === 'horizontal' ? anchor.logical : anchor.logical + dLogical
    const price = type === 'vertical' ? anchor.price : anchor.price + dPrice
    const time = logicalToTime(logical)
    if (time == null) return null
    next.push({ time, price })
  }
  return next
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
  const dragStartPixelRef = useRef<Point | null>(null)
  const moveDragRef = useRef<{
    id: string
    type: DrawingTool
    anchors: DragAnchor[]
    originLogical: number
    originPrice: number
    moved: boolean
  } | null>(null)

  useEffect(() => {
    pendingPointsRef.current = []
    previewPointRef.current = null
    dragStartPixelRef.current = null
    paint()
  }, [activeTool])

  // Convert pixel { x, y } to chart { time, price }
  function fromPixel(pixel: Point): DrawingPoint | null {
    if (!chart || !series || !host) return null

    let time: number | null = null
    const directTime = chart.timeScale().coordinateToTime(pixel.x)
    if (directTime != null) {
      time = (directTime as number) * 1000
    } else {
      const logical = chart.timeScale().coordinateToLogical(pixel.x)
      const candles = useAppStore.getState().displayCandles
      if (candles.length > 0) {
        const step = candles.length > 1 ? candles[1].timestamp - candles[0].timestamp : 60_000
        if (logical == null || logical >= candles.length) {
          const extra = logical != null ? logical - (candles.length - 1) : 1
          time = candles[candles.length - 1].timestamp + Math.round(extra) * step
        } else if (logical < 0) {
          time = candles[0].timestamp + Math.round(logical) * step
        } else {
          const idx = Math.min(candles.length - 1, Math.max(0, Math.round(logical)))
          time = candles[idx].timestamp
        }
      } else {
        time = Date.now()
      }
    }

    const clampedY = Math.max(2, Math.min(host.clientHeight - 2, pixel.y))
    const price = series.coordinateToPrice(clampedY) ?? series.coordinateToPrice(pixel.y)
    if (time == null || price == null) return null
    return { time, price }
  }

  // Convert chart { time, price } to pixel { x, y }
  function toPixel(point: DrawingPoint, toolType?: DrawingTool): Point | null {
    if (!chart || !series) return null

    // For horizontal lines, we only strictly need price coordinate
    if (toolType === 'horizontal') {
      const y = series.priceToCoordinate(point.price)
      if (y == null) return null
      const directX = chart.timeScale().timeToCoordinate((point.time / 1000) as UTCTimestamp)
      const x = directX != null ? (directX as number) : (host ? host.clientWidth / 2 : 0)
      return { x, y }
    }

    let x = chart.timeScale().timeToCoordinate((point.time / 1000) as UTCTimestamp)
    if (x == null) {
      const candles = useAppStore.getState().displayCandles
      if (candles.length > 0) {
        const step = candles.length > 1 ? candles[1].timestamp - candles[0].timestamp : 60_000
        let logical: number
        if (point.time <= candles[0].timestamp) {
          logical = (point.time - candles[0].timestamp) / step
        } else if (point.time >= candles[candles.length - 1].timestamp) {
          logical = (candles.length - 1) + (point.time - candles[candles.length - 1].timestamp) / step
        } else {
          let low = 0
          let high = candles.length - 1
          while (low <= high) {
            const mid = (low + high) >> 1
            if (candles[mid].timestamp < point.time) low = mid + 1
            else high = mid - 1
          }
          const i1 = Math.max(0, Math.min(candles.length - 1, low))
          const i0 = Math.max(0, i1 - 1)
          const t0 = candles[i0].timestamp
          const t1 = candles[i1].timestamp
          const frac = t1 > t0 ? (point.time - t0) / (t1 - t0) : 0
          logical = i0 + frac
        }
        x = chart.timeScale().logicalToCoordinate(logical as Logical)
      }
    }

    // For vertical lines, we only strictly need time coordinate
    if (toolType === 'vertical') {
      if (x == null) return null
      const y = series.priceToCoordinate(point.price) ?? (host ? host.clientHeight / 2 : 100)
      return { x, y }
    }

    const y = series.priceToCoordinate(point.price)
    if (x == null || y == null) return null
    return { x, y }
  }

  function timeToLogical(time: number): number | null {
    if (!chart) return null
    const x = chart.timeScale().timeToCoordinate((time / 1000) as UTCTimestamp)
    if (x != null) {
      const logical = chart.timeScale().coordinateToLogical(x)
      if (logical != null) return logical as number
    }
    const candles = useAppStore.getState().displayCandles
    if (candles.length === 0) return null
    const step = candles.length > 1 ? candles[1].timestamp - candles[0].timestamp : 60_000
    if (time <= candles[0].timestamp) return (time - candles[0].timestamp) / step
    if (time >= candles[candles.length - 1].timestamp) {
      return candles.length - 1 + (time - candles[candles.length - 1].timestamp) / step
    }
    let low = 0
    let high = candles.length - 1
    while (low <= high) {
      const mid = (low + high) >> 1
      if (candles[mid].timestamp < time) low = mid + 1
      else high = mid - 1
    }
    const i1 = Math.max(0, Math.min(candles.length - 1, low))
    const i0 = Math.max(0, i1 - 1)
    const t0 = candles[i0].timestamp
    const t1 = candles[i1].timestamp
    const frac = t1 > t0 ? (time - t0) / (t1 - t0) : 0
    return i0 + frac
  }

  function logicalToTime(logical: number): number | null {
    const candles = useAppStore.getState().displayCandles
    if (candles.length === 0) return null
    const step = candles.length > 1 ? candles[1].timestamp - candles[0].timestamp : 60_000
    if (logical < 0) return candles[0].timestamp + logical * step
    if (logical >= candles.length - 1) {
      return candles[candles.length - 1].timestamp + (logical - (candles.length - 1)) * step
    }
    const i0 = Math.floor(logical)
    const i1 = Math.min(candles.length - 1, i0 + 1)
    const frac = logical - i0
    return candles[i0].timestamp + (candles[i1].timestamp - candles[i0].timestamp) * frac
  }

  function pointerChartDelta(pixel: Point): { logical: number; price: number } | null {
    if (!chart || !series) return null
    const logical = chart.timeScale().coordinateToLogical(pixel.x)
    const price = series.coordinateToPrice(pixel.y)
    if (logical == null || price == null) return null
    return { logical: logical as number, price }
  }

  function drawingPixels(drawing: Drawing, width: number, height: number): Point[] | null {
    const pixels: Point[] = []
    for (const point of drawing.points) {
      const pixel = toPixel(point, drawing.type)
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
    if (tool === 'horizontal' && previewPointRef.current) {
      const livePixel = toPixel(previewPointRef.current, 'horizontal')
      if (livePixel) {
        ctx.save()
        ctx.strokeStyle = '#f0b90b'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(0, livePixel.y)
        ctx.lineTo(width, livePixel.y)
        ctx.stroke()
        ctx.font = '11px "IBM Plex Mono", monospace'
        ctx.fillStyle = '#f0b90b'
        ctx.fillText(previewPointRef.current.price.toFixed(2), width - 75, livePixel.y - 4)
        ctx.restore()
      }
    } else if (tool === 'vertical' && previewPointRef.current) {
      const livePixel = toPixel(previewPointRef.current, 'vertical')
      if (livePixel) {
        ctx.save()
        ctx.strokeStyle = '#f0b90b'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(livePixel.x, 0)
        ctx.lineTo(livePixel.x, height)
        ctx.stroke()
        ctx.restore()
      }
    } else if (tool && tool !== 'brush' && tool !== 'measure' && pendingPointsRef.current.length > 0) {
      const anchorPixel = toPixel(pendingPointsRef.current[0], tool)
      const livePoint = previewPointRef.current
      const livePixel = livePoint ? toPixel(livePoint, tool) : null
      if (anchorPixel && livePixel) {
        const preview: Drawing = {
          id: '__preview__',
          symbol: '',
          type: tool,
          points: [pendingPointsRef.current[0], livePoint as DrawingPoint],
          style: { color: '#f0b90b', lineWidth: 1.5, dashed: true },
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
    const schedulePaint = (): void => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        paint()
      })
    }
    paint()
    const scale = chart.timeScale()
    scale.subscribeVisibleLogicalRangeChange(schedulePaint)
    scale.subscribeSizeChange(schedulePaint)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      scale.unsubscribeVisibleLogicalRangeChange(schedulePaint)
      scale.unsubscribeSizeChange(schedulePaint)
    }
  }, [chart, series, host])

  useEffect(() => {
    paint()
  }, [drawings, drawingsHidden])

  // Cursor mode: click to select, drag body to move (capture so chart pan doesn't steal the gesture).
  useEffect(() => {
    if (!chart || !series || !host) return

    const onPointerDown = (event: PointerEvent): void => {
      if (activeToolRef.current !== null) return
      if (useAppStore.getState().drawingsHidden) return
      const target = event.target as HTMLElement | null
      if (target?.closest('.drawing-handle')) return

      const box = host.getBoundingClientRect()
      const pixel: Point = { x: event.clientX - box.left, y: event.clientY - box.top }
      if (pixel.x < 0 || pixel.y < 0 || pixel.x > box.width || pixel.y > box.height) return

      const hitId = hitTest(pixel, host.clientWidth, host.clientHeight)
      if (!hitId) {
        if (useAppStore.getState().selectedDrawingId) {
          useAppStore.getState().selectDrawing(null)
        }
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const drawing = drawingsRef.current.find((d) => d.id === hitId)
      const origin = pointerChartDelta(pixel)
      if (!drawing || !origin) return

      const anchors: DragAnchor[] = []
      for (const point of drawing.points) {
        const logical = timeToLogical(point.time)
        if (logical == null) return
        anchors.push({ logical, price: point.price })
      }

      useAppStore.getState().selectDrawing(hitId)
      useAppStore.getState().pushDrawingUndoSnapshot()
      moveDragRef.current = {
        id: hitId,
        type: drawing.type,
        anchors,
        originLogical: origin.logical,
        originPrice: origin.price,
        moved: false
      }

      const onMove = (ev: PointerEvent): void => {
        const drag = moveDragRef.current
        if (!drag) return
        const curPixel: Point = { x: ev.clientX - box.left, y: ev.clientY - box.top }
        if (!drag.moved) {
          const dist = Math.hypot(curPixel.x - pixel.x, curPixel.y - pixel.y)
          if (dist < 3) return
          drag.moved = true
        }
        const cur = pointerChartDelta(curPixel)
        if (!cur) return
        const points = shiftAnchors(
          drag.type,
          drag.anchors,
          cur.logical - drag.originLogical,
          cur.price - drag.originPrice,
          logicalToTime
        )
        if (!points) return
        useAppStore.getState().updateDrawing(drag.id, { points })
      }

      const onUp = (): void => {
        const drag = moveDragRef.current
        moveDragRef.current = null
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        if (!drag?.moved) return
        const live = useAppStore.getState().drawings.find((d) => d.id === drag.id)
        if (live) {
          useAppStore.getState().updateDrawing(drag.id, {
            points: live.points,
            immediate: true
          })
        }
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

    host.addEventListener('pointerdown', onPointerDown, true)
    return () => host.removeEventListener('pointerdown', onPointerDown, true)
  }, [chart, series, host])

  // Chart click handler when cursor mode is active (selecting existing drawings)
  useEffect(() => {
    if (!chart || !series || !host) return

    const onClick = (param: MouseEventParams): void => {
      if (!param.point) return
      if (activeToolRef.current !== null) return
      if (moveDragRef.current?.moved) return
      const width = host.clientWidth
      const height = host.clientHeight
      const hitId = hitTest(param.point, width, height)
      useAppStore.getState().selectDrawing(hitId)
    }

    chart.subscribeClick(onClick)
    return () => {
      chart.unsubscribeClick(onClick)
    }
  }, [chart, series, host])

  // Canvas pointer down handler
  function handleCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>): void {
    if (!activeTool || !host) return
    const box = host.getBoundingClientRect()
    const pixel: Point = { x: e.clientX - box.left, y: e.clientY - box.top }
    const pt = fromPixel(pixel)
    if (!pt) return

    const tool = activeTool

    if (tool === 'brush') {
      e.currentTarget.setPointerCapture(e.pointerId)
      pendingPointsRef.current = [pt]
      dragStartPixelRef.current = pixel
      paint()
      return
    }

    if (tool === 'measure') {
      e.currentTarget.setPointerCapture(e.pointerId)
      dragStartPixelRef.current = pixel
      pendingPointsRef.current = [pt]
      return
    }

    if (tool === 'horizontal' || tool === 'vertical') {
      useAppStore.getState().addDrawing({ type: tool, points: [pt] })
      useAppStore.getState().setActiveTool(null)
      return
    }

    if (tool === 'text') {
      const text = window.prompt('Note text', '')
      if (text) {
        useAppStore.getState().addDrawing({ type: 'text', points: [pt], text })
      }
      useAppStore.getState().setActiveTool(null)
      return
    }

    // Two-point tools: trendline, ray, rectangle, ellipse, fib
    if (pendingPointsRef.current.length === 0) {
      e.currentTarget.setPointerCapture(e.pointerId)
      pendingPointsRef.current = [pt]
      previewPointRef.current = pt
      dragStartPixelRef.current = pixel
      paint()
    } else {
      // Second click finishes drawing
      const p1 = pendingPointsRef.current[0]
      useAppStore.getState().addDrawing({ type: tool, points: [p1, pt] })
      pendingPointsRef.current = []
      previewPointRef.current = null
      dragStartPixelRef.current = null
      useAppStore.getState().setActiveTool(null)
      paint()
    }
  }

  // Canvas pointer move handler
  function handleCanvasPointerMove(e: React.PointerEvent<HTMLCanvasElement>): void {
    if (!activeTool || !host) return
    const box = host.getBoundingClientRect()
    const pixel: Point = { x: e.clientX - box.left, y: e.clientY - box.top }
    const pt = fromPixel(pixel)
    if (!pt) return

    const tool = activeTool

    if (tool === 'brush') {
      if (pendingPointsRef.current.length === 0) return
      const last = pendingPointsRef.current[pendingPointsRef.current.length - 1]
      const lastPx = toPixel(last, 'brush')
      if (lastPx && Math.hypot(pixel.x - lastPx.x, pixel.y - lastPx.y) < 3) return
      pendingPointsRef.current.push(pt)
      paint()
      return
    }

    if (tool === 'measure') {
      if (pendingPointsRef.current.length === 0) return
      const anchor = pendingPointsRef.current[0]
      const deltaPrice = pt.price - anchor.price
      const deltaPct = (deltaPrice / anchor.price) * 100
      const candles = useAppStore.getState().displayCandles
      const lo = Math.min(anchor.time, pt.time)
      const hi = Math.max(anchor.time, pt.time)
      const bars = candles.filter((c) => c.timestamp >= lo && c.timestamp <= hi).length
      setMeasureReadout({
        left: pixel.x,
        top: pixel.y,
        text: `${deltaPrice >= 0 ? '+' : ''}${deltaPrice.toFixed(2)} (${deltaPct.toFixed(2)}%) · ${bars} bars`
      })
      return
    }

    if (tool === 'horizontal' || tool === 'vertical') {
      previewPointRef.current = pt
      paint()
      return
    }

    // Live preview for two-point tools
    if (pendingPointsRef.current.length === 1) {
      previewPointRef.current = pt
      paint()
    }
  }

  // Canvas pointer up handler
  function handleCanvasPointerUp(e: React.PointerEvent<HTMLCanvasElement>): void {
    if (!activeTool || !host) return
    const box = host.getBoundingClientRect()
    const pixel: Point = { x: e.clientX - box.left, y: e.clientY - box.top }
    const pt = fromPixel(pixel)
    const tool = activeTool

    if (tool === 'brush') {
      const pts = pendingPointsRef.current
      if (pts.length >= 2) {
        useAppStore.getState().addDrawing({ type: 'brush', points: pts })
      }
      pendingPointsRef.current = []
      dragStartPixelRef.current = null
      useAppStore.getState().setActiveTool(null)
      paint()
      return
    }

    if (tool === 'measure') {
      pendingPointsRef.current = []
      dragStartPixelRef.current = null
      setMeasureReadout(null)
      useAppStore.getState().setActiveTool(null)
      return
    }

    // Drag-to-draw gesture for two-point tools (drag & release)
    if (dragStartPixelRef.current && pendingPointsRef.current.length === 1) {
      const dist = Math.hypot(pixel.x - dragStartPixelRef.current.x, pixel.y - dragStartPixelRef.current.y)
      if (dist >= 12 && pt) {
        const p1 = pendingPointsRef.current[0]
        useAppStore.getState().addDrawing({ type: tool, points: [p1, pt] })
        pendingPointsRef.current = []
        previewPointRef.current = null
        dragStartPixelRef.current = null
        useAppStore.getState().setActiveTool(null)
        paint()
      }
    }
  }

  // Keyboard controls: Escape to cancel, Delete to remove selected drawing
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        pendingPointsRef.current = []
        previewPointRef.current = null
        dragStartPixelRef.current = null
        useAppStore.getState().setActiveTool(null)
        useAppStore.getState().selectDrawing(null)
        paint()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
        const selId = useAppStore.getState().selectedDrawingId
        if (selId) {
          useAppStore.getState().removeDrawing(selId)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const selectedDrawingId = useAppStore((s) => s.selectedDrawingId)
  const selected = drawings.find((d) => d.id === selectedDrawingId) ?? null

  function dragHandle(index: number, event: React.PointerEvent<HTMLButtonElement>): void {
    event.preventDefault()
    event.stopPropagation()
    if (!selected || !host || !chart || !series) return
    const drawingId = selected.id
    const type = selected.type
    const startPoint = selected.points[index]
    if (!startPoint) return
    const startLogical = timeToLogical(startPoint.time)
    if (startLogical == null) return
    useAppStore.getState().pushDrawingUndoSnapshot()
    const box = host.getBoundingClientRect()
    const startPoints = selected.points.map((p) => ({ ...p }))

    const move = (ev: PointerEvent): void => {
      const cur = pointerChartDelta({ x: ev.clientX - box.left, y: ev.clientY - box.top })
      if (!cur) return
      const time =
        type === 'horizontal' ? startPoint.time : logicalToTime(cur.logical)
      const price = type === 'vertical' ? startPoint.price : cur.price
      if (time == null) return
      const points = [...startPoints]
      points[index] = { time, price }
      useAppStore.getState().updateDrawing(drawingId, { points })
    }
    const up = (ev: PointerEvent): void => {
      const cur = pointerChartDelta({ x: ev.clientX - box.left, y: ev.clientY - box.top })
      const points = [...startPoints]
      if (cur) {
        const time = type === 'horizontal' ? startPoint.time : logicalToTime(cur.logical)
        const price = type === 'vertical' ? startPoint.price : cur.price
        if (time != null) points[index] = { time, price }
      }
      useAppStore.getState().updateDrawing(drawingId, { points, immediate: true })
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

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
      } else if (distanceToPolyline(target, pixels) <= 8) {
        return drawing.id
      }
    }
    return null
  }

  return (
    <>
      <canvas
        className="drawing-layer-canvas"
        ref={canvasRef}
        data-capture={activeTool !== null ? 'true' : 'false'}
        style={{ pointerEvents: activeTool !== null ? 'auto' : 'none' }}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerLeave={() => {
          if (activeTool === 'horizontal' || activeTool === 'vertical') {
            previewPointRef.current = null
            paint()
          }
        }}
      />
      {selected
        ? selected.points.map((point, index) => {
            const rawPixel = toPixel(point, selected.type)
            if (!rawPixel || !host) return null
            const pixel = clampHandlePixel(
              selected.type,
              rawPixel,
              host.clientWidth,
              host.clientHeight
            )
            return (
              <button
                key={index}
                type="button"
                className="drawing-handle"
                style={{ left: pixel.x, top: pixel.y }}
                aria-label={`Drag ${selected.type} anchor ${index + 1}`}
                onPointerDown={(event) => dragHandle(index, event)}
              />
            )
          })
        : null}
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
