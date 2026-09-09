# Trade ticket SL/TP control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give manual trades the same working SL/TP control as strategy setups, by fixing the shared `draft` mechanism both already use, and add a docked (non-blocking) ticket with typed Entry/SL/TP/Risk% fields for both.

**Architecture:** `draft` becomes the single source of truth for "there's a trade decision pending" (replacing the redundant `tradeModalOpen` flag), created eagerly for both manual clicks and strategy signals (fixing a bug where strategy's lazy draft-creation silently discarded dragged values), and carrying a real candle `timestamp` (fixing the actual root cause: manual trades' position box currently anchors to `Date.now()`, which falls outside the historical replay's chart domain, so `timeToCoordinate()` returns null and the box — including its drag handles — never renders at all). A new docked `TradeTicket` component (replacing two already-dead, never-mounted modal components) renders alongside the existing chart overlay whenever `draft` exists.

**Tech Stack:** React 19, Zustand, TypeScript, lightweight-charts (existing stack, no new dependencies).

---

## Root cause (verified by reading, not guessing)

- `src/renderer/src/store/useAppStore.ts:938-955` (`startManualTrade`) builds a `draft` but never records which candle it belongs to.
- `src/renderer/src/components/ChartTradeOverlay.tsx:409-424` (old `resolveLiveLevels`, the `tradeOpen && draft` branch) computed `const timestamp = input.setup?.timestamp ?? input.lastTs ?? Date.now()`. For a manual draft, `setup` and `lastTs` are both `undefined`, so it falls back to `Date.now()` — a present-day wall-clock timestamp that doesn't exist anywhere in a historical replay's candle series.
- `src/renderer/src/components/ChartTradeOverlay.tsx:75` calls `chart.timeScale().timeToCoordinate((frame.timestamp / 1000) as UTCTimestamp)`, which returns `null` for a time with no corresponding bar. The `place()` effect then skips that frame (`ChartTradeOverlay.tsx:79-82`), so `boxes[frame.id]` is never set, and `PositionFrame` (which contains the drag handles) never renders (`ChartTradeOverlay.tsx:216-217`, `if (!box) return null`).
- Meanwhile a strategy setup's `pendingSetup.timestamp` is a real historical candle timestamp, so its box renders and drags correctly — this is the asymmetry the user is seeing.
- Separately: `TradeEntryModal.tsx` and `SetupModal.tsx` (the only components with real number inputs) are never imported anywhere (`grep -rn "TradeEntryModal\|SetupModal" src` outside their own files returns nothing) — dead code. Both would also render as a full-viewport blocking backdrop if mounted, which would prevent dragging while open.

---

### Task 1: Unify draft creation and drop `tradeModalOpen` in the store

**Files:**
- Modify: `src/renderer/src/store/useAppStore.ts`

- [ ] **Step 1: Add `timestamp` to `DraftTrade` and remove `tradeModalOpen` from state**

Change (around line 42-48):

```ts
export interface DraftTrade {
  direction: Direction
  entry: string
  stopLoss: string
  takeProfit: string
  riskPercent: string
  timestamp: number
}
```

Remove the `tradeModalOpen: boolean` line from the `AppState` interface (currently line 70) and from the initial state object (currently line 245, `tradeModalOpen: false,`).

- [ ] **Step 2: Add a shared `draftFromSignal` helper next to `defaultStopTarget`**

Insert right after the existing `defaultStopTarget` function (currently ends at line 177):

```ts
function draftFromSignal(
  signal: StrategySignal,
  costs: CostConfig,
  settings: StrategySettings,
  riskPercent: number
): DraftTrade {
  const direction: Direction = signal.type === 'LONG' ? 'BUY' : 'SELL'
  const entry = signal.price
  const { stopLoss, takeProfit } = defaultStopTarget(direction, entry, costs, settings)
  return {
    direction,
    entry: entry.toFixed(2),
    stopLoss: stopLoss.toFixed(2),
    takeProfit: takeProfit.toFixed(2),
    riskPercent: String(riskPercent),
    timestamp: signal.timestamp
  }
}
```

- [ ] **Step 3: Create `draft` at the same moment a strategy signal pauses replay**

In `step()`, the block that currently ends with (around line 887-896):

```ts
    set({
      replayIndex: index,
      activeTrade: active,
      trades,
      account,
      pendingSetup: pending,
      isPlaying: pending ? false : get().isPlaying,
      status: pending ? 'Setup detected. Replay paused.' : get().status
    })
    if (pending) clearTimer()
  },
```

becomes:

```ts
    set({
      replayIndex: index,
      activeTrade: active,
      trades,
      account,
      pendingSetup: pending,
      draft: pending
        ? draftFromSignal(pending, next.costs, next.settings, account.riskPerTrade)
        : null,
      isPlaying: pending ? false : get().isPlaying,
      status: pending ? 'Setup detected. Replay paused.' : get().status
    })
    if (pending) clearTimer()
  },
```

(`step()` already returns early at its top, `if (s.pendingSetup || s.tradeModalOpen) return` — update that guard in Step 6 below — so `draft` is guaranteed `null` by the time this runs unless this exact call is introducing a new pending signal.)

- [ ] **Step 4: Fix `startManualTrade` to record the candle timestamp and drop `tradeModalOpen`**

Replace (currently lines 938-955):

```ts
  startManualTrade: (direction) => {
    const s = get()
    if (s.activeTrade || s.pendingSetup || s.tradeModalOpen) return
    const entry = s.currentCandle()?.close
    if (entry == null) return
    if (s.isPlaying) get().pause()
    const { stopLoss, takeProfit } = defaultStopTarget(direction, entry, s.costs, s.settings)
    set({
      tradeModalOpen: true,
      draft: {
        direction,
        entry: entry.toFixed(2),
        stopLoss: stopLoss.toFixed(2),
        takeProfit: takeProfit.toFixed(2),
        riskPercent: String(s.account.riskPerTrade)
      }
    })
  },
```

with:

```ts
  startManualTrade: (direction) => {
    const s = get()
    if (s.activeTrade || s.pendingSetup || s.draft) return
    const candle = s.currentCandle()
    if (!candle) return
    if (s.isPlaying) get().pause()
    const { stopLoss, takeProfit } = defaultStopTarget(direction, candle.close, s.costs, s.settings)
    set({
      draft: {
        direction,
        entry: candle.close.toFixed(2),
        stopLoss: stopLoss.toFixed(2),
        takeProfit: takeProfit.toFixed(2),
        riskPercent: String(s.account.riskPerTrade),
        timestamp: candle.timestamp
      }
    })
  },
```

- [ ] **Step 5: Simplify `takeSetup`, fix `skipSetup`, simplify `confirmTrade`**

Replace `takeSetup` (currently lines 915-936):

```ts
  takeSetup: () => {
    get().confirmTrade()
  },
```

In `skipSetup` (currently lines 957-980), add `draft: null` to the final `set()`:

```ts
    set({
      skipped: [...get().skipped, skipped],
      pendingSetup: null,
      draft: null,
      status: 'Setup skipped.'
    })
```

In `confirmTrade` (currently lines 988-1029), remove `tradeModalOpen: false` from its `set()` call and use `draft.timestamp` for `openedAt` instead of the `pendingSetup?.timestamp ?? get().currentCandle()?.timestamp ?? Date.now()` fallback chain:

```ts
    const trade: Trade = {
      id: newId(),
      sessionId,
      symbol,
      direction: draft.direction,
      entry,
      stopLoss,
      takeProfit,
      positionSize: sized.positionSize,
      riskAmount: sized.riskAmount,
      openedAt: draft.timestamp,
      strategy: pendingSetup?.strategy,
      reason: pendingSetup?.reason
    }
    set({
      activeTrade: trade,
      pendingSetup: null,
      draft: null,
      status: `${draft.direction} opened · RR ${riskReward(entry, stopLoss, takeProfit).toFixed(2)}`
    })
```

- [ ] **Step 6: Replace every remaining `tradeModalOpen` reference with `draft`**

Run:
```bash
grep -n "tradeModalOpen" src/renderer/src/store/useAppStore.ts
```
Expected remaining hits (fix each):
- Two `set({...pendingSetup: null, tradeModalOpen: false, ...})` blocks (workspace-entry and `leaveWorkspace`, and the `startReplay` reset) — remove the `tradeModalOpen: false` line and add `draft: null` instead, so no stale draft survives a workspace switch or replay restart. Do the same for the dataset-load handler's reset block (`pendingSetup: null,` around line 646) even though it currently doesn't mention `tradeModalOpen` — add `draft: null` there too, for the same reason.
- `play()`'s guard: `if (s.pendingSetup || s.tradeModalOpen || s.displayCandles.length === 0) return` → `if (s.pendingSetup || s.draft || s.displayCandles.length === 0) return`
- The replay loop's guard: `if (!current.isPlaying || current.pendingSetup || current.tradeModalOpen) {` → `if (!current.isPlaying || current.pendingSetup || current.draft) {`
- `step()`'s top guard: `if (s.pendingSetup || s.tradeModalOpen) return` → `if (s.pendingSetup || s.draft) return`

After this step, `grep -n "tradeModalOpen" src/renderer/src/store/useAppStore.ts` must return nothing.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (This will surface every other file still referencing `tradeModalOpen` — fix those as part of Tasks 2-3, not here.)

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/store/useAppStore.ts
git commit -m "$(cat <<'EOF'
Unify manual and strategy trade draft creation

Both now create the draft eagerly (fixing a bug where taking a
strategy setup after dragging silently reset SL/TP to the defaults)
and record the originating candle's timestamp instead of leaving
manual trades to fall back to Date.now(), which put their position
box outside the replay chart's time domain entirely.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Simplify `ChartTradeOverlay.tsx` around the unified `draft`

**Files:**
- Modify: `src/renderer/src/components/ChartTradeOverlay.tsx`

- [ ] **Step 1: Simplify `resolveLiveLevels`, `listPositionFrames`, `resolvePositionLevels`**

Replace the three functions at the bottom of the file (currently lines 344-445) with:

```ts
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
```

This drops the `setup`, `tradeOpen`, `settings`, `costs`, and `lastTs` parameters entirely — `draft` alone (with its new `timestamp` field) now carries everything needed.

- [ ] **Step 2: Simplify the main component's state reads and `frames` computation**

Replace (currently lines 35-60):

```ts
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
```

with:

```ts
export function ChartTradeOverlay({ chart, series, host }: Props): React.JSX.Element | null {
  const draft = useAppStore((s) => s.draft)
  const active = useAppStore((s) => s.activeTrade)
  const trades = useAppStore((s) => s.trades)
  const isPlaying = useAppStore((s) => s.isPlaying)
  const [boxes, setBoxes] = useState<Record<string, Box>>({})
  const barWidths = useRef<Record<string, number>>({})
  const frames = listPositionFrames({ draft, active, trades })
```

- [ ] **Step 3: Simplify `applyPrice`, drop the take/skip helpers, drop the `Icon` import**

Remove `import { Icon } from './Icon'` (currently line 3).

Replace `applyPrice` (currently lines 137-159):

```ts
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
```

Remove the `takeNow()` function entirely (currently lines 132-135).

- [ ] **Step 4: Remove the floating Take/Skip UI from the rendered frames**

Replace the component's return block (currently lines 213-236):

```ts
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
            onDrag={(edge, event, resizeWidth) => startDrag(frame.id, edge, event, resizeWidth)}
            onResize={(event) => startWidthDrag(frame.id, event)}
          />
        )
      })}
    </div>
  )
}
```

Replace `PositionFrame` (currently lines 238-314) — drop `showActions`, `onTake`, `onSkip`:

```ts
function PositionFrame({
  box,
  live,
  onDrag,
  onResize
}: {
  box: Box
  live: boolean
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
    </>
  )
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: errors only in `ChartPanel.tsx` (fixed in Task 3) and the two dead modal files (deleted in Task 4) — no errors in `ChartTradeOverlay.tsx` itself.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/ChartTradeOverlay.tsx
git commit -m "$(cat <<'EOF'
Simplify chart overlay position resolution around unified draft

Drops the setup/tradeOpen/settings/costs/lastTs parameters now that
draft alone (with its timestamp field) carries everything needed.
Removes the floating Take/Skip chart buttons, which are replaced by
the docked TradeTicket's Confirm/Cancel.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Update `ChartPanel.tsx` and mount `TradeTicket`

**Files:**
- Modify: `src/renderer/src/components/ChartPanel.tsx`

- [ ] **Step 1: Drop `pendingSetup`/`tradeModalOpen`/`costs` selectors, simplify the two `resolvePositionLevels` calls and `canStartManualTrade`**

Replace (currently lines 104-131):

```ts
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
```

- [ ] **Step 2: Update the price-line drawing effect**

Replace (currently lines 323-336):

```ts
  useEffect(() => {
    const series = candleRef.current
    if (!series) return
    const skin = chartSkin()
    for (const line of linesRef.current) series.removePriceLine(line)
    linesRef.current = []
    const tradeLevels = resolvePositionLevels({ draft, active: activeTrade })
```

And update that effect's dependency array (currently lines 394-405):

```ts
  }, [activeTrade, selectedId, trades, levels, draft, settings, theme])
```

(drops `pendingSetup`, `tradeModalOpen`, `costs` — none of which the effect body still references after this change).

- [ ] **Step 3: Mount `<TradeTicket />` alongside the chart**

Add the import (near the other component imports, currently around line 23):

```ts
import { TradeTicket } from './TradeTicket'
```

In the returned JSX (currently lines 428-436), add it as a sibling of `.chart`, inside `.chart-shell`:

```tsx
      <div className="chart" ref={hostRef}>
        {hasTape ? null : (
          <div className="chart-empty">
            <h2>Pick a pair</h2>
            <p>Choose a symbol in the top bar. The chart loads from the local database.</p>
          </div>
        )}
        <ChartTradeOverlay chart={chartApi} series={seriesApi} host={hostRef.current} />
      </div>
      <TradeTicket />
      <ReplayControls />
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: errors only in the two dead modal files, fixed in Task 4.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ChartPanel.tsx
git commit -m "$(cat <<'EOF'
Wire ChartPanel to the simplified draft-only overlay API

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Add `TradeTicket`, delete the dead modal components

**Files:**
- Create: `src/renderer/src/components/TradeTicket.tsx`
- Delete: `src/renderer/src/components/TradeEntryModal.tsx`
- Delete: `src/renderer/src/components/SetupModal.tsx`

- [ ] **Step 1: Create `TradeTicket.tsx`**

```tsx
import { calculatePositionSize, riskReward } from '@core/trade/sizing'
import { useAppStore } from '../store/useAppStore'

export function TradeTicket(): React.JSX.Element | null {
  const draft = useAppStore((s) => s.draft)
  const pendingSetup = useAppStore((s) => s.pendingSetup)
  const activeTrade = useAppStore((s) => s.activeTrade)
  const updateDraft = useAppStore((s) => s.updateDraft)
  const confirmTrade = useAppStore((s) => s.confirmTrade)
  const skipSetup = useAppStore((s) => s.skipSetup)
  const account = useAppStore((s) => s.account)
  const costs = useAppStore((s) => s.costs)

  if (!draft || activeTrade) return null

  const entry = Number(draft.entry)
  const sl = Number(draft.stopLoss)
  const tp = Number(draft.takeProfit)
  const risk = Number(draft.riskPercent)
  const sized = calculatePositionSize({
    balance: account.balance,
    riskPercent: Number.isFinite(risk) ? risk : account.riskPerTrade,
    entry: Number.isFinite(entry) ? entry : 0,
    stopLoss: Number.isFinite(sl) ? sl : 0,
    costs
  })
  const rr = riskReward(entry, sl, tp)

  function cancel(): void {
    if (pendingSetup) skipSetup()
    else useAppStore.setState({ draft: null })
  }

  return (
    <div className="trade-ticket" role="dialog" aria-labelledby="ticket-title">
      <header className="trade-ticket-header">
        <h4 id="ticket-title">{pendingSetup ? pendingSetup.strategy : 'Manual trade'}</h4>
        <div className="row">
          <button
            type="button"
            className={draft.direction === 'BUY' ? 'primary' : 'ghost'}
            onClick={() => updateDraft({ direction: 'BUY' })}
          >
            Buy
          </button>
          <button
            type="button"
            className={draft.direction === 'SELL' ? 'primary' : 'ghost'}
            onClick={() => updateDraft({ direction: 'SELL' })}
          >
            Sell
          </button>
        </div>
      </header>
      <label className="field">
        Entry
        <input value={draft.entry} onChange={(e) => updateDraft({ entry: e.target.value })} />
      </label>
      <label className="field">
        Stop loss
        <input value={draft.stopLoss} onChange={(e) => updateDraft({ stopLoss: e.target.value })} />
      </label>
      <label className="field">
        Take profit
        <input
          value={draft.takeProfit}
          onChange={(e) => updateDraft({ takeProfit: e.target.value })}
        />
      </label>
      <label className="field">
        Risk %
        <input
          value={draft.riskPercent}
          onChange={(e) => updateDraft({ riskPercent: e.target.value })}
        />
      </label>
      <dl className="trade-ticket-stats">
        <dt>Position</dt>
        <dd>{sized.positionSize.toFixed(2)} lot</dd>
        <dt>Risk USD</dt>
        <dd>${sized.riskAmount.toFixed(2)}</dd>
        <dt>Risk/Reward</dt>
        <dd>1 : {Number.isFinite(rr) ? rr.toFixed(2) : '—'}</dd>
      </dl>
      <div className="ticket-actions">
        <button type="button" className="primary" onClick={confirmTrade}>
          Confirm
        </button>
        <button type="button" className="ghost" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Delete the dead modal components**

```bash
git rm src/renderer/src/components/TradeEntryModal.tsx src/renderer/src/components/SetupModal.tsx
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors anywhere in the project.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/TradeTicket.tsx
git commit -m "$(cat <<'EOF'
Add docked TradeTicket, remove dead modal components

TradeEntryModal and SetupModal were never mounted anywhere in the
app and would have blocked chart dragging with a full-viewport
backdrop if they had been. TradeTicket replaces both: a small card
docked to a chart corner that shows whenever a draft exists (manual
or strategy-originated), with typed Entry/SL/TP/Risk% fields that
stay in sync with the chart's drag handles.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Dock the ticket with CSS

**Files:**
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Add `.trade-ticket` styles**

Add near the existing `.chart-trade-actions` rule (currently around line 299-306) so the two related "floating over the chart" rules stay together:

```css
.trade-ticket {
  position: absolute;
  top: 54px;
  right: 10px;
  z-index: 10;
  width: 220px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: linear-gradient(180deg, var(--bar-from) 0%, var(--bar-to) 100%);
  border: 1px solid var(--gold-dim);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  padding: 14px 16px 12px;
}

.trade-ticket-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.trade-ticket-header h4 {
  margin: 0;
  font-size: 13px;
}

.trade-ticket-header .row {
  display: flex;
  gap: 6px;
}

.trade-ticket-header .row button {
  padding: 4px 10px;
  min-height: 0;
}

.trade-ticket .field input {
  width: 100%;
}

.trade-ticket-stats {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  margin: 0;
  font-size: 12px;
}

.trade-ticket-stats dt {
  color: var(--muted);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/styles/global.css
git commit -m "$(cat <<'EOF'
Style the docked trade ticket

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Regression check and manual verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 2: Run the existing test suite**

Run: `npm run test`
Expected: all existing tests still pass (none of them touch the renderer store or components directly, per `vitest.config.ts`'s `node` environment and `tests/**/*.test.ts` scope — this is a regression check that core logic in `@core`/`@shared` wasn't accidentally touched, not new coverage for this change).

- [ ] **Step 3: Manual verification in the running app**

Use the `run` skill to launch the app (`npm run dev`) and walk through:
1. Load a dataset, start replay, click Buy or Sell.
   Expected: the docked ticket appears in the chart's top-right corner with "Manual trade" as its header, and a draggable box with SL/TP/entry handles appears on the chart at the current candle.
2. Type a new number into the ticket's Stop loss field.
   Expected: the chart's SL handle and dashed price line move to match.
3. Drag the Take profit handle on the chart.
   Expected: the ticket's Take profit field updates to match the dragged price.
4. Click Confirm.
   Expected: the trade opens at the last-edited values (not the original defaults), `openedAt` matches the candle timestamp shown when the ticket was opened, and the ticket disappears.
5. Turn on "Pause on setup" in the Strategy panel, start a replay, let a setup fire.
   Expected: same ticket UI appears (header shows the strategy name instead of "Manual trade"), same drag + type parity.
6. Click Cancel on a strategy setup.
   Expected: it's recorded in the skipped list (unchanged prior behavior — check `TradeHistory`/skipped count if visible in the UI).
7. Press `t` while a strategy setup is pending.
   Expected: confirms immediately using whatever values are currently in the ticket (typed or dragged), not the original defaults — this is the specific bug fix from Task 1, so it's worth confirming explicitly by dragging first, then pressing `t`.

Report back any step that doesn't match, so it can be fixed before considering this done.
