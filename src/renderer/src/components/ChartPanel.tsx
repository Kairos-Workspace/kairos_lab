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
  type ISeriesMarkersPluginApi,
  type Time,
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
import { buildCandleFormPath, formFrameCount } from '@core/candles/formPath'
import { shouldLoadOlder, shiftedVisibleRange } from '@core/candles/pagination'
import { lowerTimeframeWindow } from '@core/trade/simulation'
import { BASE_TICK_MS } from '@shared/constants'
import type { Candle, StrategySettings, Trade } from '@shared/types'
import { Badge } from './ui'
import { Icon } from './Icon'
import { ChartTradeOverlay, resolvePositionLevels } from './ChartTradeOverlay'
import { DrawingLayer } from './DrawingLayer'
import { DrawingToolbar } from './DrawingToolbar'
import { ReplayControls } from './ReplayControls'
import { CompanionChartPane } from './CompanionChartPane'
import { chartSkin } from '@core/desk/theme'
import { useAppStore } from '../store/useAppStore'

const VIEW_BARS = 160
const ZOOM_PRESETS = [50, 100, 200] as const
const LOAD_MORE_THRESHOLD = 200
/** Hard cap on candles fed to lightweight-charts during replay — full tapes stall scroll. */
const SERIES_WINDOW = 1000
const SERIES_EXPAND = 500
const MIN_BAR_SPACING = 4
const MAX_BAR_SPACING = 18

/** Bumps on every HMR of this file so the chart remounts and drops orphan marker plugins. */
let CHART_BOOT = 0
CHART_BOOT += 1

function clampBarSpacing(spacing: number): number {
  return Math.min(MAX_BAR_SPACING, Math.max(MIN_BAR_SPACING, spacing))
}

/** Prefer denser candles when zoomed out, wider when zoomed in. */
function spacingForBars(bars: number): number {
  if (bars <= 60) return 14
  if (bars <= 120) return 10
  if (bars <= 180) return 8
  return 6
}

/** Pin the live bar to the right (browse / live tape). */
function trailingRange(count: number, bars = VIEW_BARS): { from: number; to: number } {
  const from = Math.max(0, count - bars)
  return { from, to: Math.max(count - 1, from + 24) }
}

/** Keep the replay cursor mid-chart with empty space ahead — backtesting UX. */
function centeredReplayRange(count: number, bars = VIEW_BARS): { from: number; to: number } {
  const current = Math.max(0, count - 1)
  // Bias playhead slightly right of center so history scrolls left as bars print.
  const rightPad = Math.floor(bars * 0.38)
  const leftPad = bars - rightPad
  return { from: current - leftPad, to: current + rightPad }
}

function syncReplayFollowViewport(
  chart: IChartApi,
  seriesLength: number,
  bars = VIEW_BARS
): void {
  if (seriesLength <= 0) return
  chart.timeScale().setVisibleLogicalRange(centeredReplayRange(seriesLength, bars))
}

