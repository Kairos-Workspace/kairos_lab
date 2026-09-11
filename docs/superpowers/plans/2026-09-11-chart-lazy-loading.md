# Chart Lazy Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop loading a dataset's entire candle history into renderer memory up front — view mode loads a recent window and fetches more as the user scrolls back; replay sessions load exactly the period picked in the existing "Choose period" popup.

**Architecture:** A new indexed "recent candles page" query (main process, SQLite + CSV backends) backs a new IPC channel/preload method. The renderer store fetches an initial window instead of everything, pages in older candles on demand, and shifts (rather than resets) the chart's visible range so pagination doesn't visually jump. Replay's range picker gets its own bounded fetch, reusing the range-query IPC that already exists.

**Tech Stack:** Electron + better-sqlite3 (main), Zustand store + `lightweight-charts` (renderer), Vitest.

**Design doc:** `docs/superpowers/specs/2026-09-11-chart-lazy-loading-design.md`

**Deviation from the design doc (found while planning, does not change behavior described there):** the doc proposed a new `DATASETS_RANGE` IPC call so `ReplayRangeModal` can bound its date pickers by the dataset's true start/end. `DatasetInfo` (already loaded into the store via `datasets.list()`) already carries `startTs`/`endTs` for the *whole* dataset regardless of what's currently paged into view — for both SQLite and CSV-backed datasets. Task 6 reads those fields directly from the already-loaded `datasets` array instead of adding a new IPC round trip. Same outcome, one less endpoint.

---

### Task 1: Main-process "recent candles page" query + IPC + preload

**Files:**
- Modify: `src/main/database/repositories.ts` (add `getRecentCandles`, after `getCandles`)
- Modify: `src/shared/ipc.ts` (add `DATASETS_CANDLES_PAGE` channel)
- Modify: `src/main/ipc.ts` (add handler, branching on `isCsvDataset` like `DATASETS_CANDLES` does)
- Modify: `src/preload/index.ts` (add `datasets.candlesPage`)

No test file for this task — this codebase doesn't unit-test the SQLite/IPC/preload glue layer (`getCandles`, `DATASETS_CANDLES`, `datasets.candles` have no dedicated tests either); `npm run typecheck` is this task's verification.

- [ ] **Step 1: Add `getRecentCandles` to the repository**

In `src/main/database/repositories.ts`, immediately after the closing brace of `getCandles` (the function ending right before `export function getGaps`), add:

```ts
export function getRecentCandles(datasetId: number, limit: number, beforeTs?: number): Candle[] {
  const rows =
    beforeTs === undefined
      ? getDb()
          .prepare(
            `SELECT timestamp, open, high, low, close, volume
             FROM candles WHERE dataset_id = ?
             ORDER BY timestamp DESC LIMIT ?`
          )
          .all(datasetId, limit)
      : getDb()
          .prepare(
            `SELECT timestamp, open, high, low, close, volume
             FROM candles WHERE dataset_id = ? AND timestamp < ?
             ORDER BY timestamp DESC LIMIT ?`
          )
          .all(datasetId, beforeTs, limit)
  return (rows as Candle[]).reverse()
}
```

(`Candle` is already imported at the top of this file.)

- [ ] **Step 2: Add the IPC channel constant**

In `src/shared/ipc.ts`, add a line right after `DATASETS_CANDLES: 'datasets:candles',`:

```ts
  DATASETS_CANDLES_PAGE: 'datasets:candles-page',
```

- [ ] **Step 3: Register the main-process handler**

In `src/main/ipc.ts`:

1. Replace the existing `import type { ... } from '@shared/types'` block:

```ts
import type {
  BacktestSession,
  DeskPrefs,
  Drawing,
  SavedStrategy,
  Timeframe,
  Trade
} from '@shared/types'
```

with:

```ts
import type {
  BacktestSession,
  Candle,
  DeskPrefs,
  Drawing,
  SavedStrategy,
  Timeframe,
  Trade
} from '@shared/types'
```

