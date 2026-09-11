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
import type { Candle, StrategySettings } from '@shared/types'
import { Icon } from './Icon'
import { ChartTradeOverlay, resolvePositionLevels } from './ChartTradeOverlay'
import { DrawingLayer } from './DrawingLayer'
import { DrawingToolbar } from './DrawingToolbar'
import { ReplayControls } from './ReplayControls'
import { TradeTicket } from './TradeTicket'
import { chartSkin } from '@core/desk/theme'
import { useAppStore } from '../store/useAppStore'

const VIEW_BARS = 160

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
  const indicatorsRef = useRef(new Map<string, ISeriesApi<'Line'>>())
  const paintTokenRef = useRef(0)
  const [chartApi, setChartApi] = useState<IChartApi | null>(null)
  const [seriesApi, setSeriesApi] = useState<ISeriesApi<'Candlestick'> | null>(null)

  const hasTape = useAppStore((s) => s.displayCandles.length > 0)
  const activeTrade = useAppStore((s) => s.activeTrade)
  const selectedId = useAppStore((s) => s.selectedTradeId)
  const trades = useAppStore((s) => s.trades)
  const levels = useAppStore((s) => s.horizontalLevels)
  const mode = useAppStore((s) => s.mode)
  const draft = useAppStore((s) => s.draft)
  const settings = useAppStore((s) => s.settings)
  const theme = useAppStore((s) => s.theme)
  const chartFull = useAppStore((s) => s.chartFull)
  const toggleChartFull = useAppStore((s) => s.toggleChartFull)
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
        rightOffset: 50,
        barSpacing: 10,
        fixLeftEdge: false,
        fixRightEdge: false,
        shiftVisibleRangeOnNewBar: true,
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

    chartRef.current = chart
    candleRef.current = series
    setChartApi(chart)
    setSeriesApi(series)
    return () => {
      indicatorsRef.current.clear()
      chart.remove()
      chartRef.current = null
      setChartApi(null)
      setSeriesApi(null)
    }
  }, [theme, chartFull])

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
      const visible =
        mode === 'replay' ? displayCandles.slice(0, replayIndex + 1) : displayCandles
      candlesRef.current = visible
      const count = visible.length
      const last = visible[count - 1]
      const key = overlayKey(settings)
      const overlayChanged = key !== prevOverlayKey.current
      prevOverlayKey.current = key
      syncOverlays(chart, settings)
      const incremental =
        mode === 'replay' && count === prevCount.current + 1 && last != null && !overlayChanged
      prevCount.current = count
      if (incremental && last) {
        series.update(toBar(last))
        for (const point of strategyIndicatorLast(settings, visible)) {
          indicatorsRef.current.get(point.id)?.update(toLinePoint(point))
        }
        return
      }

      // Full redraws recompute indicators over the whole tape and can take a
      // noticeable moment on large datasets, so show the loading overlay
      // instead of freezing the UI with no feedback.
      const token = ++paintTokenRef.current
      useAppStore.setState({ busy: true, status: 'Rendering chart…' })
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (paintTokenRef.current !== token) return
          if (chartRef.current !== chart || candleRef.current !== series) {
            useAppStore.setState({ busy: false })
            return
          }
          series.setData(visible.map(toBar))
          for (const line of strategyIndicatorLines(settings, visible)) {
            indicatorsRef.current.get(line.id)?.setData(line.points.map(toLinePoint))
          }
          const from = Math.max(0, count - VIEW_BARS)
          chart.timeScale().setVisibleLogicalRange({
            from,
            to: Math.max(count - 1, from + 24)
          })
          useAppStore.setState({ busy: false })
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

  return (
    <section className="chart-shell" ref={shellRef}>
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
      <DrawingToolbar />
      <div className="chart" data-drawing-active={useAppStore((s) => s.activeTool) !== null} ref={hostRef}>
        {hasTape ? null : (
          <div className="chart-empty">
            <h2>Pick a pair</h2>
            <p>Choose a symbol in the top bar. The chart loads from the local database.</p>
          </div>
        )}
        <ChartTradeOverlay chart={chartApi} series={seriesApi} host={hostRef.current} />
        <DrawingLayer chart={chartApi} series={seriesApi} host={hostRef.current} />
      </div>
      <TradeTicket />
      <ReplayControls />
    </section>
  )
}