function applyVisibleBarWindow(
  chart: IChartApi,
  bars: number,
  opts: { follow: boolean; seriesLength: number; mid?: number }
): void {
  const scale = chart.timeScale()
  if (opts.follow && opts.seriesLength > 0) {
    scale.setVisibleLogicalRange(centeredReplayRange(opts.seriesLength, bars))
  } else {
    const prior = scale.getVisibleLogicalRange()
    const mid =
      opts.mid ??
      (prior ? (prior.from + prior.to) / 2 : Math.max(0, opts.seriesLength - 1))
    const half = bars / 2
    scale.setVisibleLogicalRange({ from: mid - half, to: mid + half })
  }
  scale.applyOptions({ barSpacing: clampBarSpacing(spacingForBars(bars)) })
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

/**
 * Markers whose time isn't on the plotted series snap to the nearest bar
 * (LWC NearestLeft/Right) — every off-window fill piles on one candle.
 * Only emit markers that match a bar currently on the series.
 */
function tradeMarkersForBars(
  bars: Candle[],
  trades: Trade[],
  active: Trade | null
): {
  time: UTCTimestamp
  position: 'belowBar' | 'aboveBar'
  color: string
  shape: 'arrowUp' | 'arrowDown'
  text: string
}[] {
  if (bars.length === 0) return []
  const skin = chartSkin()
  const onChart = new Set(bars.map((c) => Math.floor(c.timestamp / 1000)))
  const byBar = new Map<string, Trade>()
  for (const t of trades) {
    if (t.skipped) continue
    const sec = Math.floor(t.openedAt / 1000)
    if (!onChart.has(sec)) continue
    byBar.set(`${sec}:${t.direction}`, t)
  }
  if (active && !active.skipped) {
    const sec = Math.floor(active.openedAt / 1000)
    if (onChart.has(sec)) byBar.set(`${sec}:${active.direction}`, active)
  }
  return [...byBar.values()].map((t) => ({
    time: Math.floor(t.openedAt / 1000) as UTCTimestamp,
    position: t.direction === 'BUY' ? 'belowBar' : 'aboveBar',
    color: t.result === 'LOSS' ? skin.bear : t.result === 'WIN' ? skin.bull : skin.brand,
    shape: t.direction === 'BUY' ? 'arrowUp' : 'arrowDown',
    text: t.direction
  }))
}

export function ChartPanel(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const linesRef = useRef<IPriceLine[]>([])
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const bootRef = useRef(CHART_BOOT)
  const [chartBoot, setChartBoot] = useState(CHART_BOOT)
  if (bootRef.current !== CHART_BOOT) {
    bootRef.current = CHART_BOOT
    setChartBoot(CHART_BOOT)
  }
  const candlesRef = useRef<Candle[]>([])
  const prevCount = useRef(0)
  const prevOverlayKey = useRef('')
  const prevDisplayCandlesRef = useRef<Candle[] | null>(null)
  /** Last UTC-seconds time successfully plotted on the candle series. */
  const lastPlottedTimeRef = useRef<number | null>(null)
  /** True while a double-rAF setData is pending — skip series.update until it lands. */
  const fullPaintPendingRef = useRef(false)
  const indicatorsRef = useRef(new Map<string, ISeriesApi<'Line'>>())
  const pinePrimitiveRef = useRef<PineOverlayPrimitive | null>(null)
  const pineLinesRef = useRef<ISeriesApi<'Line'>[]>([])
  const paintTokenRef = useRef(0)
  const lastVisibleRangeRef = useRef<{ from: number; to: number } | null>(null)
  const seriesLookbackRef = useRef(SERIES_WINDOW)
  const seriesStartRef = useRef(0)
  /** Preferred visible bar count for Follow + zoom presets. */
  const zoomBarsRef = useRef(VIEW_BARS)
  const lockedPriceRef = useRef<{ minValue: number; maxValue: number } | null>(null)
  const panBrowseRef = useRef<{ active: boolean; x: number } | null>(null)
  /** Cancels in-flight tip morph when a new bar / full paint / unmount wins. */
  const morphGenRef = useRef(0)
  const morphRafRef = useRef(0)
  const morphTargetRef = useRef<Candle | null>(null)
  const pineCacheRef = useRef<{
    key: string
    fills: PinePreviewFill[]
    shapes: PinePreviewShape[]
    lines: PinePreviewLine[]
  } | null>(null)
  const [chartApi, setChartApi] = useState<IChartApi | null>(null)
  const [seriesApi, setSeriesApi] = useState<ISeriesApi<'Candlestick'> | null>(null)
  const [zoomBars, setZoomBars] = useState(VIEW_BARS)

  const hasTape = useAppStore((s) => s.displayCandles.length > 0)
  const activeTrade = useAppStore((s) => s.activeTrade)
  const selectedId = useAppStore((s) => s.selectedTradeId)
  const trades = useAppStore((s) => s.trades)
  const levels = useAppStore((s) => s.horizontalLevels)
  const mode = useAppStore((s) => s.mode)
  const datasetId = useAppStore((s) => s.datasetId)
  const symbol = useAppStore((s) => s.symbol)
  const displayTimeframe = useAppStore((s) => s.displayTimeframe)
  const historyStreaming = useAppStore((s) => s.historyStreaming)
  const loadingOlderCandles = useAppStore((s) => s.loadingOlderCandles)
  const stopHistoryStream = useAppStore((s) => s.stopHistoryStream)
  const historyScrollTargetIndex = useAppStore((s) => s.historyScrollTargetIndex)
  const historyViewTarget = useAppStore((s) => s.historyViewTarget)
  const setHistoryViewTarget = useAppStore((s) => s.setHistoryViewTarget)
  const dataset = useAppStore((s) => s.datasets.find((d) => d.id === s.datasetId))
  const replayIndex = useAppStore((s) => s.replayIndex)
  const followReplay = useAppStore((s) => s.followReplay)
  const setFollowReplay = useAppStore((s) => s.setFollowReplay)
  const snapToPlayhead = useAppStore((s) => s.snapToPlayhead)
  const priceScaleLocked = useAppStore((s) => s.priceScaleLocked)
  const togglePriceScaleLocked = useAppStore((s) => s.togglePriceScaleLocked)
  const displayCandles = useAppStore((s) => s.displayCandles)
  const draft = useAppStore((s) => s.draft)
  const settings = useAppStore((s) => s.settings)
  const theme = useAppStore((s) => s.theme)
  const chartFull = useAppStore((s) => s.chartFull)
  const chartLayout = useAppStore((s) => s.chartLayout)
  const focusedPane = useAppStore((s) => s.focusedPane)
  const toggleFocusedPane = useAppStore((s) => s.toggleFocusedPane)
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
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: false,
        pinch: true
      },
      kineticScroll: { mouse: false, touch: false },
      crosshair: { mode: CrosshairMode.Normal }
    })

    const series = chart.addSeries(CandlestickSeries, {
      // Hollow ups + solid downs — clearer on the dark mono shell.
      upColor: skin.background,
      downColor: skin.bear,
      borderUpColor: skin.bull,
      borderDownColor: skin.bear,
      wickUpColor: skin.bull,
      wickDownColor: skin.bear,
      borderVisible: true,
      priceScaleId: 'right',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      lastValueVisible: true,
      priceLineVisible: true,
      autoscaleInfoProvider: () => {
        if (lockedPriceRef.current) {
          return { priceRange: lockedPriceRef.current }
        }
        const range = chart.timeScale().getVisibleLogicalRange()
        const bars = range
          ? visibleSlice(candlesRef.current, range.from, range.to)
          : candlesRef.current.slice(-zoomBarsRef.current)
        return { priceRange: priceWindow(bars, extrasRef.current) }
      }
    })

    const primitive = new PineOverlayPrimitive()
    series.attachPrimitive(primitive)
    pinePrimitiveRef.current = primitive

    chartRef.current = chart
    candleRef.current = series
    markersRef.current = createSeriesMarkers(series, [])
    setChartApi(chart)
    setSeriesApi(series)

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          chart.applyOptions({ width, height })
        }
      }
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      indicatorsRef.current.clear()
      pinePrimitiveRef.current = null
      pineLinesRef.current = []
      try {
        markersRef.current?.detach()
      } catch {
        /* chart already torn down */
      }
      markersRef.current = null
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      setChartApi(null)
      setSeriesApi(null)
    }
  }, [theme, chartBoot])

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
      lastPlottedTimeRef.current = bars.length
        ? Math.floor(bars[bars.length - 1].timestamp / 1000)
        : null
      fullPaintPendingRef.current = false
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

    // Ctrl/Meta + wheel zooms; plain wheel pans via LWC and does not drop Follow.
    const onWheel = (event: WheelEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return
      const chart = chartRef.current
      if (!chart) return
      event.preventDefault()
      const scale = chart.timeScale()
      const range = scale.getVisibleLogicalRange()
      if (!range) return
      const mid = (range.from + range.to) / 2
      const span = Math.max(8, range.to - range.from)
      const factor = event.deltaY > 0 ? 1.14 : 1 / 1.14
      const nextSpan = Math.min(480, Math.max(24, span * factor))
      const bars = Math.round(nextSpan)
      zoomBarsRef.current = bars
      setZoomBars(bars)
      scale.setVisibleLogicalRange({ from: mid - nextSpan / 2, to: mid + nextSpan / 2 })
      scale.applyOptions({ barSpacing: clampBarSpacing(spacingForBars(bars)) })
    }

    // Drop Follow only on intentional pressed-mouse pan (browse mode).
    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return
      if (useAppStore.getState().activeTool) return
      panBrowseRef.current = { active: true, x: event.clientX }
    }
    const onPointerMove = (event: PointerEvent): void => {
      const pan = panBrowseRef.current
      if (!pan?.active || (event.buttons & 1) === 0) return
      if (Math.abs(event.clientX - pan.x) < 6) return
      panBrowseRef.current = null
      const s = useAppStore.getState()
      if (s.mode === 'replay' && s.followReplay) s.setFollowReplay(false)
    }
    const onPointerUp = (): void => {
      panBrowseRef.current = null
    }
    const onDblClick = (): void => {
      if (useAppStore.getState().activeTool) return
      if (useAppStore.getState().mode !== 'replay') return
      useAppStore.getState().snapToPlayhead()
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    el.addEventListener('dblclick', onDblClick)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('dblclick', onDblClick)
    }
  }, [])

  useEffect(() => {
    lastVisibleRangeRef.current = null
    seriesLookbackRef.current = SERIES_WINDOW
    seriesStartRef.current = 0
    zoomBarsRef.current = VIEW_BARS
    setZoomBars(VIEW_BARS)
    lockedPriceRef.current = null
    pineCacheRef.current = null
    prevCount.current = 0
    lastPlottedTimeRef.current = null
    fullPaintPendingRef.current = false
  }, [datasetId, symbol, displayTimeframe])

  useEffect(() => {
    if (!chartApi) return
    const id = setTimeout(() => {
      const el = hostRef.current
      if (el && el.clientWidth > 0 && el.clientHeight > 0) {
        chartApi.applyOptions({ width: el.clientWidth, height: el.clientHeight })
      }
      chartApi.timeScale().scrollToRealTime()
    }, 40)
    return () => clearTimeout(id)
  }, [chartLayout, chartFull, focusedPane, chartApi])

  useEffect(() => {
    if (historyScrollTargetIndex == null || !chartApi) return
    const half = Math.floor(VIEW_BARS / 2)
    chartApi.timeScale().setVisibleLogicalRange({
      from: historyScrollTargetIndex - half,
      to: historyScrollTargetIndex + half
    })
    useAppStore.setState({ historyScrollTargetIndex: null })
  }, [chartApi, historyScrollTargetIndex])

  useEffect(() => {
    if (!historyViewTarget || !chartApi) return
    const count = candlesRef.current.length
    if (count > 0) {
      if (historyViewTarget === 'oldest') {
        chartApi.timeScale().setVisibleLogicalRange({ from: 0, to: Math.min(count - 1, VIEW_BARS) })
      } else if (historyViewTarget === 'latest') {
        chartApi.timeScale().setVisibleLogicalRange(trailingRange(count))
      }
    }
    setHistoryViewTarget(null)
  }, [chartApi, historyViewTarget, setHistoryViewTarget])

  useEffect(() => {
    if (!chartApi || !followReplay) return
    if (mode !== 'replay') return
    // Match the follow window paint uses (frozen left edge until compact).
    const end = Math.min(
      useAppStore.getState().displayCandles.length,
      Math.max(0, replayIndex) + 1
    )
    let start = seriesStartRef.current
    if (start >= end || end - start > SERIES_WINDOW + 400) {
      start = Math.max(0, end - SERIES_WINDOW)
    }
    const count = Math.max(0, end - start)
    if (count <= 0) return
    syncReplayFollowViewport(chartApi, count, zoomBarsRef.current)
  }, [chartApi, followReplay, mode, replayIndex])

  useEffect(() => {
    if (!chartApi || !seriesApi) return
    if (priceScaleLocked) {
      const range = chartApi.timeScale().getVisibleLogicalRange()
      const bars = range
        ? visibleSlice(candlesRef.current, range.from, range.to)
        : candlesRef.current.slice(-zoomBarsRef.current)
      const frozen = priceWindow(bars, extrasRef.current)
      lockedPriceRef.current = frozen
      chartApi.priceScale('right').applyOptions({ autoScale: false })
      if (frozen) {
        try {
          chartApi.priceScale('right').setVisibleRange({
            from: frozen.minValue,
            to: frozen.maxValue
          })
        } catch {
          /* scale may not be ready yet */
        }
      }
    } else {
      lockedPriceRef.current = null
      chartApi.priceScale('right').applyOptions({ autoScale: true })
    }
  }, [chartApi, seriesApi, priceScaleLocked])

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
      const lastTimeSec = last ? Math.floor(last.timestamp / 1000) : null
      const key = overlayKey(settings)
      const overlayChanged = key !== prevOverlayKey.current
      prevOverlayKey.current = key
      syncOverlays(chart, settings)

      const applyTradeMarkers = (bars: Candle[]): void => {
        const markers = markersRef.current
        if (!markers) return
        const s = useAppStore.getState()
        markers.setMarkers(tradeMarkersForBars(bars, s.trades, s.activeTrade))
      }

      const snapMorphTarget = (): void => {
        const target = morphTargetRef.current
        morphTargetRef.current = null
        if (!target || !candleRef.current) return
        try {
          candleRef.current.update(toBar(target))
        } catch {
          // Series may have been reset mid-morph.
        }
      }

      const cancelMorph = (snap = true): void => {
        morphGenRef.current += 1
        if (morphRafRef.current) {
          cancelAnimationFrame(morphRafRef.current)
          morphRafRef.current = 0
        }
        if (snap) snapMorphTarget()
        else morphTargetRef.current = null
      }

      const morphTip = (target: Candle, prior: Candle | undefined, durationMs: number): void => {
        const seriesApi = candleRef.current
        if (!seriesApi) return
        cancelMorph(true)
        const gen = morphGenRef.current
        morphTargetRef.current = target
        const store = useAppStore.getState()
        const ticks =
          store.sourceTimeframe !== store.displayTimeframe && prior
            ? lowerTimeframeWindow(store.sourceCandles, prior.timestamp, target.timestamp)
            : []
        const frames = buildCandleFormPath(target, ticks, formFrameCount(durationMs))
        const started = performance.now()

        const paintFrame = (frame: Candle): void => {
          try {
            seriesApi.update(toBar(frame))
            useAppStore.setState({ liveMark: frame.close, formingCandle: frame })
          } catch {
            cancelMorph(false)
          }
        }

        paintFrame(frames[0] ?? target)

        const tick = (now: number): void => {
          if (gen !== morphGenRef.current || candleRef.current !== seriesApi) {
            morphRafRef.current = 0
            return
          }
          const t = Math.min(1, (now - started) / Math.max(16, durationMs))
          const idx = Math.min(frames.length - 1, Math.floor(t * (frames.length - 1)))
          paintFrame(frames[idx] ?? target)
          if (t < 1) {
            morphRafRef.current = requestAnimationFrame(tick)
            return
          }
          paintFrame(target)
          morphTargetRef.current = null
          morphRafRef.current = 0
          useAppStore.setState({ liveMark: target.close, formingCandle: null })
        }
        morphRafRef.current = requestAnimationFrame(tick)
      }

      const applySeriesData = (bars: Candle[]): void => {
        cancelMorph(false)
        series.setData(bars.map(toBar))
        for (const line of strategyIndicatorLines(settings, bars)) {
          indicatorsRef.current.get(line.id)?.setData(line.points.map(toLinePoint))
        }
        lastPlottedTimeRef.current = bars.length
          ? Math.floor(bars[bars.length - 1].timestamp / 1000)
          : null
        prevCount.current = bars.length
        fullPaintPendingRef.current = false
        applyTradeMarkers(bars)
      }

      const timeOk =
        lastTimeSec != null &&
        (lastPlottedTimeRef.current == null || lastTimeSec >= lastPlottedTimeRef.current)

      const incremental =
        mode === 'replay' &&
        !fullPaintPendingRef.current &&
        startDelta === 0 &&
        count === prevCount.current + 1 &&
        last != null &&
        timeOk &&
        !overlayChanged

      if (incremental && last && lastTimeSec != null) {
        try {
          const store = useAppStore.getState()
          const prior = visible[count - 2] ?? displayCandles[replayIndex - 1]
          if (store.isPlaying) {
            // Play loop owns tip morph + liveMark; seed the new bar at open.
            const tip =
              store.formingCandle && store.formingCandle.timestamp === last.timestamp
                ? store.formingCandle
                : { ...last, high: last.open, low: last.open, close: last.open }
            series.update(toBar(tip))
          } else {
            morphTip(last, prior, 140)
          }
          for (const point of strategyIndicatorLast(settings, visible)) {
            indicatorsRef.current.get(point.id)?.update(toLinePoint(point))
          }
          lastPlottedTimeRef.current = lastTimeSec
          prevCount.current = count
          applyTradeMarkers(visible)
          if (follow) syncReplayFollowViewport(chart, count, zoomBarsRef.current)
          return
        } catch {
          // Series still holds a newer tip (async setData pending / window reset) — full repaint.
        }
      }

      // Sliding/expanding replay window — keep the series capped without the loading veil.
      if (mode === 'replay' && !overlayChanged && Math.abs(startDelta) <= SERIES_EXPAND) {
        applySeriesData(visible)
        if (follow) {
          syncReplayFollowViewport(chart, count, zoomBarsRef.current)
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
      const isPaginationOrStream =
        useAppStore.getState().pendingRangeShift != null ||
        useAppStore.getState().historyStreaming ||
        (mode === 'view' && prevDisplayCandlesRef.current != null && prevDisplayCandlesRef.current.length > 0)
      const token = ++paintTokenRef.current
      fullPaintPendingRef.current = true
      prevCount.current = count
      lastPlottedTimeRef.current = lastTimeSec
      const shouldShowInitialBusy = tapeChanged && !isPaginationOrStream && prevDisplayCandlesRef.current === null
      if (shouldShowInitialBusy) useAppStore.setState({ busy: true, status: 'Rendering chart…' })
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (paintTokenRef.current !== token) return
          if (chartRef.current !== chart || candleRef.current !== series) {
            fullPaintPendingRef.current = false
            if (shouldShowInitialBusy) useAppStore.setState({ busy: false })
            return
          }
          const pendingShift = useAppStore.getState().pendingRangeShift
          const followReplay = useAppStore.getState().followReplay
          prevDisplayCandlesRef.current = displayCandles
          const preserveReplayView = mode === 'replay' && !followReplay && !tapeChanged
          const preserveViewHistory = mode === 'view' && (pendingShift != null || lastVisibleRangeRef.current != null)
          const preserveRange = pendingShift != null || preserveReplayView || preserveViewHistory
          const priorRange = preserveRange
            ? (chart.timeScale().getVisibleLogicalRange() ?? lastVisibleRangeRef.current)
            : null
          if (priorRange) lastVisibleRangeRef.current = priorRange
          applySeriesData(visible)
          if (pendingShift != null && priorRange) {
            const shifted = shiftedVisibleRange(priorRange, pendingShift)
            lastVisibleRangeRef.current = shifted
            chart.timeScale().setVisibleLogicalRange(shifted)
          } else if (preserveReplayView && priorRange) {
            chart.timeScale().setVisibleLogicalRange(priorRange)
          } else if (mode === 'replay' && followReplay) {
            syncReplayFollowViewport(chart, count, zoomBarsRef.current)
          } else if (preserveViewHistory && priorRange) {
            chart.timeScale().setVisibleLogicalRange(priorRange)
          } else {
            chart.timeScale().setVisibleLogicalRange(trailingRange(count))
          }
          if (shouldShowInitialBusy) useAppStore.setState({ pendingRangeShift: null, busy: false })
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
    const unsubscribe = useAppStore.subscribe((state) => {
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
    let prevForming = useAppStore.getState().formingCandle
    const unsubForming = useAppStore.subscribe((state) => {
      const forming = state.formingCandle
      if (forming === prevForming) return
      prevForming = forming
      const seriesApi = candleRef.current
      if (!forming || !seriesApi || state.mode !== 'replay') return
      try {
        seriesApi.update(toBar(forming))
        // Keep strategy overlays on the same tip as the forming candle.
        const end = Math.min(state.displayCandles.length, Math.max(0, state.replayIndex) + 1)
        const start = seriesStartRef.current
        const bars = state.displayCandles.slice(start, end)
        if (bars.length > 0) {
          const tipped =
            bars[bars.length - 1]?.timestamp === forming.timestamp
              ? [...bars.slice(0, -1), forming]
              : bars
          for (const point of strategyIndicatorLast(state.settings, tipped)) {
            indicatorsRef.current.get(point.id)?.update(toLinePoint(point))
          }
        }
        if (state.followReplay) {
          const chartApiLive = chartRef.current
          if (chartApiLive) {
            syncReplayFollowViewport(chartApiLive, Math.max(1, end - start), zoomBarsRef.current)
          }
        }
      } catch {
        // Series may be mid-reset.
      }
    })

    return () => {
      morphGenRef.current += 1
      if (morphRafRef.current) {
        cancelAnimationFrame(morphRafRef.current)
        morphRafRef.current = 0
      }
      morphTargetRef.current = null
      unsubForming()
      unsubscribe()
    }
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
    const markers = markersRef.current
    if (!markers) return
    markers.setMarkers(tradeMarkersForBars(candlesRef.current, trades, activeTrade))
  }, [activeTrade, selectedId, trades, levels, draft, settings, theme, replayIndex, mode, displayCandles])

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

    // Cap history so large LuxAlgo-style scripts stay interactive on attach.
    // During replay, the window must END at the playhead — using the tape's last
    // 600 bars made mid-tape backtests show nothing after the cutoff filter.
    const MAX_PINE_BARS = 600
    const isReplay = mode === 'replay' && replayIndex >= 0 && replayIndex < displayCandles.length
    const end = isReplay ? replayIndex + 1 : displayCandles.length
    const start = Math.max(0, end - MAX_PINE_BARS)
    const pineCandles = displayCandles.slice(start, end)
    if (pineCandles.length === 0) return

    const cacheKey = activeIndicators
      .map((ind) => `${ind.id}:${ind.code.length}:${ind.code.slice(0, 48)}:${ind.code.slice(-48)}`)
      .join('|')
      .concat(`@${start}:${end}:${pineCandles[0]?.timestamp}:${pineCandles.at(-1)?.timestamp}`)

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

    // Already computed up to the playhead — no future bars in the window.
    const allFills = fills
    const allShapes = shapes
    const allLines = lines.filter((l) => l.points.length > 0)

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
  }, [chartApi, displayCandles, mode, replayIndex, pineIndicators])

  return (
    <section className="chart-shell panel" ref={shellRef} data-layout={chartLayout}>
      <div
        className="multi-chart-grid"
        data-layout={chartLayout}
        data-focused={focusedPane != null ? String(focusedPane) : undefined}
      >
        <div className="chart-pane primary-pane" data-index={0}>
          {chartLayout > 1 ? (
            <div className="primary-pane-header">
              <div className="companion-title-group">
                <Badge variant="brand" size="sm" className="companion-badge primary-badge">PANE 1 · PRIMARY</Badge>
                <span className="primary-pane-info">
                  {symbol} · {displayTimeframe}
                </span>
              </div>
              <div className="pane-header-right">
                <button
                  type="button"
                  className="icon-btn pane-action-btn"
                  onClick={() => toggleFocusedPane(0)}
                  title={focusedPane === 0 ? 'Restore grid view' : 'Maximize this chart'}
                  aria-label={focusedPane === 0 ? 'Restore grid view' : 'Maximize chart'}
                >
                  <Icon name={focusedPane === 0 ? 'compress' : 'expand'} size={12} />
                </button>
              </div>
            </div>
          ) : null}
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
            <div className="chart-nav-strip" role="toolbar" aria-label="Chart controls">
              {mode === 'replay' ? (
                <button
                  type="button"
                  className="chart-nav-chip"
                  data-active={followReplay}
                  onClick={() => {
                    if (followReplay) setFollowReplay(false)
                    else snapToPlayhead()
                  }}
                  title="Chart follows playhead — turn off to look around; Home or double-click to rejoin"
                  aria-label={followReplay ? 'Following playhead' : 'Follow playhead'}
                  aria-pressed={followReplay}
                >
                  <Icon name="crosshair" size={12} />
                  <span>Follow</span>
                </button>
              ) : null}
              <div className="chart-nav-group" role="group" aria-label="Zoom presets">
                {ZOOM_PRESETS.map((bars) => (
                  <button
                    key={bars}
                    type="button"
                    className="chart-nav-chip chart-nav-chip-compact"
                    data-active={zoomBars === bars}
                    onClick={() => {
                      zoomBarsRef.current = bars
                      setZoomBars(bars)
                      if (!chartApi) return
                      const seriesLength =
                        mode === 'replay'
                          ? Math.max(0, Math.min(displayCandles.length, replayIndex + 1) - seriesStartRef.current)
                          : candlesRef.current.length
                      applyVisibleBarWindow(chartApi, bars, {
                        follow: mode === 'replay' && followReplay,
                        seriesLength
                      })
                    }}
                    title={`Show about ${bars} bars`}
                  >
                    {bars}
                  </button>
                ))}
                <button
                  type="button"
                  className="chart-nav-chip chart-nav-chip-compact"
                  data-active={zoomBars === VIEW_BARS}
                  onClick={() => {
                    zoomBarsRef.current = VIEW_BARS
                    setZoomBars(VIEW_BARS)
                    if (!chartApi) return
                    const seriesLength =
                      mode === 'replay'
                        ? Math.max(0, Math.min(displayCandles.length, replayIndex + 1) - seriesStartRef.current)
                        : candlesRef.current.length
                    applyVisibleBarWindow(chartApi, VIEW_BARS, {
                      follow: mode === 'replay' && followReplay,
                      seriesLength
                    })
                  }}
                  title={`Reset view (${VIEW_BARS} bars)`}
                >
                  Reset
                </button>
              </div>
              <button
                type="button"
                className="chart-nav-chip"
                data-active={priceScaleLocked}
                onClick={() => togglePriceScaleLocked()}
                title={
                  priceScaleLocked
                    ? 'Unlock price scale (auto-fit Y)'
                    : 'Lock price scale so pan does not reflow height'
                }
                aria-label={priceScaleLocked ? 'Unlock Y scale' : 'Lock Y scale'}
                aria-pressed={priceScaleLocked}
              >
                <span>Lock Y</span>
              </button>
            </div>
            {historyStreaming ? (
              <div className="chart-history-stream-pill" role="status" aria-live="polite">
                <span className="chart-stream-pulse" />
                <span>
                  Rendering step by step: {displayCandles.length.toLocaleString()}{' '}
                  {dataset ? `/ ${dataset.candleCount.toLocaleString()}` : ''} bars
                </span>
                <button
                  type="button"
                  className="chart-stream-stop"
                  onClick={stopHistoryStream}
                  title="Pause step-by-step rendering"
                >
                  Pause
                </button>
              </div>
            ) : loadingOlderCandles && mode === 'view' ? (
              <div className="chart-history-stream-pill" role="status" aria-live="polite">
                <span className="chart-stream-pulse" />
                <span>Loading older history…</span>
              </div>
            ) : null}
            <DrawingToolbar />
            <ChartTradeOverlay chart={chartApi} series={seriesApi} host={hostRef.current} />
            <DrawingLayer chart={chartApi} series={seriesApi} host={hostRef.current} />
          </div>
        </div>

        {chartLayout >= 2 ? <CompanionChartPane index={0} /> : null}
        {chartLayout >= 3 ? <CompanionChartPane index={1} /> : null}
        {chartLayout >= 4 ? <CompanionChartPane index={2} /> : null}
      </div>
      <ReplayControls />
    </section>
  )
}
