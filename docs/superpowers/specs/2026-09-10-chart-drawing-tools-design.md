# Chart drawing tools — design

## Context

The user wants TradingView-style drawing tools on the strategy-lab chart
(`ChartPanel.tsx`). The chart is rendered with `lightweight-charts` v5, the
open-source library — it ships with candles/lines/markers/price-lines but no
drawing-tool UI at all (that's a feature of TradingView's separate,
proprietary "Advanced Charts" product, not this library). TradingView's own
catalog is 50+ tools (Gann, Elliott Wave, XABCD patterns, pitchforks, etc.);
building all of it is a multi-week effort and most of it is rarely used. The
user agreed (via clarifying questions) to scope v1 to a curated core set,
built so more tools can be layered on later.

Two relevant things already exist in the codebase:

- `ChartTradeOverlay.tsx` already solves "interactive draggable elements
  positioned over a `lightweight-charts` instance": it converts chart
  coordinates via `series.priceToCoordinate` / `chart.timeScale()
  .timeToCoordinate`, keeps them in sync across pan/zoom/resize via
  `subscribeVisibleLogicalRangeChange` / `subscribeVisibleTimeRangeChange` /
  `subscribeSizeChange` plus a `requestAnimationFrame` loop while not
  replaying, and renders draggable HTML `<button>` handles. The new drawing
  layer reuses this exact pattern rather than inventing a new one.
- The DB schema already has an unused `annotations` table
  (`session_id, type, payload`). It is not reused here: it cascade-deletes
  with a backtest session, but drawings need to persist per **symbol**
  (surviving session deletes/creation), matching TradingView's own model
  where a symbol's drawings show up regardless of which chart/session you
  opened it from. A new `drawings` table is added instead; `annotations`
  is left untouched (out of scope, and deleting unused schema is not part of
  this feature).

## Goal

Let the user draw and edit a core set of chart annotations — trend line,
horizontal line, horizontal ray, vertical line, rectangle, ellipse, fib
retracement, text note, freehand brush, and a measure tool — via a floating
toolbar, with per-drawing selection/editing/deletion, and have non-measure
drawings persist per symbol across restarts.

## Non-goals (v1)

- Parallel channels, fib extension/fan/circles/time-zone, pitchforks, Gann
  tools, Elliott Wave, XABCD patterns, long/short position projection tool.
  These are straightforward to add later on top of the same
  `Drawing`/`DrawingLayer` architecture, once the core set is proven out.
- Per-timeframe drawing visibility (TradingView's "per interval" setting,
  off by default). v1 always shows a symbol's drawings regardless of the
  active `displayTimeframe`, matching TradingView's default behavior.
- Syncing/cloud storage — persistence is local SQLite only, same as every
  other piece of state in this app.
- Editing fib retracement level set (which ratios show) — v1 ships the
  standard 7 fixed levels (0, 0.236, 0.382, 0.5, 0.618, 0.786, 1); only
  color is user-editable in v1.

## Design

### Data model (`src/shared/types.ts`)

```ts
export type DrawingTool =
  | 'trendline' | 'horizontal' | 'ray' | 'vertical'
  | 'rectangle' | 'ellipse' | 'fib' | 'text' | 'brush'

export interface DrawingPoint {
  time: number   // ms epoch, matches Candle.timestamp
  price: number
}

export interface DrawingStyle {
  color: string
  lineWidth: number
  dashed: boolean
}

export interface Drawing {
  id: string
  symbol: string
  type: DrawingTool
  points: DrawingPoint[]   // 1 for horizontal/vertical/text, 2 for
                           // trendline/ray/rectangle/ellipse/fib, N for brush
  text?: string            // only for 'text'
  style: DrawingStyle
  createdAt: number
  updatedAt: number
}
```

The measure tool has no persisted representation — it's purely transient UI
state in `DrawingLayer`, never becomes a `Drawing`.

### Persistence

New table in `schema.ts`:

```sql
CREATE TABLE IF NOT EXISTS drawings (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drawings_symbol ON drawings(symbol);
```

