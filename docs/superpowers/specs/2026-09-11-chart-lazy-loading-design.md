# Chart lazy loading — design

## Context

`useAppStore.loadDataset(id)` currently fetches **every** candle for a
dataset in one IPC round trip (`datasets.candles(id)` → main process
`getCandles(datasetId)` → `SELECT * FROM candles WHERE dataset_id = ?`, no
limit) and keeps the whole array in memory as `sourceCandles`, resampled
into `displayCandles`. For a multi-year intraday tape (the kind this app is
built around — XAUUSD, etc., downloaded via Dukascopy) that's potentially
millions of rows loaded, resampled, and hard-resent to `series.setData()`
on every full chart redraw, for a chart that only ever shows ~160 bars at
once (`VIEW_BARS` in `ChartPanel.tsx`).

Two relevant things already exist:

- `src/main/database/schema.ts` already has `idx_candles_dataset_ts` on
  `(dataset_id, timestamp)`, and `getCandles(datasetId, fromTs?, toTs?)`
  already supports an indexed range query — it's just never called with a
  range from the renderer today.
- `ReplayRangeModal.tsx` already exists as a "Choose period" popup for
  replay, but today it only moves the `ReplayEngine`'s cursor over data
  that's already fully loaded by `loadDataset` — it doesn't affect what's
  fetched.
- Datasets have two backends: SQLite-stored (Dukascopy download / CSV
  import / generated demo data go through the `candles` table) and
  ad-hoc CSV tapes read straight off disk (`isCsvDataset` /
  `src/main/data/csvTape.ts`, id-space starting at `CSV_ID_BASE`, parsed
  once and cached fully in `main`). Any new candle-fetching IPC needs to
  branch on `isCsvDataset` the same way the existing `DATASETS_CANDLES`
  handler does.

## Goal

Stop loading a dataset's entire candle history into renderer memory up
front. Normal chart browsing loads a recent window and fetches further
history on demand as the user scrolls back. Replay sessions load exactly
the period the user explicitly picks, via the existing "Choose period"
popup, instead of inheriting whatever view mode happened to have loaded.

## Non-goals

- Lazy-loading *forward* in time / streaming live data — out of scope;
  view mode's initial window is simply "the most recent N candles", and
  there's nothing newer than that to page in.
- Any change to replay's tick-by-tick playback, `ReplayEngine`, strategy
  evaluation, or trade simulation — those keep operating on a fully
  materialized array exactly as today; only *what range* gets loaded into
  that array changes.
- Virtualizing drawings, indicators, or markers independently of candles —
  they already just render whatever's in `displayCandles`.
- Changing how CSV tapes are cached in the main process (`csvTape.ts`
  already fully parses+caches a CSV file once; that's a separate, smaller
  concern than what gets pushed into the *renderer*).

## Design

### 1. New main-process query: "a page of recent candles"

Add one function next to `getCandles` in
`src/main/database/repositories.ts`:

```ts
export function getRecentCandles(
  datasetId: number,
  limit: number,
  beforeTs?: number
): Candle[] {
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

Both shapes are the same query with one optional clause, so this is one
function, not two — `beforeTs` omitted means "the latest N", provided
means "the N immediately before that cutoff". Both are backed by
`idx_candles_dataset_ts`.

Wire it through as a new IPC channel `DATASETS_CANDLES_PAGE` /
`datasets:candles-page`, following the exact existing pattern for
`DATASETS_CANDLES` (including the `isCsvDataset(datasetId)` branch — for
CSV tapes, reuse the already-cached full array from `csvCandles(id)` and
slice the last `limit` (optionally before `beforeTs`) in JS, since that
data is already fully parsed in memory and there's no DB to index).
Preload exposes it as `datasets.candlesPage(datasetId, limit, beforeTs?)`,
returned as a `CandleBuffer` like the existing `candles` call.

### 2. View mode: windowed initial load + scroll-back pagination

In `useAppStore.ts`:

- `loadDataset(id)` calls `datasets.candlesPage(id, INITIAL_VIEW_CANDLES)`
  (2,000) instead of `datasets.candles(id)`. Two new fields track paging
  state: `sourceHasOlder: boolean` (seeded as `sourceCandles.length ===
  INITIAL_VIEW_CANDLES` — if the first fetch came back short, that's the
  entire dataset) and `loadingOlderCandles: boolean`.
- New action `loadOlderCandles()`: no-ops if `loadingOlderCandles`,
  `!sourceHasOlder`, or `sourceCandles.length === 0`. Otherwise fetches
  `datasets.candlesPage(datasetId, PAGE_CANDLES /* 1,000 */,
  sourceCandles[0].timestamp)`, prepends the result to `sourceCandles`,
  sets `sourceHasOlder = result.length === PAGE_CANDLES`, and recomputes
  `displayCandles` via the existing `rebuildDisplay(sourceCandles,
  sourceTimeframe, displayTimeframe)` — the same resample call
  `loadDataset` and the timeframe-switch handler already use, so
  indicators/markers/drawings all pick up the extended history for free
  through the existing `paint()` effect.

In `ChartPanel.tsx`, the effect that creates the chart also subscribes to
`chart.timeScale().subscribeVisibleLogicalRangeChange`. On each change,
while `mode === 'view'`: if `range.from` is within `LOAD_MORE_THRESHOLD`
(200) bars of the start of what's loaded, call
`useAppStore.getState().loadOlderCandles()`.

**Important existing behavior this interacts with:** `paint()`'s
non-incremental branch (the one that calls `series.setData()`) currently
*always* finishes by resetting the view with
`chart.timeScale().setVisibleLogicalRange({ from: count - VIEW_BARS, to:
... })` — i.e. "snap to the latest bars" — regardless of why the redraw
happened. Left as-is, that reset would fire right after every prepend and
immediately undo the user's scroll-back, making pagination feel like it
snaps back to "now" every time older candles load. `loadOlderCandles()`
needs to suppress that reset and substitute a shift instead:

- `loadOlderCandles()` already resamples the extended `sourceCandles` to
  get the new `displayCandles`. It computes `addedCount =
  newDisplayCandles.length - oldDisplayCandles.length` (resampling means
  this isn't 1:1 with the raw page size) and sets a new transient store
  field `pendingRangeShift: number | null` to that value alongside the
  updated candles.
- In `paint()`, right before calling `series.setData()`, if
  `pendingRangeShift != null`, capture
  `chart.timeScale().getVisibleLogicalRange()` first. After `setData()`,
  if that captured range is non-null, skip the usual "snap to latest"
  reset and instead call
  `chart.timeScale().setVisibleLogicalRange(shiftedVisibleRange(priorRange,
  pendingRangeShift))` (if it *is* null — e.g. chart not laid out yet —
  fall back to the normal reset); either way, clear the field back to
  `null` afterwards. Every other
  redraw reason (symbol switch, settings/indicator change, mode switch,
  first load, replay range jumps) leaves `pendingRangeShift` at `null` and
  keeps today's "snap to latest" behavior exactly as-is.

The "is a fetch warranted" check and the "shift the range by however many
bars were added" arithmetic are pulled into a small pure helper —
`src/core/candles/pagination.ts` — so they're vitest-covered without
needing a live chart:

```ts
export function shouldLoadOlder(
  range: { from: number; to: number } | null,
  threshold: number
): boolean