2. Replace the existing `import { ... } from './database/repositories'` block:

```ts
import {
  clearDrawings,
  deleteDataset,
  deleteDrawing,
  deleteSession,
  deleteStrategy,
  getCandles,
  getGaps,
  insertDataset,
  listDatasets,
  listDrawings,
  listStrategies,
  loadDeskPrefs,
  loadSession,
  replaceTape,
  saveDeskPrefs,
  saveDrawing,
  saveSession,
  saveStrategy
} from './database/repositories'
```

with:

```ts
import {
  clearDrawings,
  deleteDataset,
  deleteDrawing,
  deleteSession,
  deleteStrategy,
  getCandles,
  getGaps,
  getRecentCandles,
  insertDataset,
  listDatasets,
  listDrawings,
  listStrategies,
  loadDeskPrefs,
  loadSession,
  replaceTape,
  saveDeskPrefs,
  saveDrawing,
  saveSession,
  saveStrategy
} from './database/repositories'
```

3. Immediately after the existing `handle(IPC.DATASETS_CANDLES, ...)` block (ends with the closing `)` before `handle(IPC.DATASETS_GAPS, ...)`), add:

```ts
  function csvCandlesPage(datasetId: number, limit: number, beforeTs?: number): Candle[] {
    const all = csvCandles(datasetId)
    const upToIndex = beforeTs === undefined ? all.length : all.findIndex((c) => c.timestamp >= beforeTs)
    const end = upToIndex === -1 ? all.length : upToIndex
    return all.slice(Math.max(0, end - limit), end)
  }

  handle(
    IPC.DATASETS_CANDLES_PAGE,
    (_e, datasetId: number, limit: number, beforeTs?: number) =>
      toCandleBuffer(
        isCsvDataset(datasetId)
          ? csvCandlesPage(datasetId, limit, beforeTs)
          : getRecentCandles(datasetId, limit, beforeTs)
      )
  )
```

- [ ] **Step 4: Add the preload method**

In `src/preload/index.ts`, immediately after the existing `candles: (datasetId, fromTs?, toTs?) => ...` entry inside the `datasets` object, add:

```ts
    candlesPage: (datasetId: number, limit: number, beforeTs?: number) =>
      ipcRenderer.invoke(IPC.DATASETS_CANDLES_PAGE, datasetId, limit, beforeTs) as Promise<CandleBuffer>,
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors (exits 0, only prints the `tsc -b` invocation).

- [ ] **Step 6: Commit**

```bash
git add src/main/database/repositories.ts src/shared/ipc.ts src/main/ipc.ts src/preload/index.ts
git commit -m "$(cat <<'EOF'
Add a paged recent-candles query for chart lazy loading

New datasets:candles-page IPC channel returns the latest N candles
(or the N immediately before a cutoff timestamp), for both SQLite
and CSV-backed datasets. Nothing calls it yet.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Pure pagination helpers (`@core/candles/pagination`)

**Files:**
- Create: `src/core/candles/pagination.ts`
- Test: `tests/pagination.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/pagination.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { shouldLoadOlder, shiftedVisibleRange } from '@core/candles/pagination'

describe('shouldLoadOlder', () => {
  it('is false when there is no visible range yet', () => {
    expect(shouldLoadOlder(null, 200)).toBe(false)
  })

  it('is false when the visible range is well within the loaded data', () => {
    expect(shouldLoadOlder({ from: 500, to: 700 }, 200)).toBe(false)
  })

  it('is true once the visible range gets within the threshold of the start', () => {
    expect(shouldLoadOlder({ from: 150, to: 350 }, 200)).toBe(true)
  })

  it('treats the threshold itself as not yet close enough', () => {
    expect(shouldLoadOlder({ from: 200, to: 400 }, 200)).toBe(false)
  })
})

describe('shiftedVisibleRange', () => {
  it('shifts both edges by the added count', () => {
    expect(shiftedVisibleRange({ from: 100, to: 300 }, 40)).toEqual({ from: 140, to: 340 })
  })

  it('is a no-op when nothing was added', () => {
    expect(shiftedVisibleRange({ from: 100, to: 300 }, 0)).toEqual({ from: 100, to: 300 })
  })
})
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx vitest run tests/pagination.test.ts`
Expected: FAIL — `Cannot find module '@core/candles/pagination'` (or similar resolution error), since the module doesn't exist yet.

