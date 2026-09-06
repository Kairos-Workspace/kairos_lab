import { useEffect, useRef, useState } from 'react'
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'

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

export function ChartTradeOverlay({ chart, series, host }: Props): React.JSX.Element | null {
  const setup = useAppStore((s) => s.pendingSetup)
  const draft = useAppStore((s) => s.draft)
  const tradeOpen = useAppStore((s) => s.tradeModalOpen)
  const active = useAppStore((s) => s.activeTrade)
  const trades = useAppStore((s) => s.trades)
  const takeSetup = useAppStore((s) => s.takeSetup)
  const skipSetup = useAppStore((s) => s.skipSetup)
  const settings = useAppStore((s) => s.settings)
  const costs = useAppStore((s) => s.costs)
  const isPlaying = useAppStore((s) => s.isPlaying)
  const [boxes, setBoxes] = useState<Record<string, Box>>({})
  const barWidths = useRef<Record<string, number>>({})
  const frames = listPositionFrames({
    setup,
    draft,
    tradeOpen,
    active,
    trades,
    settings,
    costs,
    lastTs: setup?.timestamp ?? active?.openedAt
  })
  const framesRef = useRef(frames)
  framesRef.current = frames
  const frameKey = frames.map((f) => `${f.id}:${f.live}:${f.entry}:${f.stopLoss}:${f.takeProfit}`).join('|')

  useEffect(() => {
    if (!chart || !series || !host || frames.length === 0) {
      setBoxes({})
      return
    }

    const place = () => {
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

    let raf = 0
    let alive = true
    const loop = () => {
      if (!alive) return
      place()
      raf = requestAnimationFrame(loop)
    }

    const scale = chart.timeScale()
    scale.subscribeVisibleLogicalRangeChange(place)
    scale.subscribeVisibleTimeRangeChange(place)
    scale.subscribeSizeChange(place)
    if (!isPlaying) raf = requestAnimationFrame(loop)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      scale.unsubscribeVisibleLogicalRangeChange(place)
      scale.unsubscribeVisibleTimeRangeChange(place)
      scale.unsubscribeSizeChange(place)
    }
  }, [chart, series, host, frameKey, isPlaying])

  if (frames.length === 0) return null

  function takeNow(): void {
    if (setup) takeSetup()
    queueMicrotask(() => useAppStore.getState().confirmTrade())
  }

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
    if (!state.draft && state.pendingSetup) state.takeSetup()
    const next = useAppStore.getState().draft
    if (!next) return
    state.updateDraft({
      entry: edge === 'entry' ? rounded : next.entry,
      stopLoss: edge === 'stopLoss' ? rounded : next.stopLoss,
      takeProfit: edge === 'takeProfit' ? rounded : next.takeProfit
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
        return (
          <PositionFrame
            key={frame.id}
            box={box}
            live={frame.live}
            showActions={frame.live && Boolean((setup || tradeOpen) && !active)}
            onTake={takeNow}
            onSkip={() => {
              if (setup) skipSetup()
              else useAppStore.setState({ tradeModalOpen: false, draft: null })
            }}
            onDrag={(edge, event, resizeWidth) => startDrag(frame.id, edge, event, resizeWidth)}
            onResize={(event) => startWidthDrag(frame.id, event)}
          />
        )
      })}
    </div>
  )
}

function PositionFrame({
  box,
  live,
  showActions,
  onTake,
  onSkip,
  onDrag,
  onResize
}: {
  box: Box
  live: boolean
  showActions: boolean
  onTake: () => void
  onSkip: () => void
  onDrag: (
    edge: DragEdge,
    event: React.PointerEvent<HTMLButtonElement>,
    resizeWidth?: boolean
  ) => void
  onResize: (event: React.PointerEvent<HTMLButtonElement>) => void
}): React.JSX.Element {
  const profitTop = Math.min(box.tpY, box.entryY)
  const profitH = Math.abs(box.tpY - box.entryY)
  const lossTop = Math.min(box.slY, box.entryY)
  const lossH = Math.abs(box.slY - box.entryY)
  const frameTop = Math.min(profitTop, lossTop)

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

      {showActions ? (
        <div
          className="pos-card pos-card-actions"
          style={{ left: box.left + box.width / 2, top: frameTop }}
        >
          <div className="tv-pop-actions">
            <button className="primary icon-label" onClick={onTake} title="Take trade">
              <Icon name="check" />
              Take
            </button>
            <button className="ghost icon-label" onClick={onSkip} title="Skip setup">
              <Icon name="skip" />
              Skip
            </button>
          </div>
        </div>
      ) : null}
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
  setup: ReturnType<typeof useAppStore.getState>['pendingSetup']
  draft: ReturnType<typeof useAppStore.getState>['draft']
  tradeOpen: boolean
  active: ReturnType<typeof useAppStore.getState>['activeTrade']
  settings: ReturnType<typeof useAppStore.getState>['settings']
  costs: ReturnType<typeof useAppStore.getState>['costs']
  lastTs?: number
}): PositionLevels | null {
  return listPositionFrames({ ...input, trades: [] }).find((frame) => frame.live) ?? null
}

export function listPositionFrames(input: {
  setup: ReturnType<typeof useAppStore.getState>['pendingSetup']
  draft: ReturnType<typeof useAppStore.getState>['draft']
  tradeOpen: boolean
  active: ReturnType<typeof useAppStore.getState>['activeTrade']
  trades?: ReturnType<typeof useAppStore.getState>['trades']
  settings: ReturnType<typeof useAppStore.getState>['settings']
  costs: ReturnType<typeof useAppStore.getState>['costs']
  lastTs?: number
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
  setup: ReturnType<typeof useAppStore.getState>['pendingSetup']
  draft: ReturnType<typeof useAppStore.getState>['draft']
  tradeOpen: boolean
  active: ReturnType<typeof useAppStore.getState>['activeTrade']
  settings: ReturnType<typeof useAppStore.getState>['settings']
  costs: ReturnType<typeof useAppStore.getState>['costs']
  lastTs?: number
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
  if (input.tradeOpen && input.draft) {
    const entry = Number(input.draft.entry)
    const stopLoss = Number(input.draft.stopLoss)
    const takeProfit = Number(input.draft.takeProfit)
    if (![entry, stopLoss, takeProfit].every(Number.isFinite)) return null
    const timestamp = input.setup?.timestamp ?? input.lastTs ?? Date.now()
    return {
      id: `t:${timestamp}`,
      live: true,
      direction: input.draft.direction,
      entry,
      stopLoss,
      takeProfit,
      timestamp
    }
  }
  if (input.setup) {
    const direction = input.setup.type === 'LONG' ? 'BUY' : 'SELL'
    const entry = input.setup.price
    const slDist = Math.max(input.costs.tickSize * 50, entry * 0.0015)
    const stopLoss = direction === 'BUY' ? entry - slDist : entry + slDist
    const takeProfit =
      direction === 'BUY'
        ? entry + slDist * input.settings.defaultRr
        : entry - slDist * input.settings.defaultRr
    return {
      id: `t:${input.setup.timestamp}`,
      live: true,
      direction,
      entry,
      stopLoss,
      takeProfit,
      timestamp: input.setup.timestamp
    }
  }
  return null
}
