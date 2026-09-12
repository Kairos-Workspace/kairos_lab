# Chart indicator library + picker — design

## Context

The app can render lines on the chart today, but only as a side effect of whichever
backtest strategy is active — `src/core/indicators/overlay.ts`'s three functions
(`strategyIndicatorSpecs`/`strategyIndicatorLines`/`strategyIndicatorLast`) branch on
`StrategySettings.strategyId`, and `ChartPanel.tsx`'s `syncOverlays`/`indicatorsRef`
add/remove `LineSeries` instances to match. There is no user-facing "pick an
indicator" concept, no indicator that exists independently of a strategy, and no
generic indicator library anywhere in `src/core/` — confirmed by reading the whole
file and searching the codebase (see "prior art" note below).

The user wants a TradingView-style experience: an "Indicators" picker where they can
add technical indicators to the chart (moving averages, Bollinger Bands, RSI, MACD,
etc.), configure each one's parameters, and have them stick around per symbol like
drawings already do.

## Goal (this phase)

A real, extensible indicator system — separate from the strategy-overlay system —
with a curated starting library of 10 well-known indicators, an "Indicators" picker
UI, per-indicator parameter/color editing, and per-symbol persistence.

## Non-goals (this phase)

- **No custom scripting (Pine Script or otherwise).** Explicitly discussed and
  deferred as its own, much larger future project — a scripting language runtime is
  a different order of engineering effort than "pick from a list," and bundling it
  into this spec would make the spec undeliverable as one piece.
- **No changes to the existing strategy-overlay system.** `overlay.ts`, `bbma.ts`,
  and every strategy's own indicator lines keep working exactly as today,
  completely untouched — they're tied to backtest signal logic, not general
  charting, and conflating the two systems would risk regressing working backtests
  for no benefit.
- **No indicator-of-an-indicator** (e.g. "SMA of RSI") — uncommon, adds real
  complexity to the compute/data-flow model, not requested.
