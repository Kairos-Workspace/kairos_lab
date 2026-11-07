import { useEffect, useRef, useState } from 'react'
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import { unrealizedPnl } from '@core/trade/simulation'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'
import { useCurrentCandle } from '../store/selectors'

interface Props {
  chart: IChartApi | null
  series: ISeriesApi<'Candlestick'> | null
  host: HTMLDivElement | null
}

interface Box {
  left: number
  width: number
  entryY: number
  tpY: number
  slY: number
}

export interface PositionLevels {
  id: string
  live: boolean
  direction: 'BUY' | 'SELL'
  entry: number
  stopLoss: number
  takeProfit: number
  timestamp: number
}

type DragEdge = 'stopLoss' | 'takeProfit' | 'entry'

const DEFAULT_BARS = 24
const MIN_BARS = 6

function formatFloating(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}`
}

export function ChartTradeOverlay({ chart, series, host }: Props): React.JSX.Element | null {
  const draft = useAppStore((s) => s.draft)
  const pendingSetup = useAppStore((s) => s.pendingSetup)
  const active = useAppStore((s) => s.activeTrade)
  const trades = useAppStore((s) => s.trades)
  const costs = useAppStore((s) => s.costs)
  const confirmTrade = useAppStore((s) => s.confirmTrade)
  const updateDraft = useAppStore((s) => s.updateDraft)
  const skipSetup = useAppStore((s) => s.skipSetup)
  const moveToBreakEven = useAppStore((s) => s.moveToBreakEven)
  const partialClose = useAppStore((s) => s.partialClose)
  const closeActiveTradeNow = useAppStore((s) => s.closeActiveTradeNow)
  const setDraftRiskReward = useAppStore((s) => s.setDraftRiskReward)
  const candle = useCurrentCandle()
  const liveMark = useAppStore((s) => s.liveMark)
  const [boxes, setBoxes] = useState<Record<string, Box>>({})
  const barWidths = useRef<Record<string, number>>({})
  const frames = listPositionFrames({ draft, active, trades })
  const framesRef = useRef(frames)
  framesRef.current = frames
  const frameKey = frames.map((f) => `${f.id}:${f.live}:${f.entry}:${f.stopLoss}:${f.takeProfit}`).join('|')
  const draftId = draft && !active ? `t:${draft.timestamp}` : null
  const mark = liveMark ?? candle?.close
  const floatingPnl =
    active && mark != null ? unrealizedPnl(active, mark, costs.contractSize) : null
  const activeFrameId = active ? `t:${active.openedAt}` : null

  function cancelDraft(): void {
    if (pendingSetup) skipSetup()
    else useAppStore.setState({ draft: null })
  }

  useEffect(() => {
    if (!chart || !series || !host || frames.length === 0) {
      setBoxes({})
      return
    }

    let raf = 0
    const placeNow = (): void => {
      const spacing = chart.timeScale().options().barSpacing ?? 10
      const current = framesRef.current
      setBoxes((prev) => {
        const next: Record<string, Box> = {}
        let changed = Object.keys(prev).length !== current.length
        for (const frame of current) {
          const xEntry = chart.timeScale().timeToCoordinate((frame.timestamp / 1000) as UTCTimestamp)
          const entryY = series.priceToCoordinate(frame.entry)
          const tpY = series.priceToCoordinate(frame.takeProfit)
          const slY = series.priceToCoordinate(frame.stopLoss)
          if (xEntry == null || entryY == null || tpY == null || slY == null) {
            if (prev[frame.id]) changed = true
            continue
          }
          const bars = barWidths.current[frame.id] ?? DEFAULT_BARS
          const box = {
            left: xEntry,
            width: Math.max(48, bars * spacing),
            entryY,
            tpY,
            slY
          }
          next[frame.id] = box
          const old = prev[frame.id]
          if (
            !old ||
            Math.abs(old.left - box.left) > 0.4 ||
            Math.abs(old.width - box.width) > 0.4 ||
            Math.abs(old.entryY - box.entryY) > 0.4 ||
            Math.abs(old.tpY - box.tpY) > 0.4 ||
            Math.abs(old.slY - box.slY) > 0.4
          ) {
            changed = true
          }
        }
        return changed ? next : prev
      })
    }
    const place = (): void => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        placeNow()
      })
    }

    placeNow()
    const scale = chart.timeScale()
    // Logical range alone covers pan/zoom — also listening to time-range doubles work every frame.
    scale.subscribeVisibleLogicalRangeChange(place)
    scale.subscribeSizeChange(place)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      scale.unsubscribeVisibleLogicalRangeChange(place)
      scale.unsubscribeSizeChange(place)
    }
  }, [chart, series, host, frameKey])

  if (frames.length === 0) return null

  function applyPrice(edge: DragEdge, price: number): void {
    const rounded = price.toFixed(2)
    const state = useAppStore.getState()
    if (state.activeTrade) {
      useAppStore.setState({
        activeTrade: {
          ...state.activeTrade,
          entry: edge === 'entry' ? price : state.activeTrade.entry,
          stopLoss: edge === 'stopLoss' ? price : state.activeTrade.stopLoss,
          takeProfit: edge === 'takeProfit' ? price : state.activeTrade.takeProfit
        }
      })
      return
    }
    if (!state.draft) return
    state.updateDraft({
      entry: edge === 'entry' ? rounded : state.draft.entry,
      stopLoss: edge === 'stopLoss' ? rounded : state.draft.stopLoss,
      takeProfit: edge === 'takeProfit' ? rounded : state.draft.takeProfit
    })
  }

  function startDrag(
    id: string,
    edge: DragEdge,
    event: React.PointerEvent<HTMLButtonElement>,
    resizeWidth = false
  ): void {
    event.preventDefault()
    event.stopPropagation()
    if (!series || !host) return
    const bounds = host.getBoundingClientRect()
    const startX = event.clientX
    const startBars = barWidths.current[id] ?? DEFAULT_BARS
    const spacing = chart?.timeScale().options().barSpacing ?? 10
    const move = (ev: PointerEvent) => {
      const price = series.coordinateToPrice(ev.clientY - bounds.top)
      if (price != null && price > 0) applyPrice(edge, price)
      if (resizeWidth) setFrameBars(id, startBars + (ev.clientX - startX) / spacing)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function startWidthDrag(id: string, event: React.PointerEvent<HTMLButtonElement>): void {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startBars = barWidths.current[id] ?? DEFAULT_BARS
    const spacing = chart?.timeScale().options().barSpacing ?? 10
    const move = (ev: PointerEvent) => setFrameBars(id, startBars + (ev.clientX - startX) / spacing)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function setFrameBars(id: string, bars: number): void {
    const next = Math.max(MIN_BARS, bars)
    barWidths.current[id] = next
    const spacing = chart?.timeScale().options().barSpacing ?? 10
    setBoxes((current) => {
      const box = current[id]
      if (!box) return current
      return { ...current, [id]: { ...box, width: Math.max(48, next * spacing) } }
    })
  }

  return (
    <div className="pos-tool">
      {frames.map((frame) => {
        const box = boxes[frame.id]
        if (!box) return null
        const showActions = draftId != null && frame.id === draftId
        const zoneTop = Math.min(box.tpY, box.slY, box.entryY)
        return (
          <PositionFrame
            key={frame.id}
            box={box}
            live={frame.live}
            isLiveActive={frame.live && activeFrameId === frame.id}
            floatingPnl={
              frame.live && activeFrameId === frame.id && floatingPnl != null ? floatingPnl : null
            }
            onDrag={(edge, event, resizeWidth) => startDrag(frame.id, edge, event, resizeWidth)}
            onResize={(event) => startWidthDrag(frame.id, event)}
            onMoveToBreakEven={() => moveToBreakEven(0)}
            onPartialClose={(pct) => partialClose(pct)}
            onCloseNow={closeActiveTradeNow}
            actions={
              showActions && draft ? (
                <div
                  className="pos-ticket"
                  data-side={draft.direction === 'BUY' ? 'long' : 'short'}
                  style={{
                    left: box.left + box.width / 2,
                    top: Math.max(8, zoneTop - 10)
                  }}
                >
                  <span className="pos-ticket-side">{draft.direction}</span>
                  <label className="pos-ticket-lots">
                    <span>Lots</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={costs.minLot}
                      step={costs.lotStep}
                      value={draft.lots}
                      aria-label="Lot size"
                      onChange={(event) => updateDraft({ lots: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          confirmTrade()
                        }
                      }}
                    />
                  </label>
                  <div className="pos-ticket-rr-row">
                    <span className="pos-ticket-rr-label">RR</span>
                    {[1.5, 2.0, 3.0].map((rrVal) => (
                      <button
                        key={rrVal}
                        type="button"
                        className="pos-ticket-rr-chip"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setDraftRiskReward(rrVal)
                        }}
                        title={`Set Take Profit to 1:${rrVal} RR`}
                      >
                        1:{rrVal}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="pos-ticket-enter"
                    onClick={confirmTrade}
                    title="Place order"
                  >
                    <Icon name="check" size={13} />
                    Place
                  </button>
                  <button
                    type="button"
                    className="pos-ticket-dismiss"
                    onClick={cancelDraft}
                    title="Dismiss setup"
                  >
                    <Icon name="close" size={12} />
                    Dismiss
                  </button>
                </div>
              ) : null
            }
          />
        )
      })}
    </div>
  )
}

function PositionFrame({
  box,
  live,
  isLiveActive,
  floatingPnl,
  onDrag,
  onResize,
  onMoveToBreakEven,
  onPartialClose,
  onCloseNow,
  actions
}: {
  box: Box
  live: boolean
  isLiveActive?: boolean
  floatingPnl?: number | null
  onDrag: (
    edge: DragEdge,
    event: React.PointerEvent<HTMLButtonElement>,
    resizeWidth?: boolean
  ) => void
  onResize: (event: React.PointerEvent<HTMLButtonElement>) => void
  onMoveToBreakEven?: () => void
  onPartialClose?: (pct: number) => void
  onCloseNow?: () => void
  actions?: React.ReactNode
}): React.JSX.Element {
  const profitTop = Math.min(box.tpY, box.entryY)
  const profitH = Math.abs(box.tpY - box.entryY)
  const lossTop = Math.min(box.slY, box.entryY)
  const lossH = Math.abs(box.slY - box.entryY)

  return (
    <>
      <div
        className="pos-zone profit"
        style={{ left: box.left, width: box.width, top: profitTop, height: Math.max(18, profitH) }}
      />
      <div
        className="pos-zone loss"
        style={{ left: box.left, width: box.width, top: lossTop, height: Math.max(18, lossH) }}
      />
      <div className="pos-entry" style={{ left: box.left, width: box.width, top: box.entryY }} />

      {live && floatingPnl != null ? (
        <div
          className={`pos-pill floating-pnl ${floatingPnl >= 0 ? 'target' : 'stop'}`}
          style={{ left: box.left + box.width + 10, top: box.entryY }}
        >
          {formatFloating(floatingPnl)}
        </div>
      ) : null}

      {isLiveActive ? (
        <div
          className="pos-quick-mgmt"
          style={{ left: box.left + box.width + 10, top: box.entryY + 28 }}
        >
          <button
            type="button"
            className="pos-mgmt-btn be"
            onClick={(e) => {
              e.stopPropagation()
              onMoveToBreakEven?.()
            }}
            title="Move Stop Loss to Break-Even (entry)"
          >
            BE
          </button>
          <button
            type="button"
            className="pos-mgmt-btn partial"
            onClick={(e) => {
              e.stopPropagation()
              onPartialClose?.(50)
            }}
            title="Close 50% at market"
          >
            50%
          </button>
          <button
            type="button"
            className="pos-mgmt-btn close"
            onClick={(e) => {
              e.stopPropagation()
              onCloseNow?.()
            }}
            title="Close position immediately at market"
          >
            ✕
          </button>
        </div>
      ) : null}

      {live ? (
        <>
          <Handle left={box.left} top={box.tpY} edge="takeProfit" onDrag={onDrag} />
          <Handle left={box.left + box.width} top={box.tpY} edge="takeProfit" resizeWidth onDrag={onDrag} />
          <Handle left={box.left} top={box.entryY} edge="entry" onDrag={onDrag} />
          <Handle left={box.left + box.width} top={box.entryY} edge="entry" resizeWidth onDrag={onDrag} />
          <Handle left={box.left} top={box.slY} edge="stopLoss" onDrag={onDrag} />
          <Handle left={box.left + box.width} top={box.slY} edge="stopLoss" resizeWidth onDrag={onDrag} />
          <button
            type="button"
            className="pos-width"
            style={{ left: box.left + box.width, top: profitTop, height: Math.max(18, profitH + lossH) }}
            aria-label="Resize position width"
            onPointerDown={onResize}
          />
        </>
      ) : null}
      {actions}
    </>
  )
}

function Handle({
  left,
  top,
  edge,
  resizeWidth = false,
  onDrag
}: {
  left: number
  top: number
  edge: DragEdge
  resizeWidth?: boolean
  onDrag: (
    edge: DragEdge,
    event: React.PointerEvent<HTMLButtonElement>,
    resizeWidth?: boolean
  ) => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={resizeWidth ? 'pos-handle pos-handle-se' : 'pos-handle'}
      style={{ left, top }}
      aria-label={resizeWidth ? `Drag ${edge} and width` : `Drag ${edge}`}
      onPointerDown={(event) => onDrag(edge, event, resizeWidth)}
    />
  )
}

export function resolvePositionLevels(input: {
  draft: ReturnType<typeof useAppStore.getState>['draft']
  active: ReturnType<typeof useAppStore.getState>['activeTrade']
}): PositionLevels | null {
  return listPositionFrames({ ...input, trades: [] }).find((frame) => frame.live) ?? null
}

export function listPositionFrames(input: {
  draft: ReturnType<typeof useAppStore.getState>['draft']
  active: ReturnType<typeof useAppStore.getState>['activeTrade']
  trades?: ReturnType<typeof useAppStore.getState>['trades']
}): PositionLevels[] {
  const frames: PositionLevels[] = []
  const seen = new Set<string>()

  for (const trade of input.trades ?? []) {
    if (trade.skipped || trade.entry <= 0) continue
    const id = `t:${trade.openedAt}`
    seen.add(id)
    frames.push({
      id,
      live: false,
      direction: trade.direction,
      entry: trade.entry,
      stopLoss: trade.stopLoss,
      takeProfit: trade.takeProfit,
      timestamp: trade.openedAt
    })
  }

  const live = resolveLiveLevels(input)
  if (live && !seen.has(live.id)) frames.push(live)
  return frames
}

function resolveLiveLevels(input: {
  draft: ReturnType<typeof useAppStore.getState>['draft']
  active: ReturnType<typeof useAppStore.getState>['activeTrade']
}): PositionLevels | null {
  if (input.active) {
    return {
      id: `t:${input.active.openedAt}`,
      live: true,
      direction: input.active.direction,
      entry: input.active.entry,
      stopLoss: input.active.stopLoss,
      takeProfit: input.active.takeProfit,
      timestamp: input.active.openedAt
    }
  }
  if (input.draft) {
    const entry = Number(input.draft.entry)
    const stopLoss = Number(input.draft.stopLoss)
    const takeProfit = Number(input.draft.takeProfit)
    if (![entry, stopLoss, takeProfit].every(Number.isFinite)) return null
    return {
      id: `t:${input.draft.timestamp}`,
      live: true,
      direction: input.draft.direction,
      entry,
      stopLoss,
      takeProfit,
      timestamp: input.draft.timestamp
    }
  }
  return null
}
