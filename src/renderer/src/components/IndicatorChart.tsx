import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp
} from 'lightweight-charts'
import { shouldLoadOlder, shiftedVisibleRange } from '@core/candles/pagination'
import { previewPineScript, type PinePreviewResult } from '@core/indicators/pinePreview'
import { chartSkin } from '@core/desk/theme'
import { scriptLanguage } from '@shared/scriptLab'
import type { Candle, EaScript } from '@shared/types'
import { PineOverlayPrimitive } from '../lib/pineChartPrimitive'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'

const VIEW_BARS = 160
const LOAD_MORE_THRESHOLD = 200

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

function looksLikePine(source: string): boolean {
  return /\/\/\s*@version\s*=/.test(source) || /\bindicator\s*\(/.test(source) || /\bplot\s*\(/.test(source)
}

function pineSource(script: EaScript | undefined, code: string): string | null {
  if (!script) return null
  if (scriptLanguage(script.kind, script.language) === 'pinescript') return code
  return looksLikePine(code) ? code : null
}

function visiblePriceRange(
  candles: Candle[],
  from: number,
  to: number
): { minValue: number; maxValue: number } | null {
  if (candles.length === 0) return null
  const start = Math.max(0, Math.floor(from))
  const end = Math.min(candles.length - 1, Math.ceil(to))
  if (end < start) return null
  let min = candles[start].low
  let max = candles[start].high
  for (let i = start + 1; i <= end; i++) {
    const candle = candles[i]
    if (candle.low < min) min = candle.low
    if (candle.high > max) max = candle.high
  }
  return { minValue: min, maxValue: max }
}

export const IndicatorChart = memo(function IndicatorChart({
  scripts,
  activeScriptId,
  draftCode,
  overlayId,
  onOverlayChange
}: {
  scripts: EaScript[]
  activeScriptId: string | null
  draftCode: string
  overlayId: string | null
  onOverlayChange: (id: string | null) => void
}): React.JSX.Element {
  const datasets = useAppStore((s) => s.datasets)
  const datasetId = useAppStore((s) => s.datasetId)
  const displayCandles = useAppStore((s) => s.displayCandles)
  const loadDataset = useAppStore((s) => s.loadDataset)
  const theme = useAppStore((s) => s.theme)
  const hostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const linesRef = useRef<ISeriesApi<'Line'>[]>([])
  const primitiveRef = useRef<PineOverlayPrimitive | null>(null)
  const candlesRef = useRef(displayCandles)
  candlesRef.current = displayCandles
  const [chartReady, setChartReady] = useState(0)
  const [chartFull, setChartFull] = useState(false)
  const [previews, setPreviews] = useState<{ script: EaScript; preview: PinePreviewResult }[]>([])

  const tapes = useMemo(
    () =>
      datasets
        .filter((row) => row.candleCount > 0)
        .slice()
        .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.timeframe.localeCompare(b.timeframe)),
    [datasets]
  )
  const tapeOptions = useMemo(
    () =>
      tapes.map((row) => ({
        value: String(row.id),
        label: `${row.symbol} ${row.timeframe}`
      })),
    [tapes]
  )
  const pineFiles = useMemo(
    () =>
      scripts.filter((script) => {
        const code = script.id === activeScriptId ? draftCode : script.code
        return pineSource(script, code) != null
      }),
    [scripts, activeScriptId, draftCode]
  )
  const overlayOptions = useMemo(
    () => [
      { value: 'none', label: 'None' },
      ...pineFiles.map((script) => ({ value: script.id, label: script.name }))
    ],
    [pineFiles]
  )
  const plotted = useMemo(() => {
    if (!overlayId) return []
    return pineFiles.filter((script) => script.id === overlayId)
  }, [pineFiles, overlayId])

  useEffect(() => {
    if (datasetId != null || tapes.length === 0) return
    void loadDataset(tapes[0].id)
  }, [datasetId, tapes, loadDataset])

  useEffect(() => {
    if (plotted.length === 0) {
      setPreviews([])
      return
    }
    let cancelled = false
    const scriptsToPlot = plotted
    const candles = displayCandles
    const activeId = activeScriptId
    const code = draftCode
    const handle = window.setTimeout(() => {
      if (cancelled) return
      setPreviews(
        scriptsToPlot.map((script) => ({
          script,
          preview: previewPineScript(script.id === activeId ? code : script.code, candles, script.name, {
            diagnostics: false
          })
        }))
      )
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [plotted, activeScriptId, draftCode, displayCandles])

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
      rightPriceScale: { borderColor: skin.grid, autoScale: true },
      timeScale: {
        borderColor: skin.grid,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
        fixLeftEdge: false,
        fixRightEdge: false,
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
        mouseWheel: true,
        pinch: true
      },
      kineticScroll: { mouse: false, touch: false },
      crosshair: { mode: CrosshairMode.Normal }
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: skin.bull,
      downColor: skin.bear,
      borderUpColor: skin.bull,
      borderDownColor: skin.bear,
      wickUpColor: skin.bull,
      wickDownColor: skin.bear,
      lastValueVisible: true,
      priceLineVisible: false,
      autoscaleInfoProvider: () => {
        const range = chart.timeScale().getVisibleLogicalRange()
        const bars = candlesRef.current
        const window = range ? visiblePriceRange(bars, range.from, range.to) : visiblePriceRange(bars, bars.length - VIEW_BARS, bars.length - 1)
        return window ? { priceRange: window } : null
      }
    })
    const primitive = new PineOverlayPrimitive()
    series.attachPrimitive(primitive)
    chartRef.current = chart
    candleRef.current = series
    primitiveRef.current = primitive
    const ready = window.requestAnimationFrame(() => setChartReady((value) => value + 1))
    return () => {
      window.cancelAnimationFrame(ready)
      primitiveRef.current = null
      linesRef.current = []
      chart.remove()
      chartRef.current = null
      candleRef.current = null
    }
  }, [theme, chartFull])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const onRange = (range: { from: number; to: number } | null): void => {
      if (!shouldLoadOlder(range, LOAD_MORE_THRESHOLD)) return
      void useAppStore.getState().loadOlderCandles()
    }
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange)
    return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange)
  }, [chartReady])

  useEffect(() => {
    const chart = chartRef.current
    const candleSeries = candleRef.current
    if (!chart || !candleSeries) return
    const bars: ReturnType<typeof toBar>[] = []
    for (const candle of displayCandles) {
      if (candle.close > 0) bars.push(toBar(candle))
    }
    candleSeries.setData(bars)
    const pendingShift = useAppStore.getState().pendingRangeShift
    const prior = chart.timeScale().getVisibleLogicalRange()
    if (pendingShift != null && prior) {
      chart.timeScale().setVisibleLogicalRange(shiftedVisibleRange(prior, pendingShift))
      useAppStore.setState({ pendingRangeShift: null })
    } else if (!prior && bars.length > 0) {
      const from = Math.max(0, bars.length - VIEW_BARS)
      chart.timeScale().setVisibleLogicalRange({
        from,
        to: Math.max(bars.length - 1, from + 24)
      })
    }
  }, [displayCandles, chartReady])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const visibleLines = previews.flatMap((row) =>
      row.preview.lines.filter((line) => !line.hidden && line.points.length > 0)
    )
    const hasOscillator = visibleLines.some((line) => line.pane === 'oscillator')
    chart.priceScale('right').applyOptions({
      scaleMargins: hasOscillator ? { top: 0.04, bottom: 0.3 } : { top: 0.06, bottom: 0.08 }
    })
    const next: ISeriesApi<'Line'>[] = []
    for (let i = 0; i < visibleLines.length; i++) {
      const line = visibleLines[i]
      const scaleId = line.pane === 'oscillator' ? 'pine-osc' : 'right'
      let series = linesRef.current[i]
      if (!series) {
        series = chart.addSeries(LineSeries, {
          color: line.color,
          lineWidth: 1,
          title: line.title,
          priceScaleId: scaleId,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false
        })
      } else {
        series.applyOptions({
          color: line.color,
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
      series.setData(
        line.points.map((point) => ({
          time: (point.timestamp / 1000) as UTCTimestamp,
          value: point.value
        }))
      )
      next.push(series)
    }
    for (let i = visibleLines.length; i < linesRef.current.length; i++) {
      try {
        chart.removeSeries(linesRef.current[i])
      } catch {
        /* series already gone with a rebuilt chart */
      }
    }
    linesRef.current = next
    primitiveRef.current?.setData(
      previews.flatMap((row) => row.preview.fills),
      previews.flatMap((row) => row.preview.shapes)
    )
  }, [previews, chartReady])

  useEffect(() => {
    if (!chartFull) return
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setChartFull(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chartFull])

  const selectedTape = datasetId != null ? String(datasetId) : tapeOptions[0]?.value ?? ''
  const selectedOverlay = overlayId && pineFiles.some((script) => script.id === overlayId) ? overlayId : 'none'

  return (
    <div className="indicator-chart" data-full={chartFull}>
      <div className="indicator-chart-toolbar">
        {tapeOptions.length > 0 && selectedTape ? (
          <Dropdown
            value={selectedTape}
            onChange={(value) => void loadDataset(Number(value))}
            options={tapeOptions}
            ariaLabel="Market tape"
            menuMinWidth={180}
          />
        ) : (
          <span className="indicator-chart-hint">No market tape yet. Add data in Strategy Lab.</span>
        )}
        {overlayOptions.length > 1 ? (
          <Dropdown
            value={selectedOverlay}
            onChange={(value) => onOverlayChange(value === 'none' ? null : value)}
            options={overlayOptions}
            ariaLabel="Indicator overlay"
            menuMinWidth={180}
          />
        ) : (
          <span className="indicator-chart-hint">Create a Pine Script to overlay it.</span>
        )}
        <button
          type="button"
          className="icon-btn indicator-chart-frame-btn"
          data-active={chartFull}
          onClick={() => setChartFull((value) => !value)}
          title={chartFull ? 'Exit full screen (Esc)' : 'Full screen'}
          aria-label={chartFull ? 'Exit full screen' : 'Full screen'}
        >
          <Icon name={chartFull ? 'compress' : 'expand'} />
        </button>
      </div>
      <div className="indicator-chart-legend">
        {previews.map((row) => {
          const visible = row.preview.lines.find((line) => !line.hidden)
          const parts = [
            row.script.name,
            visible?.title && visible.title !== row.script.name ? visible.title : '',
            row.preview.fills.length > 0 ? 'FVG' : '',
            row.preview.shapes.length > 0 ? `${row.preview.shapes.length} signals` : '',
            row.preview.unsupported ? 'partial preview' : ''
          ].filter(Boolean)
          return (
            <span key={row.script.id} className="indicator-chart-chip">
              <i
                style={{
                  background: visible?.color ?? row.preview.fills[0]?.color ?? '#089981'
                }}
              />
              {parts.join(' · ')}
              <button type="button" onClick={() => onOverlayChange(null)} aria-label="Hide overlay">
                <Icon name="close" size={11} />
              </button>
            </span>
          )
        })}
      </div>
      <div className="indicator-chart-stage">
        <div className="indicator-chart-host" ref={hostRef} />
        {displayCandles.length === 0 ? (
          <span className="indicator-chart-cover">No candles loaded. Add a tape in Strategy Lab.</span>
        ) : null}
      </div>
    </div>
  )
})
