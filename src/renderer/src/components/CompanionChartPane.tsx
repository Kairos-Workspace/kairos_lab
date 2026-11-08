import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  PriceScaleMode,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp
} from 'lightweight-charts'
import { buildCompanionCandles } from '@core/candles/resample'
import { chartSkin } from '@core/desk/theme'
import { TIMEFRAMES, type Candle, type Timeframe } from '@shared/types'
import { resolvePositionLevels } from './ChartTradeOverlay'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'

interface Props {
  index: number // 0 = Chart 2, 1 = Chart 3, 2 = Chart 4
}

function toBar(candle: Candle): {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
} {
  return {
    time: Math.floor(candle.timestamp / 1000) as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close
  }
}

function formatPrice(val: number, symbol: string): string {
  const decimals = symbol.toUpperCase().includes('JPY') ? 3 : 5
  return val.toFixed(decimals)
}

export function CompanionChartPane({ index }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [chartApi, setChartApi] = useState<IChartApi | null>(null)
  const [seriesApi, setSeriesApi] = useState<ISeriesApi<'Candlestick'> | null>(null)
  const linesRef = useRef<IPriceLine[]>([])

  const symbol = useAppStore((s) => s.symbol)
  const companionTimeframes = useAppStore((s) => s.companionTimeframes)
  const setCompanionTimeframe = useAppStore((s) => s.setCompanionTimeframe)
  const paneTimeframe = companionTimeframes[index] ?? '1H'

  const sourceCandles = useAppStore((s) => s.sourceCandles)
  const sourceTimeframe = useAppStore((s) => s.sourceTimeframe)
  const displayTimeframe = useAppStore((s) => s.displayTimeframe)
  const displayCandles = useAppStore((s) => s.displayCandles)
  const replayIndex = useAppStore((s) => s.replayIndex)
  const mode = useAppStore((s) => s.mode)
  const liveMark = useAppStore((s) => s.liveMark)
  const draft = useAppStore((s) => s.draft)
  const activeTrade = useAppStore((s) => s.activeTrade)
  const horizontalLevels = useAppStore((s) => s.horizontalLevels)
  const theme = useAppStore((s) => s.theme)
  const chartFull = useAppStore((s) => s.chartFull)
  const focusedPane = useAppStore((s) => s.focusedPane)
  const toggleFocusedPane = useAppStore((s) => s.toggleFocusedPane)

  const currentCandle = mode === 'replay' ? displayCandles[replayIndex] : null

  // Compute candles strictly up to the replay clock
  const companionCandles = useMemo(() => {
    const raw = buildCompanionCandles({
      sourceCandles,
      sourceTimeframe,
      companionTimeframe: paneTimeframe,
      mode,
      currentCandle,
      currentTimeframe: displayTimeframe,
      liveMark
    })

    // Deduplicate timestamps if any overlap
    const clean: Candle[] = []
    let lastSec = -1
    for (const c of raw) {
      const sec = Math.floor(c.timestamp / 1000)
      if (sec > lastSec) {
        clean.push(c)
        lastSec = sec
      }
    }
    return clean
  }, [
    sourceCandles,
    sourceTimeframe,
    paneTimeframe,
    mode,
    currentCandle,
    displayTimeframe,
    liveMark
  ])

  // Initialize Lightweight-Charts instance
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
        mode: PriceScaleMode.Normal,
        autoScale: true
      },
      timeScale: {
        borderColor: skin.grid,
        timeVisible: true,
        secondsVisible: false
      },
      crosshair: {
        mode: CrosshairMode.Normal
      }
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: skin.background,
      downColor: skin.bear,
      borderUpColor: skin.bull,
      borderDownColor: skin.bear,
      wickUpColor: skin.bull,
      wickDownColor: skin.bear
    })

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
      chart.remove()
      setChartApi(null)
      setSeriesApi(null)
    }
  }, [theme])

  // Recalibrate and follow real time when workspace frame or pane focus changes
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
  }, [chartFull, paneTimeframe, focusedPane, chartApi])

  // Push candlestick data to the chart
  useEffect(() => {
    if (!seriesApi || !chartApi) return
    const bars = companionCandles.slice(-1200)
    seriesApi.setData(bars.map(toBar))

    if (bars.length > 0) {
      chartApi.timeScale().scrollToRealTime()
    }
  }, [seriesApi, chartApi, companionCandles])

  // Render cross-chart levels (Entry, Stop Loss, Take Profit, Horizontal levels)
  useEffect(() => {
    if (!seriesApi) return
    const skin = chartSkin()
    for (const line of linesRef.current) {
      seriesApi.removePriceLine(line)
    }
    linesRef.current = []

    const tradeLevels = resolvePositionLevels({ draft, active: activeTrade })
    const entry = tradeLevels?.entry
    const sl = tradeLevels?.stopLoss
    const tp = tradeLevels?.takeProfit

    if (entry && entry > 0) {
      linesRef.current.push(
        seriesApi.createPriceLine({
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
        seriesApi.createPriceLine({
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
        seriesApi.createPriceLine({
          price: tp,
          color: skin.bull,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `TP ${tp.toFixed(2)}`
        })
      )
    }

    for (const price of horizontalLevels) {
      if (price > 0) {
        linesRef.current.push(
          seriesApi.createPriceLine({
            price,
            color: skin.warn,
            lineStyle: LineStyle.Dotted,
            title: 'H'
          })
        )
      }
    }
  }, [seriesApi, draft, activeTrade, horizontalLevels])

  const latestBar = companionCandles.at(-1)
  const changePct = latestBar && latestBar.open > 0
    ? ((latestBar.close - latestBar.open) / latestBar.open) * 100
    : 0

  return (
    <div className="chart-pane companion-pane" data-index={index}>
      <div className="companion-header">
        <div className="companion-title-group">
          <span className="companion-badge">PANE {index + 2}</span>
          <span className="companion-symbol">{symbol}</span>
          <Dropdown
            ariaLabel={`Pane ${index + 2} Timeframe`}
            value={paneTimeframe}
            onChange={(v) => setCompanionTimeframe(index, v as Timeframe)}
            options={TIMEFRAMES.map((tf) => ({ value: tf, label: tf }))}
            className="companion-tf-dropdown"
          />
        </div>
        <div className="pane-header-right">
          {latestBar ? (
            <div className="companion-ohlc">
              <span className="ohlc-item">
                <span className="ohlc-label">O</span>
                <span className="ohlc-val">{formatPrice(latestBar.open, symbol)}</span>
              </span>
              <span className="ohlc-item">
                <span className="ohlc-label">H</span>
                <span className="ohlc-val">{formatPrice(latestBar.high, symbol)}</span>
              </span>
              <span className="ohlc-item">
                <span className="ohlc-label">L</span>
                <span className="ohlc-val">{formatPrice(latestBar.low, symbol)}</span>
              </span>
              <span className={`ohlc-item ${latestBar.close >= latestBar.open ? 'text-bull' : 'text-bear'}`}>
                <span className="ohlc-label">C</span>
                <span className="ohlc-val">{formatPrice(latestBar.close, symbol)}</span>
                <span className="ohlc-pct">
                  ({changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%)
                </span>
              </span>
            </div>
          ) : null}
          <button
            type="button"
            className="icon-btn pane-action-btn"
            onClick={() => toggleFocusedPane(index + 1)}
            title={focusedPane === index + 1 ? 'Restore grid view' : 'Maximize this chart'}
            aria-label={focusedPane === index + 1 ? 'Restore grid view' : 'Maximize chart'}
          >
            <Icon name={focusedPane === index + 1 ? 'compress' : 'expand'} size={12} />
          </button>
        </div>
      </div>
      <div className="companion-chart-host" ref={hostRef} />
    </div>
  )
}
