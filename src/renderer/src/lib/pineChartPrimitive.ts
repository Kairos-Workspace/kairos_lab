import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { PinePreviewFill, PinePreviewShape } from '@core/indicators/pinePreview'

export function itemsOverlapTime<T extends { timestamp: number; until?: number }>(
  items: T[],
  fromMs: number,
  toMs: number
): T[] {
  if (items.length === 0) return items
  const out: T[] = []
  for (const item of items) {
    const end = item.until ?? item.timestamp
    if (end < fromMs || item.timestamp > toMs) continue
    out.push(item)
  }
  return out
}

function timeRangeMs(chart: IChartApi): { fromMs: number; toMs: number } | null {
  const visible = chart.timeScale().getVisibleRange()
  if (!visible) return null
  const fromMs = Number(visible.from) * 1000
  const toMs = Number(visible.to) * 1000
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null
  return { fromMs, toMs }
}

class FillRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly chart: IChartApi,
    private readonly series: ISeriesApi<'Candlestick'>,
    private readonly fills: PinePreviewFill[]
  ) {}

  draw(): void {
    /* fills sit behind candles */
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    const range = timeRangeMs(this.chart)
    if (!range || this.fills.length === 0) return
    const spacing = Math.max(2, this.chart.timeScale().options().barSpacing)
    const visible = itemsOverlapTime(this.fills, range.fromMs, range.toMs)
    if (visible.length === 0) return
    const scale = this.chart.timeScale()
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const fill of visible) {
        const x0 = scale.timeToCoordinate((fill.timestamp / 1000) as UTCTimestamp)
        const x1 = scale.timeToCoordinate(((fill.until ?? fill.timestamp) / 1000) as UTCTimestamp)
        const y1 = this.series.priceToCoordinate(fill.top)
        const y2 = this.series.priceToCoordinate(fill.bottom)
        if (x0 == null || x1 == null || y1 == null || y2 == null) continue
        ctx.fillStyle = fill.color
        ctx.fillRect(
          Math.min(x0, x1) - spacing / 2,
          Math.min(y1, y2),
          Math.abs(x1 - x0) + spacing,
          Math.max(1, Math.abs(y2 - y1))
        )
      }
    })
  }
}

class ShapeRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly chart: IChartApi,
    private readonly series: ISeriesApi<'Candlestick'>,
    private readonly shapes: PinePreviewShape[]
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    const range = timeRangeMs(this.chart)
    if (!range || this.shapes.length === 0) return
    const visible = itemsOverlapTime(this.shapes, range.fromMs, range.toMs)
    if (visible.length === 0) return
    const scale = this.chart.timeScale()
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const shape of visible) {
        const x = scale.timeToCoordinate((shape.timestamp / 1000) as UTCTimestamp)
        const y = this.series.priceToCoordinate(shape.price)
        if (x == null || y == null) continue
        const above = shape.position === 'aboveBar'
        const tip = above ? y - 8 : y + 8
        ctx.fillStyle = shape.color
        ctx.beginPath()
        if (shape.shape === 'circle') {
          ctx.arc(x, tip, 4, 0, Math.PI * 2)
        } else if (shape.shape === 'square') {
          ctx.rect(x - 4, tip - 4, 8, 8)
        } else if (shape.shape === 'arrowDown' || above) {
          ctx.moveTo(x, tip)
          ctx.lineTo(x - 5, tip + 9)
          ctx.lineTo(x + 5, tip + 9)
        } else {
          ctx.moveTo(x, tip)
          ctx.lineTo(x - 5, tip - 9)
          ctx.lineTo(x + 5, tip - 9)
        }
        ctx.closePath()
        ctx.fill()
      }
    })
  }
}

class FillView implements IPrimitivePaneView {
  private paneRenderer: FillRenderer | null = null

  constructor(private readonly owner: PineOverlayPrimitive) {}

  zOrder(): 'bottom' {
    return 'bottom'
  }

  update(): void {
    const chart = this.owner.chart
    const series = this.owner.series
    this.paneRenderer = chart && series ? new FillRenderer(chart, series, this.owner.fills) : null
  }

  renderer(): IPrimitivePaneRenderer | null {
    return this.paneRenderer
  }
}

class ShapeView implements IPrimitivePaneView {
  private paneRenderer: ShapeRenderer | null = null

  constructor(private readonly owner: PineOverlayPrimitive) {}

  zOrder(): 'top' {
    return 'top'
  }

  update(): void {
    const chart = this.owner.chart
    const series = this.owner.series
    this.paneRenderer = chart && series ? new ShapeRenderer(chart, series, this.owner.shapes) : null
  }

  renderer(): IPrimitivePaneRenderer | null {
    return this.paneRenderer
  }
}

export class PineOverlayPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null
  series: ISeriesApi<'Candlestick'> | null = null
  fills: PinePreviewFill[] = []
  shapes: PinePreviewShape[] = []
  private requestUpdate: (() => void) | null = null
  private readonly fillView = new FillView(this)
  private readonly shapeView = new ShapeView(this)
  private readonly views: IPrimitivePaneView[] = [this.fillView, this.shapeView]

  attached(param: SeriesAttachedParameter<Time, 'Candlestick'>): void {
    this.chart = param.chart as IChartApi
    this.series = param.series as ISeriesApi<'Candlestick'>
    this.requestUpdate = param.requestUpdate
    this.updateAllViews()
    this.requestUpdate()
  }

  detached(): void {
    this.chart = null
    this.series = null
    this.requestUpdate = null
  }

  setData(fills: PinePreviewFill[], shapes: PinePreviewShape[]): void {
    this.fills = fills
    this.shapes = shapes
    this.updateAllViews()
    this.requestUpdate?.()
  }

  updateAllViews(): void {
    this.fillView.update()
    this.shapeView.update()
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views
  }
}