- [ ] **Step 3: Implement the module**

Create `src/core/candles/pagination.ts`:

```ts
export interface LogicalRange {
  from: number
  to: number
}

/**
 * True once the visible range's left edge has scrolled within `threshold`
 * bars of the start of what's currently loaded — the signal to fetch an
 * older page before the user actually hits the wall.
 */
export function shouldLoadOlder(range: LogicalRange | null, threshold: number): boolean {
  if (!range) return false
  return range.from < threshold
}

/**
 * Prepending `addedCount` older bars shifts every existing bar's logical
 * index forward by that amount — shift the visible range to match so the
 * chart doesn't visually jump when older history loads in.
 */
export function shiftedVisibleRange(range: LogicalRange, addedCount: number): LogicalRange {
  return { from: range.from + addedCount, to: range.to + addedCount }
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `npx vitest run tests/pagination.test.ts`
Expected: PASS — 6 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/core/candles/pagination.ts tests/pagination.test.ts
git commit -m "$(cat <<'EOF'
Add pure helpers for chart scroll-back pagination

shouldLoadOlder decides when the visible range is close enough to
the loaded edge to fetch more; shiftedVisibleRange keeps the view
stable when older candles get prepended. Not wired up yet.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: View-mode windowed loading in the store

**Files:**
- Modify: `src/shared/constants.ts` (add `INITIAL_VIEW_CANDLES`, `CANDLE_PAGE_SIZE`)
- Modify: `src/renderer/src/store/useAppStore.ts` (new state fields, `loadDataset` change, new `loadOlderCandles` action)

- [ ] **Step 1: Add the sizing constants**

In `src/shared/constants.ts`, add after `export const WARMUP_BARS = 50`:

```ts
export const INITIAL_VIEW_CANDLES = 2000
export const CANDLE_PAGE_SIZE = 1000
```

- [ ] **Step 2: Add the new state fields to `AppState`**

In `src/renderer/src/store/useAppStore.ts`, in the `AppState` interface, add three fields right after `gaps: DataGap[]` (currently line 64):

```ts
  sourceHasOlder: boolean
  loadingOlderCandles: boolean
  pendingRangeShift: number | null
```

Add the action signature in the interface's method list, right after `loadDataset: (id: number) => Promise<void>` (currently line 132):

```ts
  loadOlderCandles: () => Promise<void>
```

- [ ] **Step 3: Add initial values**

In the same file, in the store's initial state object, add right after `gaps: [],` (currently line 297):

```ts
  sourceHasOlder: false,
  loadingOlderCandles: false,
  pendingRangeShift: null,
