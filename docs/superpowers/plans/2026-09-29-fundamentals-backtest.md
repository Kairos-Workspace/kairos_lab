# Fundamentals During Backtest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in bottom-row Fundamentals panel that shows Fed funds, unemployment, CPI, NFP, DXY, and FOMC/CPI/NFP calendar context **as of the replay playhead** (or latest candle in view mode), using bundled offline JSON.

**Architecture:** Pure lookup helpers in `@core/fundamentals` operate on a static `macro.json` bundle imported by the renderer (no IPC in v1). Zustand holds `showFundamentals` (persisted via `DeskPrefs`). `FundamentalsPanel` reads `asOfTs` from mode/replayIndex/displayCandles and renders a compact snapshot; TopBar toggles the preference.

**Tech Stack:** TypeScript, Vitest (`@core` unit tests), Zustand store, React bottom-row panel, existing desk prefs persistence.

**Design doc:** `docs/superpowers/specs/2026-09-29-fundamentals-backtest-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `src/core/fundamentals/types.ts` | Series/event/snapshot types |
| `src/core/fundamentals/asOf.ts` | `latestPoint`, `lastEvent`, `nextEvent`, `resolveFundamentals`, `fundamentalsAsOf` |
| `src/core/fundamentals/macro.json` | Bundled curated US+gold macro history |
| `src/core/fundamentals/README.md` | Coverage dates + how to refresh data |
| `tests/fundamentalsAsOf.test.ts` | Unit tests for lookups + resolve |
| `src/shared/types.ts` | `showFundamentals` on `DeskPrefs` |
| `src/core/desk/prefs.ts` | Default + parse for the new pref |
| `tests/desk.test.ts` | Pref round-trip |
| `src/renderer/src/store/useAppStore.ts` | State, setter, bootstrap + persist |
| `src/renderer/src/components/FundamentalsPanel.tsx` | Bottom panel UI |
| `src/renderer/src/components/Workspace.tsx` | Mount panel when enabled |
| `src/renderer/src/components/TopBar.tsx` | Toggle control |
| `src/renderer/src/styles/global.css` | 4-column bottom + panel styles |

---

### Task 1: Core types + as-of lookup helpers (TDD)

**Files:**
- Create: `src/core/fundamentals/types.ts`
- Create: `src/core/fundamentals/asOf.ts`
- Create: `tests/fundamentalsAsOf.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/fundamentalsAsOf.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  fundamentalsAsOf,
  lastEvent,
  latestPoint,
  nextEvent,
  resolveFundamentals
} from '@core/fundamentals/asOf'
import type { FundamentalEvent, FundamentalSeries } from '@core/fundamentals/types'

const fed: FundamentalSeries = {
  id: 'fed_funds',
  unit: '%',
  points: [
    { ts: 1_000, value: 5.25 },
    { ts: 2_000, value: 5.5 },
    { ts: 3_000, value: 5.25 }
  ]
}

const events: FundamentalEvent[] = [
  { ts: 1_500, kind: 'fomc', title: 'FOMC hold', impact: 'high', actual: 5.25 },
  { ts: 2_500, kind: 'cpi', title: 'CPI YoY', impact: 'high', actual: 3.2, prior: 3.4 },
  { ts: 3_500, kind: 'nfp', title: 'NFP', impact: 'high', actual: 180 }
]

describe('latestPoint', () => {
  it('returns null before the first point', () => {
    expect(latestPoint(fed, 500)).toBeNull()
  })

  it('returns the point on an exact timestamp', () => {
    expect(latestPoint(fed, 2_000)).toEqual({ ts: 2_000, value: 5.5 })
  })

  it('returns the last point at or before asOf', () => {
    expect(latestPoint(fed, 2_500)).toEqual({ ts: 2_000, value: 5.5 })
  })

  it('returns the last point when asOf is after the series', () => {
    expect(latestPoint(fed, 9_999)).toEqual({ ts: 3_000, value: 5.25 })
  })
})