export function shiftedVisibleRange(
  range: { from: number; to: number },
  addedCount: number
): { from: number; to: number }
```

Everything else — symbol switching, "pull latest" (which appends newly
downloaded candles at the *end*), timeframe switching, drawings, indicator
overlays — is untouched; they all already just consume whatever's
currently in `sourceCandles`/`displayCandles`.

### 3. Replay: bounded fetch from the existing "Choose period" popup

`ReplayRangeModal.tsx`:

- Remove the "Full history" radio and the `mode` state entirely — the
  From/To fields are always shown and always required.
- Its defaults currently come from `displayCandles[0]`/`.at(-1)`, which
  under windowed loading is just "the latest 2,000 candles", not the
  dataset's actual history. Instead, fetch the dataset's true bounds once
  when the modal opens via a new tiny query `getDatasetRange(datasetId):
  { minTs: number; maxTs: number } | null` (`SELECT MIN(timestamp),
  MAX(timestamp) FROM candles WHERE dataset_id = ?`, exposed the same way
  as `getGaps` — new IPC channel `DATASETS_RANGE` / preload
  `datasets.range(datasetId)`; CSV datasets already know their bounds via
  the dataset's own `startTs`/`endTs` metadata, no new query needed there)
  and use that to seed and bound the date pickers.

In `useAppStore.ts`, a new action `startReplayForRange(fromTs, toTs)`:

- Computes a warmup cutoff `fromTs - WARMUP_BARS * intervalMs(displayTimeframe) * 3`
  (a generous fixed multiplier rather than an exact bar count, since FX
  data has weekend/holiday gaps where calendar time doesn't track bar
  count 1:1 — same best-effort spirit as the existing warmup clamping in
  `ReplayEngine`, which already tolerates "not enough history before this
  point" at the very start of a dataset).
- Fetches `datasets.candles(datasetId, warmupFromTs, toTs)` (the *existing*
  ranged call — no new endpoint needed here, since it's already an
  absolute-range query) and resamples with `rebuildDisplay`.
- Sets that as `sourceCandles`/`displayCandles`, then proceeds exactly
  like today's `startReplay` (`ReplayEngine`, `jumpToTimestamp`, account
  reset, etc.) — this action supersedes today's `startReplay` for the
  modal's "custom range" path; `ReplayRangeModal` calls it directly instead
  of `setReplayRange` + `startReplay`.
- When replay stops, view mode keeps showing whatever range the replay
  loaded (no auto-revert to "latest 2,000") — picking a new symbol or
  starting another replay is how you get a different window. Matches
  today's behavior of `stopReplay` not touching `displayCandles`.

### Edge cases

- Dataset shorter than 2,000 candles: first fetch returns fewer rows than
  requested, `sourceHasOlder` is `false` immediately, no scroll-triggered
  fetches ever fire.
- Fast scrolling: `loadingOlderCandles` guards against overlapping
  requests; the range-change subscription re-checks `sourceHasOlder` on
  every event so it naturally stops once the true start of history is
  reached.
- IPC failure fetching an older page: existing `notifyError` pattern,
  leave `sourceHasOlder` as `true` so the next scroll retries (SQLite
  reads essentially don't fail in practice, but this matches how every
  other IPC call in the store already handles rejection).

## Testing

- `src/core/candles/pagination.ts`: new vitest file covering
  `shouldLoadOlder` (null range, above/below/at threshold) and
  `shiftedVisibleRange` (shift math, zero-added no-op).
- `getRecentCandles` / `getDatasetRange` are thin SQL wrappers with no
  branching logic of their own, consistent with `getCandles`/`getGaps`
  already having no dedicated tests — not adding new DB test
  infrastructure for this.
- Manual verification: build, run the app, load a large tape, confirm the
  initial candle count in the status bar reflects the window (not the
  full tape), scroll left past the loaded edge and confirm older candles
  appear without a visible jump, open "Choose period", confirm the date
  bounds reflect the full dataset, start a custom-range replay and confirm
  it plays correctly.