```

- [ ] **Step 4: Import the new constants**

Change the existing import:

```ts
import {
  BASE_TICK_MS,
  DEFAULT_COSTS,
  DEFAULT_STRATEGY_SETTINGS,
  WARMUP_BARS
} from '@shared/constants'
```

to:

```ts
import {
  BASE_TICK_MS,
  CANDLE_PAGE_SIZE,
  DEFAULT_COSTS,
  DEFAULT_STRATEGY_SETTINGS,
  INITIAL_VIEW_CANDLES,
  WARMUP_BARS
} from '@shared/constants'
```

- [ ] **Step 5: Change `loadDataset` to fetch a window instead of everything**

Replace the whole `loadDataset` action body:

```ts
  loadDataset: async (id) => {
    const dataset = get().datasets.find((d) => d.id === id)
    if (!dataset) return
    set({ busy: true, status: `Loading ${dataset.source} tape…` })
    try {
    const [candleBuffer, gaps] = await Promise.all([
      requireDesktop().datasets.candles(id),
      requireDesktop().datasets.gaps(id)
    ])
    const sourceCandles = fromCandleBuffer(candleBuffer)
    const displayTimeframe =
      intervalMs(dataset.timeframe) <= intervalMs(get().displayTimeframe)
        ? get().displayTimeframe
        : dataset.timeframe
    const displayCandles = rebuildDisplay(sourceCandles, dataset.timeframe, displayTimeframe)
    strategy = createStrategy(get().settings)
    strategy.initialize()
    set({
      datasetId: id,
      symbol: dataset.symbol,
      sourceCandles,
      sourceTimeframe: dataset.timeframe,
      displayTimeframe,
      displayCandles,
      gaps,
      mode: 'view',
      replayIndex: Math.max(0, displayCandles.length - 1),
      replayFromTs: displayCandles[0]?.timestamp ?? null,
      replayToTs: displayCandles.at(-1)?.timestamp ?? null,
      isPlaying: false,
      pendingSetup: null,
      draft: null,
      activeTrade: null,
      busy: false,
      status: `${dataset.symbol} ${dataset.timeframe} · ${sourceCandles.length.toLocaleString()} candles`
    })
    clearTimer()
    persistDesk()
    } catch (error) {
      set({
        busy: false,
        status: error instanceof Error ? error.message : 'Could not load that tape.'
      })
      notifyError('Could not load that tape.', error)
    }
  },
```

with:

```ts
  loadDataset: async (id) => {
    const dataset = get().datasets.find((d) => d.id === id)
    if (!dataset) return
    set({ busy: true, status: `Loading ${dataset.source} tape…` })
    try {
    const [candleBuffer, gaps] = await Promise.all([
      requireDesktop().datasets.candlesPage(id, INITIAL_VIEW_CANDLES),
      requireDesktop().datasets.gaps(id)
    ])
    const sourceCandles = fromCandleBuffer(candleBuffer)
    const displayTimeframe =
      intervalMs(dataset.timeframe) <= intervalMs(get().displayTimeframe)
        ? get().displayTimeframe
        : dataset.timeframe
    const displayCandles = rebuildDisplay(sourceCandles, dataset.timeframe, displayTimeframe)
    strategy = createStrategy(get().settings)
    strategy.initialize()
    set({
      datasetId: id,
      symbol: dataset.symbol,
      sourceCandles,
      sourceTimeframe: dataset.timeframe,
      displayTimeframe,
      displayCandles,
      gaps,
      sourceHasOlder: sourceCandles.length === INITIAL_VIEW_CANDLES,
      loadingOlderCandles: false,
      pendingRangeShift: null,
      mode: 'view',
      replayIndex: Math.max(0, displayCandles.length - 1),
      replayFromTs: displayCandles[0]?.timestamp ?? null,
      replayToTs: displayCandles.at(-1)?.timestamp ?? null,
      isPlaying: false,
      pendingSetup: null,
      draft: null,
      activeTrade: null,
      busy: false,
      status: `${dataset.symbol} ${dataset.timeframe} · ${dataset.candleCount.toLocaleString()} candles`
    })
    clearTimer()
    persistDesk()
    } catch (error) {
      set({
        busy: false,
        status: error instanceof Error ? error.message : 'Could not load that tape.'
      })
      notifyError('Could not load that tape.', error)
    }
  },
