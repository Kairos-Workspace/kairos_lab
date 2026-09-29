import { useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp
} from 'lightweight-charts'
import {
  strategyIndicatorLast,
  strategyIndicatorLines,
  strategyIndicatorSpecs
} from '@core/indicators/overlay'
import { previewPineScript } from '@core/indicators/pinePreview'
import type { PinePreviewFill, PinePreviewLine, PinePreviewShape } from '@core/indicators/pinePreview'
import { PineOverlayPrimitive } from '../lib/pineChartPrimitive'
import { shouldLoadOlder, shiftedVisibleRange } from '@core/candles/pagination'
import type { Candle, StrategySettings } from '@shared/types'
import { Icon } from './Icon'
import { ChartTradeOverlay, resolvePositionLevels } from './ChartTradeOverlay'
import { DrawingLayer } from './DrawingLayer'
import { DrawingToolbar } from './DrawingToolbar'
import { ReplayControls } from './ReplayControls'
import { chartSkin } from '@core/desk/theme'
import { useAppStore } from '../store/useAppStore'

const VIEW_BARS = 160
const LOAD_MORE_THRESHOLD = 200
/** Hard cap on candles fed to lightweight-charts during replay — full tapes stall scroll. */
const SERIES_WINDOW = 1000
const SERIES_EXPAND = 500

/** Pin the live bar to the right (browse / live tape). */
function trailingRange(count: number): { from: number; to: number } {
  const from = Math.max(0, count - VIEW_BARS)
  return { from, to: Math.max(count - 1, from + 24) }
}

/** Keep the replay cursor mid-chart with empty space ahead — backtesting UX. */
function centeredReplayRange(count: number): { from: number; to: number } {
  const current = Math.max(0, count - 1)
  const half = VIEW_BARS / 2
  return { from: current - half, to: current + half }
}

function replaySeriesSlice(
  tape: Candle[],
  replayIndex: number,
  lookback: number
): { bars: Candle[]; start: number } {
  const end = Math.min(tape.length, Math.max(0, replayIndex) + 1)
  const start = Math.max(0, end - lookback)
  return { bars: tape.slice(start, end), start }
}

function visibleSlice(candles: Candle[], from: number, to: number): Candle[] {
  if (candles.length === 0) return []
  const start = Math.max(0, Math.floor(from))
  const end = Math.min(candles.length - 1, Math.ceil(to))
  if (end < start) return candles.slice(-VIEW_BARS)
  return candles.slice(start, end + 1)
}