describe('lastEvent / nextEvent', () => {
  it('finds the last event at or before asOf', () => {
    expect(lastEvent(events, 2_600)?.kind).toBe('cpi')
  })

  it('finds the next event after asOf', () => {
    expect(nextEvent(events, 2_000)?.kind).toBe('cpi')
  })

  it('filters by kind', () => {
    expect(nextEvent(events, 1_000, ['nfp'])?.kind).toBe('nfp')
    expect(lastEvent(events, 9_999, ['fomc'])?.kind).toBe('fomc')
  })

  it('returns null when none match', () => {
    expect(nextEvent(events, 9_999)).toBeNull()
    expect(lastEvent(events, 100)).toBeNull()
  })
})

describe('fundamentalsAsOf', () => {
  const candles = [
    { timestamp: 1_000 },
    { timestamp: 2_000 },
    { timestamp: 3_000 }
  ]

  it('uses replayIndex candle in replay mode', () => {
    expect(fundamentalsAsOf({ mode: 'replay', replayIndex: 1, displayCandles: candles })).toBe(2_000)
  })

  it('uses the last candle in view mode', () => {
    expect(fundamentalsAsOf({ mode: 'view', replayIndex: 0, displayCandles: candles })).toBe(3_000)
  })

  it('returns null when the tape is empty', () => {
    expect(fundamentalsAsOf({ mode: 'view', replayIndex: 0, displayCandles: [] })).toBeNull()
  })
})