```

(Two changes: `datasets.candles(id)` → `datasets.candlesPage(id, INITIAL_VIEW_CANDLES)`; three new fields in the `set`; status line now reports the dataset's true total (`dataset.candleCount`) rather than however many candles happen to be loaded.)

- [ ] **Step 6: Add the `loadOlderCandles` action**

Immediately after the `loadDataset` action (right before `setReplayRange: (fromTs, toTs) => {`), add:

```ts
  loadOlderCandles: async () => {
    const s = get()
    if (s.loadingOlderCandles || !s.sourceHasOlder || s.sourceCandles.length === 0 || s.datasetId == null) {
      return
    }
    const datasetId = s.datasetId
    const beforeTs = s.sourceCandles[0].timestamp
    set({ loadingOlderCandles: true })
    try {
      const older = fromCandleBuffer(
        await requireDesktop().datasets.candlesPage(datasetId, CANDLE_PAGE_SIZE, beforeTs)
      )
      if (get().datasetId !== datasetId) return
      if (older.length === 0) {
        set({ sourceHasOlder: false, loadingOlderCandles: false })
        return
      }
      const next = get()
      const sourceCandles = [...older, ...next.sourceCandles]
      const displayCandles = rebuildDisplay(sourceCandles, next.sourceTimeframe, next.displayTimeframe)
      const addedCount = displayCandles.length - next.displayCandles.length
      set({
        sourceCandles,
        displayCandles,
        sourceHasOlder: older.length === CANDLE_PAGE_SIZE,
        loadingOlderCandles: false,
        pendingRangeShift: addedCount
      })
    } catch (error) {
      set({ loadingOlderCandles: false })
      notifyError('Could not load older candles.', error)
    }
  },
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all existing tests still pass (no test exercises `useAppStore` directly, so this just confirms nothing else broke).

- [ ] **Step 9: Commit**

```bash
git add src/shared/constants.ts src/renderer/src/store/useAppStore.ts
git commit -m "$(cat <<'EOF'
Load a windowed view instead of the whole tape, page in older candles

loadDataset now fetches the latest 2,000 candles instead of every
candle in the dataset. New loadOlderCandles() fetches 1,000 more
whenever there's an older page and nothing is fetching already.
Nothing calls loadOlderCandles yet — that's the chart's job (next).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Bounded replay-range loading in the store

**Files:**
- Modify: `src/renderer/src/store/useAppStore.ts` (new `loadReplayRange` action)

- [ ] **Step 1: Add the action interface entry**

In the `AppState` interface's method list, add right after `loadOlderCandles: () => Promise<void>` (added in Task 3):

```ts
  loadReplayRange: (fromTs: number, toTs: number) => Promise<void>
```

- [ ] **Step 2: Add the action implementation**

Immediately after the `loadOlderCandles` action (right before `setReplayRange: (fromTs, toTs) => {`), add:

```ts
  loadReplayRange: async (fromTs, toTs) => {
    const s = get()
    if (s.datasetId == null) return
    const datasetId = s.datasetId
    const warmupSpanMs = WARMUP_BARS * intervalMs(s.displayTimeframe) * 3
    set({ busy: true, status: 'Loading replay range…' })
    try {
      const candleBuffer = await requireDesktop().datasets.candles(datasetId, fromTs - warmupSpanMs, toTs)
      const sourceCandles = fromCandleBuffer(candleBuffer)
      const next = get()
      const displayCandles = rebuildDisplay(sourceCandles, next.sourceTimeframe, next.displayTimeframe)
      set({
        sourceCandles,
        displayCandles,
        sourceHasOlder: true,
        loadingOlderCandles: false,
        pendingRangeShift: null,
        busy: false
      })
    } catch (error) {
      set({
        busy: false,
        status: error instanceof Error ? error.message : 'Could not load that replay range.'
      })
      notifyError('Could not load that replay range.', error)
      throw error
    }
  },
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/store/useAppStore.ts
git commit -m "$(cat <<'EOF'
Add loadReplayRange for bounded replay-session data

Fetches exactly [fromTs - warmup buffer, toTs] fresh from the
existing ranged datasets.candles call and replaces sourceCandles/
displayCandles with it. Nothing calls this yet — ReplayRangeModal
wires it up next.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wire pagination into `ChartPanel`

**Files:**
- Modify: `src/renderer/src/components/ChartPanel.tsx`

- [ ] **Step 1: Import the pagination helpers**

Add near the top of the file, alongside the other `@core` imports:

```ts
import { shouldLoadOlder, shiftedVisibleRange } from '@core/candles/pagination'
```

- [ ] **Step 2: Add the scroll-back trigger effect**

Add a new module-scope constant right after the existing `const VIEW_BARS = 160`:

```ts
const LOAD_MORE_THRESHOLD = 200
```

Then add a new `useEffect`, right after the chart-creation `useEffect` that ends with:

```ts
    return () => {
      indicatorsRef.current.clear()
      chart.remove()
      chartRef.current = null
      setChartApi(null)
      setSeriesApi(null)
    }
  }, [theme, chartFull])
```

Insert this new effect immediately after that closing `}, [theme, chartFull])`:

```ts
  useEffect(() => {
    if (!chartApi) return
    const scale = chartApi.timeScale()
    const onRangeChange = (range: { from: number; to: number } | null): void => {
      if (useAppStore.getState().mode !== 'view') return
      if (!shouldLoadOlder(range, LOAD_MORE_THRESHOLD)) return
      void useAppStore.getState().loadOlderCandles()
    }
    scale.subscribeVisibleLogicalRangeChange(onRangeChange)
    return () => scale.unsubscribeVisibleLogicalRangeChange(onRangeChange)
  }, [chartApi])
```

- [ ] **Step 3: Preserve the visible range across a pagination-triggered redraw**

Inside the `paint` function (defined in the effect that starts `useEffect(() => { const syncOverlays = ...`), find this block (the tail end of the non-incremental / full-redraw branch):

```ts
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
```

(Note: if your checkout has `to: Math.max(count - 1 + 35, from + 24)` or a similar `+ N` offset instead of the plain `to: Math.max(count - 1, from + 24)` shown above, a concurrent change landed on this file after this plan was written — use whatever the "else" branch's `from`/`to` computation actually is in your checkout; only the `if (pendingShift != null && priorRange)` branch below is new, the "else" branch should keep its existing computation unchanged.)

Replace it with:

```ts
      const token = ++paintTokenRef.current
      useAppStore.setState({ busy: true, status: 'Rendering chart…' })
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (paintTokenRef.current !== token) return
          if (chartRef.current !== chart || candleRef.current !== series) {
            useAppStore.setState({ busy: false })
            return
          }
          const pendingShift = useAppStore.getState().pendingRangeShift
          const priorRange = pendingShift != null ? chart.timeScale().getVisibleLogicalRange() : null
          series.setData(visible.map(toBar))
          for (const line of strategyIndicatorLines(settings, visible)) {
            indicatorsRef.current.get(line.id)?.setData(line.points.map(toLinePoint))
          }
          if (pendingShift != null && priorRange) {
            chart.timeScale().setVisibleLogicalRange(shiftedVisibleRange(priorRange, pendingShift))
          } else {
            const from = Math.max(0, count - VIEW_BARS)
            chart.timeScale().setVisibleLogicalRange({
              from,
              to: Math.max(count - 1, from + 24)
            })
          }
          useAppStore.setState({ pendingRangeShift: null, busy: false })
        })
      })
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`

In the app: pick a symbol/dataset with more than 2,000 candles loaded, confirm the status bar shows the dataset's real total count, scroll the chart to the left edge of what's visible, and confirm older candles appear with no visible jump in the bars you were already looking at. Stop the dev server (`Ctrl-C`) when done.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/ChartPanel.tsx
git commit -m "$(cat <<'EOF'
Trigger scroll-back pagination from the chart's visible range

Subscribes to the time scale's visible-logical-range changes; once
the left edge gets within 200 bars of what's loaded (in view mode),
fetches an older page. The chart's normal full-redraw "snap to
latest" reset is skipped for a pagination-triggered redraw and
replaced with a shift, so scrolling back doesn't jump.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Replay range popup always requires a period, bounded by true dataset range

**Files:**
- Modify: `src/renderer/src/components/ReplayRangeModal.tsx`

- [ ] **Step 1: Replace the whole file**

```tsx
import { useState } from 'react'
import { fromReplayInput, toReplayInput } from '../lib/replayRange'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'

export function ReplayRangeModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const replayFromTs = useAppStore((s) => s.replayFromTs)
  const replayToTs = useAppStore((s) => s.replayToTs)
  const datasetId = useAppStore((s) => s.datasetId)
  const datasets = useAppStore((s) => s.datasets)
  const dataset = datasets.find((d) => d.id === datasetId)
  const setReplayRange = useAppStore((s) => s.setReplayRange)
  const startReplay = useAppStore((s) => s.startReplay)
  const loadReplayRange = useAppStore((s) => s.loadReplayRange)

  const [from, setFrom] = useState(() => toReplayInput(replayFromTs ?? dataset?.startTs))
  const [to, setTo] = useState(() => toReplayInput(replayToTs ?? dataset?.endTs))

  function handleStart(): void {
    const fromTs = fromReplayInput(from)
    const toTs = fromReplayInput(to)
    if (fromTs == null || toTs == null) return
    onClose()
    void (async () => {
      await loadReplayRange(fromTs, toTs)
      setReplayRange(fromTs, toTs)
      startReplay({ fromTs, toTs })
    })()
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="replay-range-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault()
          handleStart()
        }}
      >
        <header>
          <div>
            <span className="stamp">Replay</span>
            <h2 id="replay-range-title">Choose period</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close">
            <Icon name="close" />
          </button>
        </header>

        <div className="row">
          <label className="field">
            From
            <input
              type="datetime-local"
              value={from}
              required
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Replay from"
            />
          </label>
          <label className="field">
            To
            <input
              type="datetime-local"
              value={to}
              required
              onChange={(e) => setTo(e.target.value)}
              aria-label="Replay to"
            />
          </label>
        </div>

        <div className="composer-actions">
          <button className="ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary icon-label" type="submit">
            <Icon name="play" />
            Start
          </button>
        </div>
      </form>
    </div>
  )
}
```

This removes the `mode`/`RangeMode`/"Full history" radio entirely (period is now always required), and seeds the date pickers from the dataset's true `startTs`/`endTs` (via the already-loaded `datasets` list) instead of `displayCandles` bounds, since `displayCandles` may now be a partial window. On submit, `loadReplayRange` fetches the bounded range fresh before `startReplay` runs.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`

In the app: open "Choose period" (wherever `ReplayRangeModal` is triggered from — check `ReplayControls.tsx` if unsure which button opens it), confirm the From/To fields default to the dataset's actual full start/end (not just the last 2,000 loaded candles), pick a custom range, hit Start, and confirm replay plays correctly from that point. Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ReplayRangeModal.tsx
git commit -m "$(cat <<'EOF'
Require an explicit period for replay, loaded fresh from the DB

Drops the "Full history" option — replay can no longer silently
load an entire multi-year tape into memory. Date pickers now bound
by the dataset's true start/end instead of whatever view mode
happened to have windowed in.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass, including the new `tests/pagination.test.ts`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: `electron-vite build` completes with no errors (main/preload/renderer all build).

- [ ] **Step 4: Manual end-to-end pass**

Run: `npm run dev` and walk through, in order:

1. Load a dataset with well over 2,000 candles. Status bar shows the dataset's true total candle count.
2. Scroll/pan the chart left repeatedly past the initially-loaded window. Older candles keep appearing, with no visible jump, until the true start of the dataset is reached (scrolling further does nothing more, no errors in the DevTools console).
3. Switch symbols/datasets mid-scroll; confirm no stale-data errors and the new dataset loads its own fresh window.
4. Open "Choose period", start a custom-range replay, and confirm playback, indicators, and trade simulation behave as before.

Stop the dev server when done.

- [ ] **Step 5: Report**

No commit needed for this task (verification only) unless Step 4 surfaces a bug — if it does, fix it, re-run the relevant checks above, and commit the fix with a description of what was wrong.