function priceWindow(
  bars: Candle[],
  extras: number[] = []
): { minValue: number; maxValue: number } | null {
  let lo = Number.POSITIVE_INFINITY
  let hi = Number.NEGATIVE_INFINITY
  for (const bar of bars) {
    if (bar.low > 0) lo = Math.min(lo, bar.low)
    if (bar.high > 0) hi = Math.max(hi, bar.high)
  }
  for (const price of extras) {
    if (price > 0) {
      lo = Math.min(lo, price)
      hi = Math.max(hi, price)
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null
  const pad = Math.max((hi - lo) * 0.12, hi * 0.004, 0.5)
  return {
    minValue: Math.max(0, lo - pad),
    maxValue: hi + pad
  }
}

function toBar(candle: Candle): {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
} {
  return {
    time: (candle.timestamp / 1000) as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close
  }
}

function overlayKey(settings: StrategySettings): string {
  return `${settings.strategyId}:${settings.lookback}`
}

function toLinePoint(point: { timestamp: number; value: number }): {
  time: UTCTimestamp
  value: number
} {
  return { time: (point.timestamp / 1000) as UTCTimestamp, value: point.value }
}

export function ChartPanel(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const linesRef = useRef<IPriceLine[]>([])
  const candlesRef = useRef<Candle[]>([])
  const prevCount = useRef(0)
  const prevOverlayKey = useRef('')
  const prevDisplayCandlesRef = useRef<Candle[] | null>(null)
  const indicatorsRef = useRef(new Map<string, ISeriesApi<'Line'>>())
  const pinePrimitiveRef = useRef<PineOverlayPrimitive | null>(null)
  const pineLinesRef = useRef<ISeriesApi<'Line'>[]>([])
  const paintTokenRef = useRef(0)
  const lastVisibleRangeRef = useRef<{ from: number; to: number } | null>(null)
  const seriesLookbackRef = useRef(SERIES_WINDOW)
  const seriesStartRef = useRef(0)
  const pineApplySkipRef = useRef(0)
  const pineCacheRef = useRef<{
    key: string
    fills: PinePreviewFill[]
    shapes: PinePreviewShape[]
    lines: PinePreviewLine[]
  } | null>(null)
  const [chartApi, setChartApi] = useState<IChartApi | null>(null)
  const [seriesApi, setSeriesApi] = useState<ISeriesApi<'Candlestick'> | null>(null)

  const hasTape = useAppStore((s) => s.displayCandles.length > 0)
  const activeTrade = useAppStore((s) => s.activeTrade)
  const selectedId = useAppStore((s) => s.selectedTradeId)
  const trades = useAppStore((s) => s.trades)
  const levels = useAppStore((s) => s.horizontalLevels)
  const mode = useAppStore((s) => s.mode)
  const replayIndex = useAppStore((s) => s.replayIndex)
  const isPlaying = useAppStore((s) => s.isPlaying)
  const followReplay = useAppStore((s) => s.followReplay)
  const displayCandles = useAppStore((s) => s.displayCandles)
  const draft = useAppStore((s) => s.draft)
  const settings = useAppStore((s) => s.settings)
  const theme = useAppStore((s) => s.theme)
  const chartFull = useAppStore((s) => s.chartFull)
  const toggleChartFull = useAppStore((s) => s.toggleChartFull)
  const pineIndicators = useAppStore((s) => s.pineIndicators)
  const activeTool = useAppStore((s) => s.activeTool)
  const rightTab = useAppStore((s) => s.rightTab)
  const setRightTab = useAppStore((s) => s.setRightTab)
  const startManualTrade = useAppStore((s) => s.startManualTrade)
  const canStartManualTrade = hasTape && !activeTrade && !draft
  const extras = (() => {
    const prices: number[] = []
    const live = resolvePositionLevels({ draft, active: activeTrade })
    if (live) prices.push(live.entry, live.stopLoss, live.takeProfit)
    return prices
  })()
  const extrasRef = useRef(extras)
  extrasRef.current = extras

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const skin = chartSkin()
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: skin.background },
        textColor: skin.text,
        fontFamily: 'IBM Plex Mono, monospace',
        attributionLogo: false
      },
      grid: {
        vertLines: { color: skin.grid },
        horzLines: { color: skin.grid }
      },
      leftPriceScale: { visible: false },
      rightPriceScale: {
        borderColor: skin.grid,
        autoScale: true,
        mode: PriceScaleMode.Normal,
        invertScale: false,
        alignLabels: true,
        scaleMargins: { top: 0.06, bottom: 0.06 }
      },
      timeScale: {
        borderColor: skin.grid,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 10,
        fixLeftEdge: false,
        fixRightEdge: false,
        shiftVisibleRangeOnNewBar: false,
        lockVisibleTimeRangeOnResize: true
      },
      crosshair: { mode: CrosshairMode.Normal }
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: skin.bull,
      downColor: skin.bear,
      borderUpColor: skin.bull,
      borderDownColor: skin.bear,
      wickUpColor: skin.bull,
      wickDownColor: skin.bear,
      priceScaleId: 'right',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      lastValueVisible: true,
      priceLineVisible: true,
      autoscaleInfoProvider: () => {
        const range = chart.timeScale().getVisibleLogicalRange()
        const bars = range
          ? visibleSlice(candlesRef.current, range.from, range.to)
          : candlesRef.current.slice(-VIEW_BARS)
        return { priceRange: priceWindow(bars, extrasRef.current) }
      }
    })

    const primitive = new PineOverlayPrimitive()
    series.attachPrimitive(primitive)
    pinePrimitiveRef.current = primitive

    chartRef.current = chart
    candleRef.current = series
    setChartApi(chart)
    setSeriesApi(series)
    return () => {
      indicatorsRef.current.clear()
      pinePrimitiveRef.current = null
      pineLinesRef.current = []
      chart.remove()
      chartRef.current = null
      setChartApi(null)
      setSeriesApi(null)
    }
  }, [theme, chartFull])

  useEffect(() => {
    if (!chartApi) return
    const scale = chartApi.timeScale()
    const onRangeChange = (range: { from: number; to: number } | null): void => {
      if (range) lastVisibleRangeRef.current = range
      const s = useAppStore.getState()
      if (s.mode === 'view') {
        if (!shouldLoadOlder(range, LOAD_MORE_THRESHOLD)) return
        void s.loadOlderCandles()
        return
      }
      // Replay: expand the local series window when the user scrolls into older bars.
      if (s.mode !== 'replay' || s.followReplay || !range) return
      if (range.from >= 40 || seriesStartRef.current <= 0) return
      const end = s.replayIndex + 1
      const nextLookback = Math.min(end, seriesLookbackRef.current + SERIES_EXPAND)
      if (nextLookback <= seriesLookbackRef.current) return
      seriesLookbackRef.current = nextLookback
      const chart = chartRef.current
      const series = candleRef.current
      if (!chart || !series) return
      const { bars, start } = replaySeriesSlice(s.displayCandles, s.replayIndex, nextLookback)
      const prepended = seriesStartRef.current - start
      seriesStartRef.current = start
      candlesRef.current = bars
      prevCount.current = bars.length
      const prior = chart.timeScale().getVisibleLogicalRange() ?? range
      series.setData(bars.map(toBar))
      for (const line of strategyIndicatorLines(s.settings, bars)) {
        indicatorsRef.current.get(line.id)?.setData(line.points.map(toLinePoint))
      }
      if (prepended > 0 && prior) {
        chart.timeScale().setVisibleLogicalRange(shiftedVisibleRange(prior, prepended))
      }
    }
    scale.subscribeVisibleLogicalRangeChange(onRangeChange)
    return () => scale.unsubscribeVisibleLogicalRangeChange(onRangeChange)
  }, [chartApi])

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const onInteract = (): void => {
      const s = useAppStore.getState()
      if (s.mode !== 'replay') return
      if (s.isPlaying || s.followReplay) s.softPause()
    }
    el.addEventListener('pointerdown', onInteract, { passive: true })
    el.addEventListener('wheel', onInteract, { passive: true })
    return () => {
      el.removeEventListener('pointerdown', onInteract)
      el.removeEventListener('wheel', onInteract)
    }
  }, [])

  useEffect(() => {
    lastVisibleRangeRef.current = null
    seriesLookbackRef.current = SERIES_WINDOW
    seriesStartRef.current = 0
    pineCacheRef.current = null
  }, [displayCandles])

  useEffect(() => {
    if (!chartApi || !followReplay) return
    if (mode !== 'replay') return
    seriesLookbackRef.current = SERIES_WINDOW
    const { bars } = replaySeriesSlice(
      useAppStore.getState().displayCandles,
      replayIndex,
      SERIES_WINDOW
    )
    if (bars.length <= 0) return
    chartApi.timeScale().setVisibleLogicalRange(centeredReplayRange(bars.length))
  }, [chartApi, followReplay, mode, replayIndex])

  useEffect(() => {
    // Manual recenter on each bar — auto-shift would pin the candle to the right edge.
    chartApi?.timeScale().applyOptions({
      shiftVisibleRangeOnNewBar: false,
      rightOffset: mode === 'replay' ? 0 : 12
    })
  }, [chartApi, mode])

  useEffect(() => {
    if (mode !== 'replay') return
    shellRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [mode])

  useEffect(() => {
    const syncOverlays = (chart: IChartApi, settings: StrategySettings) => {
      const keep = new Set(strategyIndicatorSpecs(settings).map((spec) => spec.id))
      for (const [id, line] of indicatorsRef.current) {
        if (keep.has(id)) continue
        chart.removeSeries(line)
        indicatorsRef.current.delete(id)
      }
      for (const spec of strategyIndicatorSpecs(settings)) {
        const style = {
          color: spec.color,
          title: spec.title,
          lineWidth: spec.lineWidth ?? 1,
          lineStyle: spec.dashed ? LineStyle.Dashed : LineStyle.Solid
        } as const
        const existing = indicatorsRef.current.get(spec.id)
        if (existing) {
          existing.applyOptions(style)
          continue
        }
        indicatorsRef.current.set(
          spec.id,
          chart.addSeries(LineSeries, {
            ...style,
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerVisible: false
          })
        )
      }
    }

    const paint = (
      displayCandles: Candle[],
      mode: 'view' | 'replay',
      replayIndex: number,
      settings: StrategySettings
    ) => {
      const series = candleRef.current
      const chart = chartRef.current
      if (!series || !chart) return
      const follow = useAppStore.getState().followReplay

      let visible: Candle[]
      let seriesStart = 0
      if (mode === 'replay') {
        const end = Math.min(displayCandles.length, Math.max(0, replayIndex) + 1)
        if (follow) {
          // Freeze the left edge while following so each bar is a cheap series.update.
          // Compact only when the in-chart series grows well past the window.
          let start = seriesStartRef.current
          if (start >= end || end - start > SERIES_WINDOW + 400) {
            start = Math.max(0, end - SERIES_WINDOW)
          }
          seriesStart = start
          visible = displayCandles.slice(start, end)
          seriesLookbackRef.current = Math.max(SERIES_WINDOW, end - start)
        } else {
          const sliced = replaySeriesSlice(displayCandles, replayIndex, seriesLookbackRef.current)
          visible = sliced.bars
          seriesStart = sliced.start
        }
      } else {
        visible = displayCandles
      }

      const prevStart = seriesStartRef.current
      const startDelta = seriesStart - prevStart // >0 slides window forward; <0 expands left
      seriesStartRef.current = seriesStart
      candlesRef.current = visible
      const count = visible.length
      const last = visible[count - 1]
      const key = overlayKey(settings)
      const overlayChanged = key !== prevOverlayKey.current
      prevOverlayKey.current = key
      syncOverlays(chart, settings)

      const incremental =
        mode === 'replay' &&
        startDelta === 0 &&
        count === prevCount.current + 1 &&
        last != null &&
        !overlayChanged
      prevCount.current = count

      if (incremental && last) {
        series.update(toBar(last))
        for (const point of strategyIndicatorLast(settings, visible)) {
          indicatorsRef.current.get(point.id)?.update(toLinePoint(point))
        }
        if (follow) chart.timeScale().setVisibleLogicalRange(centeredReplayRange(count))
        return
      }

      // Sliding/expanding replay window — keep the series capped without the loading veil.
      if (mode === 'replay' && !overlayChanged && Math.abs(startDelta) <= SERIES_EXPAND) {
        series.setData(visible.map(toBar))
        for (const line of strategyIndicatorLines(settings, visible)) {
          indicatorsRef.current.get(line.id)?.setData(line.points.map(toLinePoint))
        }
        if (follow) {
          chart.timeScale().setVisibleLogicalRange(centeredReplayRange(count))
        } else if (startDelta !== 0) {
          const prior = chart.timeScale().getVisibleLogicalRange() ?? lastVisibleRangeRef.current
          if (prior) {
            const shifted = {
              from: prior.from - startDelta,
              to: prior.to - startDelta
            }
            lastVisibleRangeRef.current = shifted
            chart.timeScale().setVisibleLogicalRange(shifted)
          }
        }
        return
      }

      const tapeChanged = displayCandles !== prevDisplayCandlesRef.current
      const token = ++paintTokenRef.current
      if (tapeChanged) useAppStore.setState({ busy: true, status: 'Rendering chart…' })
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (paintTokenRef.current !== token) return
          if (chartRef.current !== chart || candleRef.current !== series) {
            if (tapeChanged) useAppStore.setState({ busy: false })
            return
          }
          const pendingShift = useAppStore.getState().pendingRangeShift
          const followReplay = useAppStore.getState().followReplay
          prevDisplayCandlesRef.current = displayCandles
          const preserveReplayView = mode === 'replay' && !followReplay && !tapeChanged
          const preserveRange = pendingShift != null || preserveReplayView
          const priorRange = preserveRange
            ? (chart.timeScale().getVisibleLogicalRange() ?? lastVisibleRangeRef.current)
            : null
          if (priorRange) lastVisibleRangeRef.current = priorRange
          series.setData(visible.map(toBar))
          for (const line of strategyIndicatorLines(settings, visible)) {
            indicatorsRef.current.get(line.id)?.setData(line.points.map(toLinePoint))
          }
          if (pendingShift != null && priorRange) {
            chart.timeScale().setVisibleLogicalRange(shiftedVisibleRange(priorRange, pendingShift))
          } else if (preserveReplayView && priorRange) {
            chart.timeScale().setVisibleLogicalRange(priorRange)
          } else if (mode === 'replay' && followReplay) {
            chart.timeScale().setVisibleLogicalRange(centeredReplayRange(count))
          } else {
            chart.timeScale().setVisibleLogicalRange(trailingRange(count))
          }
          if (tapeChanged) useAppStore.setState({ pendingRangeShift: null, busy: false })
          else useAppStore.setState({ pendingRangeShift: null })
        })
      })
    }

    const first = useAppStore.getState()
    paint(first.displayCandles, first.mode, first.replayIndex, first.settings)
    let prevIndex = first.replayIndex
    let prevMode = first.mode
    let prevTape = first.displayCandles
    let prevKey = overlayKey(first.settings)
    return useAppStore.subscribe((state) => {
      const key = overlayKey(state.settings)
      if (
        state.replayIndex === prevIndex &&
        state.mode === prevMode &&
        state.displayCandles === prevTape &&
        key === prevKey
      ) {
        return
      }
      prevIndex = state.replayIndex
      prevMode = state.mode
      prevTape = state.displayCandles
      prevKey = key
      paint(state.displayCandles, state.mode, state.replayIndex, state.settings)
    })
  }, [chartApi])

  useEffect(() => {
    const series = candleRef.current
    if (!series) return
    const skin = chartSkin()
    for (const line of linesRef.current) series.removePriceLine(line)
    linesRef.current = []
    const tradeLevels = resolvePositionLevels({ draft, active: activeTrade })
    const entry = tradeLevels?.entry
    const sl = tradeLevels?.stopLoss
    const tp = tradeLevels?.takeProfit
    if (entry && entry > 0) {
      linesRef.current.push(
        series.createPriceLine({
          price: entry,
          color: skin.brand,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `Entry ${entry.toFixed(2)}`
        })
      )
    }
    if (sl && sl > 0) {
      linesRef.current.push(
        series.createPriceLine({
          price: sl,
          color: skin.bear,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `SL ${sl.toFixed(2)}`
        })
      )
    }
    if (tp && tp > 0) {
      linesRef.current.push(
        series.createPriceLine({
          price: tp,
          color: skin.bull,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `TP ${tp.toFixed(2)}`
        })
      )
    }
    for (const price of levels) {
      if (price <= 0) continue
      linesRef.current.push(
        series.createPriceLine({ price, color: skin.warn, lineStyle: 2, title: 'H' })
      )
    }
    createSeriesMarkers(
      series,
      trades
        .filter((t) => !t.skipped)
        .map((t) => ({
          time: (t.openedAt / 1000) as UTCTimestamp,
          position: t.direction === 'BUY' ? 'belowBar' : 'aboveBar',
          color: t.result === 'LOSS' ? skin.bear : skin.brand,
          shape: t.direction === 'BUY' ? 'arrowUp' : 'arrowDown',
          text: t.direction
        }))
    )
  }, [activeTrade, selectedId, trades, levels, draft, settings, theme])

  useEffect(() => {
    const chart = chartRef.current
    const primitive = pinePrimitiveRef.current
    if (!chart) return

    const activeIndicators = pineIndicators.filter((ind) => ind.enabled && ind.code.trim().length > 0)

    if (activeIndicators.length === 0) {
      primitive?.setData([], [])
      for (const s of pineLinesRef.current) {
        try {
          chart.removeSeries(s)
        } catch {
          /* ignore */
        }
      }
      pineLinesRef.current = []
      pineCacheRef.current = null
      chart.priceScale('right').applyOptions({
        scaleMargins: { top: 0.06, bottom: 0.06 }
      })
      return
    }

    if (displayCandles.length === 0) return

    // During playback, applying pine overlays every bar dominates the main thread.
    if (isPlaying) {
      pineApplySkipRef.current += 1
      if (pineApplySkipRef.current < 8 && pineCacheRef.current) return
      pineApplySkipRef.current = 0
    } else {
      pineApplySkipRef.current = 0
    }

    // Cap history so large LuxAlgo-style scripts stay interactive on attach.
    const MAX_PINE_BARS = 600
    const pineCandles =
      displayCandles.length > MAX_PINE_BARS ? displayCandles.slice(-MAX_PINE_BARS) : displayCandles

    const cacheKey = activeIndicators
      .map((ind) => `${ind.id}:${ind.code.length}:${ind.code.slice(0, 48)}:${ind.code.slice(-48)}`)
      .join('|')
      .concat(`@${pineCandles.length}:${pineCandles[0]?.timestamp}:${pineCandles.at(-1)?.timestamp}`)

    let fills: PinePreviewFill[]
    let shapes: PinePreviewShape[]
    let lines: PinePreviewLine[]

    if (pineCacheRef.current?.key === cacheKey) {
      ;({ fills, shapes, lines } = pineCacheRef.current)
    } else {
      fills = []
      shapes = []
      lines = []
      for (const ind of activeIndicators) {
        try {
          const preview = previewPineScript(ind.code, pineCandles, ind.name || 'Pine Indicator', {
            diagnostics: false
          })
          if (preview.diagnostics.some((d) => d.severity === 'error')) continue
          fills.push(...preview.fills)
          shapes.push(...preview.shapes)
          lines.push(...preview.lines.filter((l) => !l.hidden))
        } catch (err) {
          console.error('[Pine Indicator Preview Error]', ind.name, err)
        }
      }
      pineCacheRef.current = { key: cacheKey, fills, shapes, lines }
    }

    const isReplay = mode === 'replay' && replayIndex >= 0 && replayIndex < displayCandles.length
    const cutoffTime = isReplay ? displayCandles[replayIndex].timestamp : Infinity

    const allFills = isReplay
      ? fills
          .filter((f) => f.timestamp <= cutoffTime)
          .map((f) => ({ ...f, until: f.until ? Math.min(f.until, cutoffTime) : cutoffTime }))
      : fills
    const allShapes = isReplay ? shapes.filter((s) => s.timestamp <= cutoffTime) : shapes
    const allLines = lines
      .map((l) => ({
        ...l,
        points: isReplay ? l.points.filter((p) => p.timestamp <= cutoffTime) : l.points
      }))
      .filter((l) => l.points.length > 0)

    primitive?.setData(allFills, allShapes)

    const hasOscillator = allLines.some((l) => l.pane === 'oscillator')

    chart.priceScale('right').applyOptions({
      scaleMargins: hasOscillator ? { top: 0.04, bottom: 0.3 } : { top: 0.06, bottom: 0.06 }
    })

    const next: ISeriesApi<'Line'>[] = []
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i]
      const scaleId = line.pane === 'oscillator' ? 'pine-osc' : 'right'
      let lineSeries = pineLinesRef.current[i]
      if (!lineSeries) {
        lineSeries = chart.addSeries(LineSeries, {
          color: line.color,
          lineWidth: 1,
          title: line.title,
          priceScaleId: scaleId,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false
        })
      } else {
        lineSeries.applyOptions({
          color: line.color,
          lineWidth: 1,
          title: line.title,
          priceScaleId: scaleId
        })
      }
      if (line.pane === 'oscillator') {
        chart.priceScale('pine-osc').applyOptions({
          visible: true,
          scaleMargins: { top: 0.76, bottom: 0.02 }
        })
      }
      lineSeries.setData(
        line.points.map((p) => ({
          time: (p.timestamp / 1000) as UTCTimestamp,
          value: p.value
        }))
      )
      next.push(lineSeries)
    }

    for (let i = allLines.length; i < pineLinesRef.current.length; i++) {
      try {
        chart.removeSeries(pineLinesRef.current[i])
      } catch {
        /* ignore */
      }
    }
    pineLinesRef.current = next
  }, [chartApi, displayCandles, mode, replayIndex, pineIndicators, isPlaying])

  return (
    <section className="chart-shell" ref={shellRef}>
      <button
        className="icon-btn chart-fx-btn"
        data-active={rightTab === 'indicators' || pineIndicators.some((i) => i.enabled)}
        onClick={() => setRightTab('indicators')}
        title="Custom Pine Script Indicator (fx)"
        aria-label="Pine Script Indicator"
      >
        <span className="fx-pill">fx</span>
      </button>
      <button
        className="icon-btn chart-frame-btn"
        data-active={chartFull}
        onClick={toggleChartFull}
        title={chartFull ? 'Desk layout (F)' : 'Full frame (F)'}
        aria-label={chartFull ? 'Desk layout' : 'Full frame'}
      >
        <Icon name={chartFull ? 'compress' : 'expand'} />
      </button>
      {canStartManualTrade ? (
        <div className="chart-trade-actions">
          <button className="buy icon-label direction-btn" onClick={() => startManualTrade('BUY')}>
            <Icon name="arrowUp" size={13} />
            Buy
          </button>
          <button className="sell icon-label direction-btn" onClick={() => startManualTrade('SELL')}>
            <Icon name="arrowDown" size={13} />
            Sell
          </button>
        </div>
      ) : null}
      <div className="chart" data-drawing-active={activeTool !== null} ref={hostRef}>
        {hasTape ? null : (
          <div className="chart-empty">
            <h2>Pick a pair</h2>
            <p>Choose a symbol in the top bar. The chart loads from the local database.</p>
          </div>
        )}
        <DrawingToolbar />
        <ChartTradeOverlay chart={chartApi} series={seriesApi} host={hostRef.current} />
        <DrawingLayer chart={chartApi} series={seriesApi} host={hostRef.current} />
      </div>
      <ReplayControls />
    </section>
  )
}