`payload_json` holds everything but `id`/`symbol`/`createdAt`/`updatedAt`
(i.e. `type`, `points`, `text`, `style`) — same "typed columns for what you
filter by, JSON blob for the rest" split already used by `sessions`
(`account_json`/`costs_json`) and `strategies` (`settings_json`).

`repositories.ts` gets `listDrawings(symbol)`, `saveDrawing(drawing)`
(upsert), `deleteDrawing(id)`, `clearDrawings(symbol)` — same shape as the
existing `strategies` CRUD functions.

New IPC channels in `shared/ipc.ts`: `DRAWINGS_LIST`, `DRAWINGS_SAVE`,
`DRAWINGS_DELETE`, `DRAWINGS_CLEAR`, wired in `main/ipc.ts` the same way as
`STRATEGIES_*`, and exposed via `preload/index.ts` under a new `drawings`
namespace.

### Store (`useAppStore.ts`)

New slice:

```ts
drawings: Drawing[]
activeTool: DrawingTool | null
selectedDrawingId: string | null
drawingDefaults: Record<DrawingTool, DrawingStyle>  // last-used style per tool, in-memory only
```

Actions: `setActiveTool`, `addDrawing`, `updateDrawing` (patches points/style,
used both mid-drag and on style-panel edits), `removeDrawing`, `selectDrawing`,
`clearDrawings`. All of `addDrawing`/`updateDrawing`/`removeDrawing` update
the array optimistically, then call the IPC save/delete — debounced ~300ms
for high-frequency updates (dragging a handle), immediate on pointer-up and
for all non-drag mutations (add, delete, style change).

`drawings` is (re)loaded whenever `symbol` changes, alongside the existing
dataset-switch logic (near line 492's `selectSymbol`), replacing the array
wholesale rather than merging.

### Rendering (`DrawingLayer.tsx`, new component)

Mounted in `ChartPanel.tsx` next to `<ChartTradeOverlay />`, same props
shape (`chart`, `series`, `host`).

- A single `<canvas>` absolutely positioned over `.chart`, resized to match
  `host`'s bounding box (`ResizeObserver`, same trigger points as
  `ChartTradeOverlay`'s `subscribeSizeChange`).
- Repaint loop: convert each `Drawing`'s `points` to pixel coordinates via
  `series.priceToCoordinate` / `chart.timeScale().timeToCoordinate`, then
  draw with 2D canvas primitives (`moveTo`/`lineTo` for lines/trendlines/
  rays, `strokeRect`/fill for rectangles, `ellipse()` for ellipses,
  `fillText` for fib labels/text notes, a smoothed point-to-point path for
  brush strokes). Re-runs on the same pan/zoom/resize subscriptions
  `ChartTradeOverlay` uses, plus whenever `drawings` changes.
- Pointer-events on the canvas are `none` by default (so the existing
  crosshair and `ChartTradeOverlay` drag handles keep working underneath)
  and flipped to `auto` only while `activeTool` is set or a drawing is
  selected — same conditional-pointer-events trick, just gated on different
  state than the trade overlay.
- Hit-testing for "click an existing drawing to select it" is
  distance-to-segment / point-in-rect / point-in-ellipse math against the
  same pixel-coordinate conversion, run on canvas `pointerdown` when no tool
  is active.
- The **selected** drawing additionally gets small HTML `<button>` handles at
  each anchor point (reusing the `Handle` component pattern from
  `ChartTradeOverlay.tsx`) for precise dragging, plus a small floating
  mini-toolbar (color swatches, width steps, dashed toggle, delete) anchored
  near its first point.

### Interaction flow

1. Click a tool icon → `setActiveTool(tool)`. Cursor becomes crosshair over
   the chart (CSS on `.chart` keyed off `activeTool !== null`).
2. Single-point tools (horizontal, vertical, text) commit on the first
   click. Two-point tools (trendline, ray, rectangle, ellipse, fib) commit
   on the second click (click-click, not click-drag, matching TradingView's
   default click-to-place — drag is reserved for editing afterward). Brush
   draws continuously between `pointerdown` and `pointerup`.
3. On commit, `addDrawing(...)` is called with `drawingDefaults[tool]` as the
   style, `activeTool` resets to `null` (tool auto-deselects, matching
   TradingView), and the new drawing becomes selected.
4. Selecting a drawing (click when no tool active) shows its handles + mini
   style toolbar. Dragging a handle calls `updateDrawing`. Dragging the
   drawing's body (hit inside a rectangle/ellipse, or near a line, not on a
   handle) moves all its points by the same delta.