describe('resolveFundamentals', () => {
  it('builds a snapshot from series + events', () => {
    const snap = resolveFundamentals(
      {
        series: [fed, { id: 'unemployment', unit: '%', points: [{ ts: 1_800, value: 4.1 }] }],
        events
      },
      2_600
    )
    expect(snap.fedFunds?.value).toBe(5.5)
    expect(snap.unemployment?.value).toBe(4.1)
    expect(snap.lastEvent?.kind).toBe('cpi')
    expect(snap.nextEvent?.kind).toBe('nfp')
    expect(snap.justPrinted).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- tests/fundamentalsAsOf.test.ts`

Expected: FAIL (module not found / exports missing).

- [ ] **Step 3: Implement types**

Create `src/core/fundamentals/types.ts`:

```ts
export type FundamentalSeriesId = 'fed_funds' | 'unemployment' | 'cpi_yoy' | 'nfp' | 'dxy'

export type FundamentalEventKind = 'fomc' | 'cpi' | 'nfp' | 'other'

export interface FundamentalPoint {
  ts: number
  value: number
}

export interface FundamentalSeries {
  id: FundamentalSeriesId
  unit: string
  points: FundamentalPoint[]
}

export interface FundamentalEvent {
  ts: number
  kind: FundamentalEventKind
  title: string
  actual?: number
  prior?: number
  impact: 'high' | 'medium'
}

export interface FundamentalBundle {
  series: FundamentalSeries[]
  events: FundamentalEvent[]
}

export interface FundamentalSnapshot {
  asOfTs: number
  fedFunds: FundamentalPoint | null
  unemployment: FundamentalPoint | null
  cpiYoy: FundamentalPoint | null
  nfp: FundamentalPoint | null
  dxy: FundamentalPoint | null
  lastEvent: FundamentalEvent | null
  nextEvent: FundamentalEvent | null
  /** True when lastEvent falls on the same UTC calendar day as asOfTs. */
  justPrinted: boolean
}
```

- [ ] **Step 4: Implement helpers**

Create `src/core/fundamentals/asOf.ts`:

```ts
import type {
  FundamentalBundle,
  FundamentalEvent,
  FundamentalEventKind,
  FundamentalPoint,
  FundamentalSeries,
  FundamentalSeriesId,
  FundamentalSnapshot
} from './types'

export function latestPoint(series: FundamentalSeries, asOfTs: number): FundamentalPoint | null {
  const pts = series.points
  if (pts.length === 0 || asOfTs < pts[0].ts) return null
  let lo = 0
  let hi = pts.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (pts[mid].ts <= asOfTs) lo = mid + 1
    else hi = mid - 1
  }
  return hi >= 0 ? pts[hi] : null
}

export function lastEvent(
  events: FundamentalEvent[],
  asOfTs: number,
  kinds?: FundamentalEventKind[]
): FundamentalEvent | null {
  const allow = kinds ? new Set(kinds) : null
  let best: FundamentalEvent | null = null
  for (const ev of events) {
    if (ev.ts > asOfTs) break
    if (allow && !allow.has(ev.kind)) continue
    best = ev
  }
  return best
}

export function nextEvent(
  events: FundamentalEvent[],
  asOfTs: number,
  kinds?: FundamentalEventKind[]
): FundamentalEvent | null {
  const allow = kinds ? new Set(kinds) : null
  for (const ev of events) {
    if (ev.ts <= asOfTs) continue
    if (allow && !allow.has(ev.kind)) continue
    return ev
  }
  return null
}

function sameUtcDay(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  )
}

function seriesById(bundle: FundamentalBundle, id: FundamentalSeriesId): FundamentalSeries | null {
  return bundle.series.find((s) => s.id === id) ?? null
}

export function resolveFundamentals(bundle: FundamentalBundle, asOfTs: number): FundamentalSnapshot {
  const pick = (id: FundamentalSeriesId): FundamentalPoint | null => {
    const s = seriesById(bundle, id)
    return s ? latestPoint(s, asOfTs) : null
  }
  const last = lastEvent(bundle.events, asOfTs, ['fomc', 'cpi', 'nfp'])
  const next = nextEvent(bundle.events, asOfTs, ['fomc', 'cpi', 'nfp'])
  return {
    asOfTs,
    fedFunds: pick('fed_funds'),
    unemployment: pick('unemployment'),
    cpiYoy: pick('cpi_yoy'),
    nfp: pick('nfp'),
    dxy: pick('dxy'),
    lastEvent: last,
    nextEvent: next,
    justPrinted: last != null && sameUtcDay(last.ts, asOfTs)
  }
}

export function fundamentalsAsOf(state: {
  mode: 'view' | 'replay'
  replayIndex: number
  displayCandles: { timestamp: number }[]
}): number | null {
  const { displayCandles, mode, replayIndex } = state
  if (displayCandles.length === 0) return null
  if (mode === 'replay') return displayCandles[replayIndex]?.timestamp ?? null
  return displayCandles.at(-1)?.timestamp ?? null
}
```

**Note:** `lastEvent` / `nextEvent` assume `events` are sorted ascending by `ts` (enforced when building `macro.json`).

- [ ] **Step 5: Run tests — expect PASS**

Run: `npm test -- tests/fundamentalsAsOf.test.ts`

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/fundamentals/types.ts src/core/fundamentals/asOf.ts tests/fundamentalsAsOf.test.ts
git commit -m "feat(fundamentals): add as-of lookup helpers"
```

---

### Task 2: Bundled macro dataset

**Files:**
- Create: `src/core/fundamentals/macro.json`
- Create: `src/core/fundamentals/README.md`
- Create: `src/core/fundamentals/bundle.ts`

- [ ] **Step 1: Add a curated JSON bundle**

Create `src/core/fundamentals/macro.json` with **sorted** series and events covering at least **2020-01-01 → 2025-12-31** (enough for typical XAUUSD desks). Include:

- `fed_funds` — FOMC target upper bound changes (percentage points)
- `unemployment` — monthly U-3 rate
- `cpi_yoy` — monthly CPI YoY %
- `nfp` — monthly nonfarm payrolls change (thousands)
- `dxy` — weekly or monthly USD index closes (proxy OK)
- `events` — high-impact `fomc` / `cpi` / `nfp` rows aligned with those prints (`title`, `actual`, optional `prior`)

Minimum density: enough points that scrubbing a 2022–2024 replay visibly changes Fed/CPI/NFP rows (do not ship empty arrays).

Shape:

```json
{
  "series": [
    { "id": "fed_funds", "unit": "%", "points": [{ "ts": 1577836800000, "value": 1.75 }] },
    { "id": "unemployment", "unit": "%", "points": [] },
    { "id": "cpi_yoy", "unit": "%", "points": [] },
    { "id": "nfp", "unit": "k", "points": [] },
    { "id": "dxy", "unit": "idx", "points": [] }
  ],
  "events": [
    {
      "ts": 1577836800000,
      "kind": "fomc",
      "title": "FOMC",
      "impact": "high",
      "actual": 1.75
    }
  ]
}
```

Replace the placeholder single points with a real curated set when writing the file (public FRED / BLS historical values are fine; keep the file under ~200KB).

- [ ] **Step 2: README**

Create `src/core/fundamentals/README.md`:

```md
# Fundamentals bundle

Offline US + gold-relevant macro history for Kairos backtests.

- **Coverage:** document the exact `YYYY-MM` start/end you put in `macro.json`
- **As-of rule:** latest observation with `ts <=` replay candle time
- **Refresh:** replace `macro.json` and bump this README coverage line; no API in v1

Sources used for this file: (list FRED series ids / BLS tables you copied).
```

- [ ] **Step 3: Export a typed loader**

Create `src/core/fundamentals/bundle.ts`:

```ts
import raw from './macro.json'
import type { FundamentalBundle } from './types'

export const FUNDAMENTALS_BUNDLE = raw as FundamentalBundle

export function getFundamentalsBundle(): FundamentalBundle {
  return FUNDAMENTALS_BUNDLE
}
```

If the repo’s TS config rejects JSON imports, add `"resolveJsonModule": true` under `compilerOptions` in the tsconfig that covers `@core` (check `tsconfig.json` / `tsconfig.node.json` / project references — enable only where needed). Alternatively cast via:

```ts
import raw from './macro.json' with { type: 'json' }
```

Use whichever form already works for other JSON imports in the repo; if none exist, prefer `resolveJsonModule: true`.

- [ ] **Step 4: Smoke-test resolve against the real bundle**

Add to `tests/fundamentalsAsOf.test.ts`:

```ts
import { getFundamentalsBundle } from '@core/fundamentals/bundle'

describe('bundled macro.json', () => {
  it('resolves a mid-2023 snapshot without throwing', () => {
    const asOf = Date.UTC(2023, 5, 15)
    const snap = resolveFundamentals(getFundamentalsBundle(), asOf)
    expect(snap.asOfTs).toBe(asOf)
    // At least one core series should be populated in a healthy bundle
    expect(
      snap.fedFunds != null || snap.cpiYoy != null || snap.unemployment != null
    ).toBe(true)
  })
})
```

Run: `npm test -- tests/fundamentalsAsOf.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/fundamentals/macro.json src/core/fundamentals/README.md src/core/fundamentals/bundle.ts tests/fundamentalsAsOf.test.ts
git commit -m "feat(fundamentals): bundle curated US+gold macro history"
```

---

### Task 3: Persist `showFundamentals` preference

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/core/desk/prefs.ts`
- Modify: `tests/desk.test.ts`
- Modify: `src/renderer/src/store/useAppStore.ts`

- [ ] **Step 1: Extend `DeskPrefs`**

In `src/shared/types.ts`, inside `DeskPrefs`, add:

```ts
  showFundamentals: boolean
```

- [ ] **Step 2: Defaults + parse**

In `src/core/desk/prefs.ts`:

1. Add to `DEFAULT_DESK_PREFS`:

```ts
  showFundamentals: false
```

2. In `parseDeskPrefs` return object, add:

```ts
    showFundamentals: row.showFundamentals === true,
```

- [ ] **Step 3: Update desk tests**

In `tests/desk.test.ts`:

1. In the valid snapshot test, pass `showFundamentals: true` and assert `prefs.showFundamentals === true`.
2. Add:

```ts
  it('defaults showFundamentals to false', () => {
    expect(parseDeskPrefs({}).showFundamentals).toBe(false)
    expect(parseDeskPrefs({ showFundamentals: 'yes' }).showFundamentals).toBe(false)
  })
```

Run: `npm test -- tests/desk.test.ts`  
Expected: PASS.

- [ ] **Step 4: Wire the store**

In `src/renderer/src/store/useAppStore.ts`:

1. On `AppState` interface, add:

```ts
  showFundamentals: boolean
  setShowFundamentals: (show: boolean) => void
```

2. Initial state:

```ts
  showFundamentals: false,
```

3. Extend `deskFromState` input + return to include `showFundamentals: state.showFundamentals`.

4. In `bootstrap` `set({...})` after loading prefs, add:

```ts
        showFundamentals: prefs.showFundamentals,
```

5. Implement action (call `persistDesk` like other prefs):

```ts
  setShowFundamentals: (show) => {
    set({ showFundamentals: show })
    persistDesk()
  },
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`  
Expected: PASS (fix any call sites constructing `DeskPrefs` literals).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/core/desk/prefs.ts tests/desk.test.ts src/renderer/src/store/useAppStore.ts
git commit -m "feat(fundamentals): persist showFundamentals desk preference"
```

---

### Task 4: `FundamentalsPanel` + workspace layout

**Files:**
- Create: `src/renderer/src/components/FundamentalsPanel.tsx`
- Modify: `src/renderer/src/components/Workspace.tsx`
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Build the panel**

Create `src/renderer/src/components/FundamentalsPanel.tsx`:

```tsx
import { getFundamentalsBundle } from '@core/fundamentals/bundle'
import { fundamentalsAsOf, resolveFundamentals } from '@core/fundamentals/asOf'
import { useAppStore } from '../store/useAppStore'

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

function fmtWhen(ts: number | null | undefined): string {
  if (ts == null) return '—'
  return new Date(ts).toISOString().slice(0, 10)
}

export function FundamentalsPanel(): React.JSX.Element {
  const mode = useAppStore((s) => s.mode)
  const replayIndex = useAppStore((s) => s.replayIndex)
  const displayCandles = useAppStore((s) => s.displayCandles)

  const asOfTs = fundamentalsAsOf({ mode, replayIndex, displayCandles })
  const snap = asOfTs != null ? resolveFundamentals(getFundamentalsBundle(), asOfTs) : null

  return (
    <section className="fundamentals-panel" data-hot={snap?.justPrinted ? 'true' : undefined}>
      <h3>Fundamentals</h3>
      {!snap ? (
        <p className="fundamentals-empty">Load a tape to see macro context.</p>
      ) : (
        <dl className="fundamentals-grid">
          <div>
            <dt>Fed funds</dt>
            <dd>{fmt(snap.fedFunds?.value)}%</dd>
          </div>
          <div>
            <dt>Unemployment</dt>
            <dd>{fmt(snap.unemployment?.value)}%</dd>
          </div>
          <div>
            <dt>CPI YoY</dt>
            <dd>{fmt(snap.cpiYoy?.value)}%</dd>
          </div>
          <div>
            <dt>NFP</dt>
            <dd>{snap.nfp ? `${fmt(snap.nfp.value, 0)}k` : '—'}</dd>
          </div>
          <div>
            <dt>DXY</dt>
            <dd>{fmt(snap.dxy?.value, 1)}</dd>
          </div>
          <div className="fundamentals-cal" data-hot={snap.justPrinted ? 'true' : undefined}>
            <dt>Last event</dt>
            <dd>
              {snap.lastEvent
                ? `${snap.lastEvent.title} · ${fmtWhen(snap.lastEvent.ts)}`
                : '—'}
            </dd>
          </div>
          <div className="fundamentals-cal">
            <dt>Next event</dt>
            <dd>
              {snap.nextEvent
                ? `${snap.nextEvent.title} · ${fmtWhen(snap.nextEvent.ts)}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>As of</dt>
            <dd>{fmtWhen(snap.asOfTs)}</dd>
          </div>
        </dl>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Mount in Workspace**

In `src/renderer/src/components/Workspace.tsx`:

```tsx
import { FundamentalsPanel } from './FundamentalsPanel'
// ...
  const chartFull = useAppStore((s) => s.chartFull)
  const showFundamentals = useAppStore((s) => s.showFundamentals)
// ...
      {chartFull ? null : (
        <div className="bottom" data-fundamentals={showFundamentals ? 'true' : undefined}>
          <PerformancePanel />
          <EquityCurve />
          <TradeHistory />
          {showFundamentals ? <FundamentalsPanel /> : null}
        </div>
      )}
```

- [ ] **Step 3: CSS**

In `src/renderer/src/styles/global.css`, update `.bottom` and add panel rules:

```css
.bottom {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 420px;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: var(--ink);
}

.bottom[data-fundamentals='true'] {
  grid-template-columns: 220px minmax(0, 1fr) minmax(280px, 360px) minmax(220px, 280px);
}

.fundamentals-panel h3 {
  margin: 0 0 8px;
}

.fundamentals-empty {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}

.fundamentals-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 12px;
  margin: 0;
  font-size: 12px;
}

.fundamentals-grid dt {
  color: var(--muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.fundamentals-grid dd {
  margin: 2px 0 0;
  font-family: 'IBM Plex Mono', monospace;
}

.fundamentals-cal[data-hot='true'] dd {
  color: var(--brand);
}
```

Also update the mobile/media query block that restyles `.bottom` (around the existing `@media` near line 3425) so `data-fundamentals='true'` stacks cleanly (single column / auto rows is fine).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/FundamentalsPanel.tsx src/renderer/src/components/Workspace.tsx src/renderer/src/styles/global.css
git commit -m "feat(fundamentals): add bottom Fundamentals panel"
```

---

### Task 5: TopBar toggle

**Files:**
- Modify: `src/renderer/src/components/TopBar.tsx`

- [ ] **Step 1: Add the control**

In `TopBar.tsx`, next to the existing readout/speed controls (in `top-controls`), add:

```tsx
  const showFundamentals = useAppStore((s) => s.showFundamentals)
  const setShowFundamentals = useAppStore((s) => s.setShowFundamentals)
```

And in the JSX (after the Speed dropdown group is fine):

```tsx
        <button
          type="button"
          className="icon-btn"
          data-active={showFundamentals}
          title={showFundamentals ? 'Hide fundamentals' : 'Show fundamentals'}
          aria-label={showFundamentals ? 'Hide fundamentals' : 'Show fundamentals'}
          aria-pressed={showFundamentals}
          onClick={() => setShowFundamentals(!showFundamentals)}
        >
          <span className="fx-pill">FX</span>
        </button>
```

Prefer a clearer label if an existing `Icon` name fits (e.g. chart/stats); if not, use text:

```tsx
          Fund
```

inside the button instead of `fx-pill` (avoid colliding with the Pine `fx` chart button). Final label: **`Fund`**.

- [ ] **Step 2: Manual check in `npm run dev`**

1. Open workspace → bottom row has 3 panels.  
2. Click **Fund** → fourth panel appears; Fed/CPI/etc. populate for the current tape date.  
3. Start replay, scrub/play → **As of** and series update with the playhead.  
4. Reload app → toggle state restored from prefs.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/TopBar.tsx
git commit -m "feat(fundamentals): add TopBar toggle for fundamentals panel"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full unit suite**

Run: `npm test`  
Expected: PASS (including `fundamentalsAsOf` + `desk`).

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`  
Expected: PASS.

- [ ] **Step 3: Spec coverage checklist**

Confirm each design requirement is done:

| Spec item | Task |
|-----------|------|
| Opt-in toggle, default off | 3, 5 |
| Persist in DeskPrefs | 3 |
| Bottom 4th panel | 4 |
| As-of playhead / view last candle | 1, 4 |
| Fed, Unemployment, CPI, NFP, DXY | 2, 4 |
| Last + next calendar events | 1, 4 |
| justPrinted highlight | 1, 4 |
| Bundled offline JSON | 2 |
| No chart markers | (intentionally omitted) |

- [ ] **Step 4: No further commit unless fixing issues found in verification**

---

## Self-review (plan vs spec)

1. **Spec coverage:** Toggle, prefs, bottom panel, as-of clock, series set, calendar last/next, bundled data, highlight, tests — all tasked. Chart markers / FRED / auto-pause correctly omitted.  
2. **Placeholders:** None — concrete files, tests, and commands.  
3. **Types:** `FundamentalSeriesId`, `FundamentalSnapshot`, `showFundamentals` naming is consistent across tasks.