- **No shared/merged oscillator panes** (TradingView's advanced "overlay this
  oscillator onto that one" option) — every oscillator instance gets its own pane,
  TradingView's own default behavior.
- **No manual pane reordering/resizing.** Oscillator panes stack in the order their
  indicators were added (`position` is assigned automatically, never user-edited);
  dragging panes to reorder or resize them is a nice-to-have, not requested.
- **Not literally "every TradingView indicator."** Ships with 10 (5 overlay, 5
  oscillator) chosen to cover the large majority of real usage; the catalog/compute
  architecture is designed so adding an 11th type later is a small, isolated change
  (new catalog entry + one compute function), not a redesign.

## The ten indicators

**Overlay** (drawn on the price pane, alongside candles):
- SMA (Simple Moving Average)
- EMA (Exponential Moving Average)
- WMA (Weighted Moving Average)
- Bollinger Bands (upper/middle/lower)
- VWAP (Volume-Weighted Average Price)

**Oscillator** (own pane below the price chart):
- RSI (Relative Strength Index)
- MACD (line + signal + histogram)
- Stochastic (%K + %D)
- ATR (Average True Range)
- Volume (histogram)

## Architecture

### Core computation — `src/core/indicators/`

New files, alongside (not replacing) the existing `overlay.ts`/`bbma.ts`/`math.ts`:

- `catalog.ts` — `INDICATOR_CATALOG: IndicatorTypeSpec[]`, one entry per type:
  `{ id, label, category: 'overlay' | 'oscillator', defaultParams, paramSchema,
  defaultStyle }`. `paramSchema` describes each editable numeric param (name, label,
  min/max/step) so the parameter-editing UI can be generated generically rather than
  hand-built per indicator type.
- `library.ts` — one pure compute function per type, uniform shape:
  `(candles: Candle[], params: Record<string, number>) => { lines: { id: string;
  label: string; points: { timestamp: number; value: number }[] }[] }`. Single-line
  types (SMA/EMA/WMA/RSI/ATR/VWAP) return one line; multi-line types return several
  (Bollinger → upper/middle/lower, MACD → macd/signal/histogram, Stochastic →
  k/d). Volume returns one histogram-shaped line (value = candle volume).
- Reuses `math.ts`'s existing `sma`/`bollinger` helpers where the math is identical;
  adds `ema`, `wma`, `rsi`, `macd`, `stochastic`, `atr` as new pure functions in the
  same file (or a new `math.ts`-adjacent module if it's cleaner — implementer's call
  during planning, not an architectural decision).
- Full recompute always runs over the complete visible candle array, matching how
  `strategyIndicatorLines` already works today — correct by construction. The
  "just moved one candle during replay" incremental path recomputes over a bounded
  trailing window sized generously per indicator (e.g. enough bars for an EMA to
  have converged) rather than truly-incremental streaming math — the same category
  of approximation the existing strategy-overlay system already makes for its own
  incremental path, so this isn't a new risk introduced by this feature.

### Data model & persistence — mirrors the existing `drawings` pattern exactly

New table `chart_indicators`:

```
id, symbol, type, params_json, style_json, position, created_at, updated_at
```

indexed on `symbol`, same shape as the `drawings` table. `position` orders stacked
oscillator panes; overlay-type rows ignore it.

- **Repository** (`src/main/database/repositories.ts`): `listChartIndicators(symbol)`,
  `saveChartIndicator(row)`, `deleteChartIndicator(id)`, `clearChartIndicators(symbol)`
  — same signatures/shapes as the existing drawing repository functions.
- **IPC** (`src/shared/ipc.ts`, `src/main/ipc.ts`): `CHART_INDICATORS_LIST/SAVE/DELETE/CLEAR`
  channels, handlers delegating straight to the repository — mirrors
  `DRAWINGS_*` exactly.
- **Preload** (`src/preload/index.ts`): `chartIndicators.list/save/delete/clear`
  bridge methods.
- **Store** (`useAppStore.ts`): new `chartIndicators: ChartIndicator[]` field,
  `loadChartIndicatorsForSymbol(symbol)` (race-guarded against rapid symbol
  switching, same technique as `loadDrawingsForSymbol`), wired into the *same*
  symbol-change subscriber that already loads drawings so both load together.
  Actions: `addChartIndicator(type)` (looks up catalog defaults, generates an id,
  appends, persists), `updateChartIndicatorParams(id, patch)`,
  `updateChartIndicatorStyle(id, patch)`, `removeChartIndicator(id)` — each persists
  via the preload bridge, following the debounced-save pattern drawings already use
  for rapid edits (e.g. dragging a param slider) if the implementer finds that
  necessary; a plain save-on-change is fine if edits aren't rapid enough to need it.

```ts
interface ChartIndicator {
  id: string
  type: IndicatorType
  params: Record<string, number>
  style: { color: string; lineWidth?: number }
  position: number
}
```

### `ChartPanel.tsx` integration

- New `chartIndicatorSeriesRef` (a parallel structure to the existing
  `indicatorsRef`, deliberately kept separate rather than merged — one is driven by
  strategy settings, the other by the user's own list, and merging them would
  tangle two independent concerns for no benefit).
- New `chartIndicatorPaneRef: Map<string, number>` tracking which pane index each
  oscillator-type instance owns.
- A new sync effect (parallel to `syncOverlays`, following the same diff-by-id
  add/update/remove shape) that:
  - For each `overlay`-category instance: adds/updates/removes a `LineSeries` (or,
    for Bollinger, three) on pane 0 — same mechanism `syncOverlays` already uses.
  - For each `oscillator`-category instance: calls `chart.addPane()` once (caching
    the resulting index), adds its line/histogram series into that pane via
    `chart.addSeries(seriesType, options, paneIndex)`. Removing the instance calls
    `chart.removePane(index)`.
  - Multiple instances of the same type are allowed (e.g. two SMAs at different
    periods) — each is independent, keyed by its own instance id, matching
    TradingView's own behavior. Each new instance's default color comes from a
    fixed rotation (not always the catalog's single default color), so two SMAs
    added back-to-back are visually distinguishable without the user having to
    manually recolor one of them.

### UI

- **Indicators button** near the existing `DrawingToolbar`, opening a popover
  grouped into "Overlays" / "Oscillators" listing the 10 catalog entries — clicking
  one calls `addChartIndicator(type)` with catalog defaults, the same one-click
  "add it" interaction `DrawingToolbar`'s tool buttons already use.
- **Legend row** at the top of the chart, one row per active instance (e.g.
  `SMA(20)` with a color swatch), with a gear icon and a close icon per row — gear
  opens a small param/color editor generated from the catalog's `paramSchema`
  (reusing the number-input pattern `StrategyPanel.tsx` already uses for
  `lookback`, and the popover-positioning pattern `DrawingStyleMenu.tsx` already
  uses), close calls `removeChartIndicator(id)`.

## Testing

- Pure unit tests for every new compute function in a new
  `tests/indicatorLibrary.test.ts`, checked against known reference values for each
  indicator (e.g. a hand-computed SMA/EMA/RSI over a small fixed candle series) —
  same style as the existing `tests/indicators.test.ts` (which stays untouched,
  since it tests the separate strategy-overlay system).
- No component test harness exists for `ChartPanel.tsx` or the drawings/persistence
  IPC glue today (confirmed — same situation the replay-follow-mode and lazy-loading
  work already documented), so the UI/persistence/chart-integration side is verified
  manually: `npm run dev`, add each of the 10 indicator types, confirm it renders
  with correct values, edit its parameters, remove it, reload the app and confirm it
  came back (persistence), and confirm oscillator panes appear/disappear cleanly.
- `npm run typecheck`, `npm test`, `npm run build` as the automated gate, consistent
  with every other plan in this codebase.

## Prior art check

Searched `docs/superpowers/specs/` and `docs/superpowers/plans/` — no prior design
discusses or rejects a user-facing indicator picker; "indicator" only appears
incidentally in the lazy-loading and replay-follow-mode docs, neither of which
proposes changing the indicator model. This is genuinely new ground, not a revisit
of a previously-deferred decision.