5. `Delete`/`Backspace` while a drawing is selected calls `removeDrawing`.
   `Escape` cancels an in-progress multi-click drawing or clears selection.
6. Editing color/width/dashed in the mini toolbar calls `updateDrawing` and
   also updates `drawingDefaults[type]` so the next new drawing of that type
   matches.

### Measure tool

Not a `Drawing`. `pointerdown` on the chart while `activeTool === 'measure'`
starts tracking; a small floating HTML label (not canvas — it's simple,
transient text) follows the pointer showing Δprice, Δ% and bar count between
the anchor and current position, computed from the same coordinate
conversions. Clears on `pointerup`.

### Toolbar (`DrawingToolbar.tsx`, new component)

Floating vertical icon rail, absolutely positioned inside `.chart` pinned to
its left edge (same positioning approach as the existing
`.chart-frame-btn` expand/compress button). Icons, top to bottom:

1. Cursor (default/deselect-tool state)
2. Line-tools flyout: trend line, horizontal line, ray, vertical line
3. Shapes flyout: rectangle, ellipse
4. Fib retracement
5. Text
6. Brush
7. Measure
8. — divider —
9. Eye toggle: show/hide all drawings for the symbol (visual only, doesn't
   delete; a simple `drawingsHidden: boolean` in `DrawingLayer` local state)
10. Trash: `clearDrawings(symbol)`, with a confirm (reuse the existing
    `ConfirmIconButton.tsx` component already used elsewhere in the app)

Flyouts are small popovers (open on click, same portal-positioning approach
as `Dropdown.tsx`) listing the grouped tools' icons in a row.

## Files touched

- `src/shared/types.ts` — add `DrawingTool`, `DrawingPoint`, `DrawingStyle`,
  `Drawing`.
- `src/shared/ipc.ts` — add `DRAWINGS_LIST/SAVE/DELETE/CLEAR`.
- `src/main/database/schema.ts` — add `drawings` table + index.
- `src/main/database/repositories.ts` — add `listDrawings`, `saveDrawing`,
  `deleteDrawing`, `clearDrawings`.
- `src/main/ipc.ts` — wire the four new handlers.
- `src/preload/index.ts` — add `drawings` namespace to the exposed API.
- `src/renderer/src/store/useAppStore.ts` — add drawings slice/actions, load
  on symbol change.
- `src/renderer/src/components/DrawingLayer.tsx` — new.
- `src/renderer/src/components/DrawingToolbar.tsx` — new.
- `src/renderer/src/components/ChartPanel.tsx` — mount both new components.
- `src/renderer/src/styles/global.css` — toolbar rail, flyouts, mini style
  toolbar, drawing cursor states.

## Testing

Unit tests (vitest):

- Fib level calculation (7 fixed ratios → correct prices given two anchor
  prices, both directions of retracement).
- Store reducer logic: add/update/remove/select drawings, symbol-switch
  replaces the array, debounced-save call count during a rapid-update drag
  simulation.
- Hit-testing helpers (point-to-segment distance, point-in-rect,
  point-in-ellipse) with known coordinates/expected results.

Manual verification via the `run` skill (Electron app, no UI test harness):

1. Draw one of each tool type; confirm each renders correctly and
   auto-deselects the tool afterward.
2. Select a drawing, drag each handle, drag the body, confirm persistence
   (reload the app, drawing is still there and in the moved position).
3. Change color/width/dashed on a drawing; draw a new one of the same type;
   confirm it picks up the new default style.
4. Delete a drawing via keyboard and via the mini toolbar.
5. Switch symbols; confirm drawings are symbol-scoped (don't leak across).
6. Use the measure tool; confirm it never appears after reload (not
   persisted).
7. Toggle "hide all" and "clear all"; confirm expected behavior on both.
8. Confirm the existing `ChartTradeOverlay` SL/TP drag handles and the
   chart's crosshair still work normally when no drawing tool is active.
