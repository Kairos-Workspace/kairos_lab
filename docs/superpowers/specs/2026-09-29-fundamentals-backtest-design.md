# Fundamentals during backtest — design

## Context

Kairos is a desktop strategy tester / market replay. Traders often care about
**macro context at the moment of the candle** (Fed funds, unemployment, CPI,
NFP, FOMC, USD strength) — not only price. Today the desk bottom row shows
Performance, Equity, and Trade history only. There is no fundamental /
economic calendar layer.

Users want an **opt-in** fundamentals section that stays in sync with the
replay playhead: values and events as they were known **at that historical
time** (not today’s prints pasted onto the past). Nothing should be drawn
on the price chart in v1.

## Goal

When the user enables **Show fundamentals**, add a fourth bottom-row panel
that displays US + gold-relevant macro state **as of the current chart
time** (replay index timestamp, or latest visible candle in view mode).

## Non-goals (v1)

- Markers, lines, or labels drawn on the candlestick chart
- Live FRED / API fetch or automatic online refresh
- Auto-pause replay on high-impact releases
- Per-symbol country packs (EU, UK, JP, etc.)
- Forecasting or “expected vs actual” surprise models beyond storing
  actuals when present in the bundled file

## Decisions (approved)

| Topic | Choice |
|-------|--------|
| Placement | New bottom-row panel next to Performance / Equity / Trades |
| Time basis | As-of playhead / chart “now” (historical real-time) |
| Series set | US core + gold-relevant (Fed, Unemployment, CPI, NFP, FOMC, DXY/USD) |
| Data | Bundled historical JSON (offline, deterministic) |
| Default | Toggle **off**; panel hidden until enabled |

## Design

### 1. Preference + toggle

- Add `showFundamentals: boolean` (default `false`) to app state and
  `DeskPrefs` so it persists with the desk.
- Surface a clear control on the desk (recommended: TopBar or Replay bar
  checkbox / icon toggle labeled **Fundamentals**).
- When `false`: do not mount the fundamentals panel (bottom grid stays
  3 columns as today).
- When `true`: bottom row becomes 4 columns; fundamentals panel visible
  in desk layout (hidden in chart-full frame, same as other bottom
  panels).

### 2. Bottom panel UI — `FundamentalsPanel`

Mount in `Workspace.tsx` bottom row when `showFundamentals` is true:

```
[ Performance ] [ Equity ] [ Trade history ] [ Fundamentals ]
```

Panel content (all resolved **as of** `asOfTs`):

| Block | Content |
|-------|---------|
| Rates | Fed funds level + last decision date / direction if available |
| Labor | Unemployment %; last NFP print (actual when present) |
| Inflation | CPI YoY last print |
| USD | DXY (or USD index proxy) last value with `ts ≤ asOfTs` |
| Calendar | Last high-impact event with `ts ≤ asOfTs`; next FOMC / CPI / NFP with `ts > asOfTs` |

**Highlight:** if an event’s timestamp falls on or within a small window of
the current bar (e.g. same calendar day as the playhead candle, or within
one bar interval), mark that row as “just printed” (subtle accent — not a
chart overlay).

Empty / missing data: show `—` for that field; do not block replay.

### 3. Clock source (`asOfTs`)

```ts
function fundamentalsAsOf(state): number | null {
  if (state.displayCandles.length === 0) return null
  if (state.mode === 'replay') {
    return state.displayCandles[state.replayIndex]?.timestamp ?? null
  }
  return state.displayCandles.at(-1)?.timestamp ?? null
}
```

Panel re-reads when `replayIndex`, `mode`, or `displayCandles` change.
No need to throttle beyond normal React/store updates; lookups are O(log n)
on sorted series.

### 4. Bundled data

**Location:** `data/fundamentals/` (already copied via electron-builder
`extraResources`), e.g.:

- `data/fundamentals/series.json` — level series
- `data/fundamentals/events.json` — discrete calendar events  

Or a single `macro.json` if smaller and simpler.

**Shapes (illustrative):**

```ts
interface FundamentalPoint {
  ts: number // unix ms UTC
  value: number
}

interface FundamentalSeries {
  id: 'fed_funds' | 'unemployment' | 'cpi_yoy' | 'nfp' | 'dxy'
  unit: string
  points: FundamentalPoint[] // sorted ascending by ts
}

interface FundamentalEvent {
  ts: number
  kind: 'fomc' | 'cpi' | 'nfp' | 'other'
  title: string
  actual?: number
  prior?: number
  impact: 'high' | 'medium'
}
```

**Lookup helpers** in something like `src/core/fundamentals/asOf.ts`:

- `latestPoint(series, asOfTs)` → last point with `ts ≤ asOfTs`
- `lastEvent(events, asOfTs, kinds?)` / `nextEvent(events, asOfTs, kinds?)`

Load once at app start (main reads file → IPC) or import statically in
renderer if the JSON is small enough to bundle with the renderer build.
Prefer **main-process read + one IPC** if the file may grow; static import
is fine for a compact curated set covering ~2015–present.

**Coverage:** curated US + gold-relevant history sufficient for typical
XAUUSD backtests. Document the date range in a short README beside the
JSON. Updating the file is a data commit, not a product release
requirement for v1.

### 5. Store / IPC sketch

- State: `showFundamentals`, actions `setShowFundamentals(boolean)`.
- Optional: `fundamentalsReady` / cached parsed payload in store after
  first load.
- No change to `ReplayEngine`, strategy evaluation, or trade simulation.

### 6. Layout / CSS

- Extend `.bottom` grid from 3 columns to 4 when fundamentals are shown
  (or always reserve a 4th track that collapses when off).
- Panel styling matches existing bottom cards (header + compact rows,
  mono stats where appropriate).
- Keep readable at the current bottom height (~268px); scroll inside the
  panel if calendar list grows.

## Testing

- Unit tests for `latestPoint` / `lastEvent` / `nextEvent` boundary cases
  (exact ts, between points, before first, after last).
- Component or store test: toggle off → panel not rendered; toggle on →
  rendered; `asOfTs` advances with `replayIndex` and changes resolved
  Fed/CPI fixtures.

## Future (explicitly later)

- Hybrid online refresh (FRED) with local cache
- Chart markers for high-impact events
- Auto-pause on release
- Multi-region calendars
