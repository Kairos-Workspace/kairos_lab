# Chart Indicator Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user add technical indicators to the chart from a picker (10 curated types: SMA, EMA, WMA, Bollinger Bands, VWAP as price overlays; RSI, MACD, Stochastic, ATR, Volume as their own oscillator panes below the chart), edit each one's parameters/color, remove it, and have the set persist per symbol — completely independent of the existing strategy-overlay system.

**Architecture:** A new core indicator library (`src/core/indicators/catalog.ts` + `library.ts`) provides a typed catalog and pure compute functions. Persistence mirrors the existing `drawings` table/IPC/store pattern exactly (`chart_indicators` table, `CHART_INDICATORS_*` IPC channels, `chartIndicators` store state loaded per symbol). `ChartPanel.tsx` gets one new, self-contained sync effect (parallel to the existing strategy-overlay `syncOverlays`, not merged with it) that diffs the user's indicator list against live chart series/panes. Two new small UI components (`IndicatorPicker.tsx`, `IndicatorLegend.tsx` + `IndicatorSettingsModal.tsx`) provide the add/edit/remove UI.

**Tech Stack:** Electron + React (renderer), `lightweight-charts` v5 (`addPane`/`removePane`/`addSeries(..., paneIndex)`), better-sqlite3 (main), Zustand (store), Vitest.

**Design doc:** `docs/superpowers/specs/2026-09-12-chart-indicator-library-design.md`

**Deviations from the design doc (found while planning, don't change the feature's behavior described there):**

1. **No windowed/incremental "last tick" optimization for v1.** The design doc allowed for a bounded trailing-window optimization on the "just moved one candle during replay" path. This plan's sync effect always does a full recompute over the whole visible candle array on every relevant change instead — simpler, unambiguously correct, and consistent with how `strategyIndicatorLines` (the existing strategy-overlay system) already works for its own full-redraw path. If manual testing (Task 12) finds this causes visible lag during fast replay with several indicators active, that's a concrete signal for a follow-up task — not something to speculatively build now.
2. **Oscillator panes rebuild in full whenever the set of active oscillator instances changes** (add or remove one), rather than doing fine-grained per-instance pane insertion/removal. `lightweight-charts`' `removePane(index)` shifts every later pane's index down by one, so incrementally patching individual panes while keeping other instances' cached indices correct is a real bookkeeping hazard; rebuilding all oscillator panes together on membership change sidesteps it entirely, at the cost of one extra recompute pass on the (rare, deliberate) moment a user adds/removes an oscillator-type indicator. Editing an existing instance's params/color does **not** trigger a rebuild — only membership changes do.
3. **Only `color` is user-editable per indicator, not `lineWidth`.** `ChartIndicator.style.lineWidth` exists in the type (defaulted to `1`) for future flexibility, but the settings modal only exposes color and the catalog's numeric params. Exposing line width too is a small, isolated follow-up if wanted — not required by "editable per indicator" as stated.
4. **No `chart_indicators` "clear all" IPC channel.** The `drawings` table has a `clear` operation because `clearDrawings()` (a "clear all drawings for this symbol" feature) already exists and needed it. Nothing in this plan calls for a "clear all indicators" action, so that one channel is left out rather than adding unused code — easy to add later alongside such a feature if requested.

---

### Task 1: Shared types + indicator catalog

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/core/indicators/catalog.ts`
- Test: `tests/indicatorCatalog.test.ts`

- [ ] **Step 1: Add the shared types**

In `src/shared/types.ts`, find the `Drawing` interface:

```ts
export interface Drawing {
  id: string
  symbol: string
  type: DrawingTool
  points: DrawingPoint[]
  text?: string
  style: DrawingStyle
  createdAt: number
  updatedAt: number
}
```

Immediately after its closing `}`, add:

```ts

export type IndicatorType =
  | 'sma'
  | 'ema'
  | 'wma'
  | 'bbands'
  | 'vwap'
  | 'rsi'
  | 'macd'
  | 'stoch'
  | 'atr'
  | 'volume'

export interface ChartIndicatorStyle {
  color: string
  lineWidth?: 1 | 2 | 3 | 4
}

export interface ChartIndicator {
  id: string
  symbol: string
  type: IndicatorType
  params: Record<string, number>
  style: ChartIndicatorStyle
  position: number
  createdAt: number
  updatedAt: number
}
```

- [ ] **Step 2: Write the failing test for the catalog**

Create `tests/indicatorCatalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { INDICATOR_CATALOG, defaultParams, nextIndicatorColor } from '@core/indicators/catalog'

describe('INDICATOR_CATALOG', () => {
  it('has exactly the ten curated indicator types', () => {
    expect(INDICATOR_CATALOG.map((spec) => spec.id).sort()).toEqual(
      ['atr', 'bbands', 'ema', 'macd', 'rsi', 'sma', 'stoch', 'volume', 'vwap', 'wma'].sort()
    )
  })

  it('splits into overlay and oscillator categories', () => {
    const overlays = INDICATOR_CATALOG.filter((s) => s.category === 'overlay').map((s) => s.id)
    const oscillators = INDICATOR_CATALOG.filter((s) => s.category === 'oscillator').map((s) => s.id)
    expect(overlays.sort()).toEqual(['bbands', 'ema', 'sma', 'vwap', 'wma'].sort())
    expect(oscillators.sort()).toEqual(['atr', 'macd', 'rsi', 'stoch', 'volume'].sort())
  })

  it('builds default params from a spec', () => {
    const sma = INDICATOR_CATALOG.find((s) => s.id === 'sma')!
    expect(defaultParams(sma)).toEqual({ period: 20 })
    const macd = INDICATOR_CATALOG.find((s) => s.id === 'macd')!
    expect(defaultParams(macd)).toEqual({ fast: 12, slow: 26, signal: 9 })
  })

  it('rotates through colors for repeated instances of the same type', () => {
    const first = nextIndicatorColor(0)
    const second = nextIndicatorColor(1)
    expect(first).not.toBe(second)
    expect(nextIndicatorColor(0)).toBe(first)
  })
})
```

- [ ] **Step 3: Run it, confirm it fails**

Run: `npx vitest run tests/indicatorCatalog.test.ts`
Expected: FAIL — `Cannot find module '@core/indicators/catalog'` (module doesn't exist yet).

- [ ] **Step 4: Implement the catalog**

Create `src/core/indicators/catalog.ts`:

```ts
import type { IndicatorType } from '@shared/types'

export type IndicatorCategory = 'overlay' | 'oscillator'

export interface IndicatorParamDef {
  key: string
  label: string
  min: number
  max: number
  step: number
  default: number
}

export interface IndicatorTypeSpec {
  id: IndicatorType
  label: string
  category: IndicatorCategory
  params: IndicatorParamDef[]
  defaultColor: string
}

export const INDICATOR_CATALOG: IndicatorTypeSpec[] = [
  {
    id: 'sma',
    label: 'Moving Average (Simple)',
    category: 'overlay',
    params: [{ key: 'period', label: 'Period', min: 1, max: 500, step: 1, default: 20 }],
    defaultColor: '#5dcec0'
  },
  {
    id: 'ema',
    label: 'Moving Average (Exponential)',
    category: 'overlay',
    params: [{ key: 'period', label: 'Period', min: 1, max: 500, step: 1, default: 20 }],
    defaultColor: '#d4a574'
  },
  {
    id: 'wma',
    label: 'Moving Average (Weighted)',
    category: 'overlay',
    params: [{ key: 'period', label: 'Period', min: 1, max: 500, step: 1, default: 20 }],
    defaultColor: '#8b9bb4'
  },
  {
    id: 'bbands',
    label: 'Bollinger Bands',
    category: 'overlay',
    params: [
      { key: 'period', label: 'Period', min: 1, max: 200, step: 1, default: 20 },
      { key: 'stdDev', label: 'Std Dev', min: 0.1, max: 5, step: 0.1, default: 2 }
    ],
    defaultColor: '#4a45d4'
  },
  {
    id: 'vwap',
    label: 'VWAP',
    category: 'overlay',
    params: [],
    defaultColor: '#c9863a'
  },
  {
    id: 'rsi',
    label: 'RSI',
    category: 'oscillator',
    params: [{ key: 'period', label: 'Period', min: 1, max: 200, step: 1, default: 14 }],
    defaultColor: '#5dcec0'
  },
  {
    id: 'macd',
    label: 'MACD',
    category: 'oscillator',
    params: [
      { key: 'fast', label: 'Fast', min: 1, max: 100, step: 1, default: 12 },
      { key: 'slow', label: 'Slow', min: 1, max: 200, step: 1, default: 26 },
      { key: 'signal', label: 'Signal', min: 1, max: 100, step: 1, default: 9 }
    ],
    defaultColor: '#4a45d4'
  },
  {
    id: 'stoch',
    label: 'Stochastic',
    category: 'oscillator',
    params: [
      { key: 'kPeriod', label: '%K', min: 1, max: 100, step: 1, default: 14 },
      { key: 'dPeriod', label: '%D', min: 1, max: 100, step: 1, default: 3 }
    ],
    defaultColor: '#d4a574'
  },
  {
    id: 'atr',
    label: 'ATR',
    category: 'oscillator',
    params: [{ key: 'period', label: 'Period', min: 1, max: 200, step: 1, default: 14 }],
    defaultColor: '#e07a5f'
  },
  {
    id: 'volume',
    label: 'Volume',
    category: 'oscillator',
    params: [],
    defaultColor: '#8b9bb4'
  }
]

export function defaultParams(spec: IndicatorTypeSpec): Record<string, number> {
  return Object.fromEntries(spec.params.map((p) => [p.key, p.default]))
}

const INDICATOR_COLOR_ROTATION = ['#5dcec0', '#4a45d4', '#d4a574', '#e07a5f', '#8b9bb4', '#c9863a']

export function nextIndicatorColor(existingCountOfSameType: number): string {
  return INDICATOR_COLOR_ROTATION[existingCountOfSameType % INDICATOR_COLOR_ROTATION.length]
}
```

- [ ] **Step 5: Run it, confirm it passes**

Run: `npx vitest run tests/indicatorCatalog.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/core/indicators/catalog.ts tests/indicatorCatalog.test.ts
git commit -m "$(cat <<'EOF'
Add chart indicator types and a 10-indicator catalog

ChartIndicator/IndicatorType in shared types, plus a catalog
(src/core/indicators/catalog.ts) describing each of the 10 curated
indicator types this feature ships with — label, overlay/oscillator
category, editable params with bounds, and a default color. Nothing
reads this yet.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Compute library — moving averages (SMA/EMA/WMA)

**Files:**
- Create: `src/core/indicators/library.ts`
- Test: `tests/indicatorLibrary.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/indicatorLibrary.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { computeSma, computeEma, computeWma } from '@core/indicators/library'
import { series } from './helpers'

const start = Date.UTC(2025, 5, 10, 8, 0, 0)
const MIN = 60_000

describe('computeSma', () => {
  it('averages the trailing window of closes', () => {
    const bars = series(start, MIN, [10, 20, 30, 40, 50])
    const points = computeSma(bars, 3)
    expect(points).toHaveLength(3)
    expect(points[0].value).toBeCloseTo(20) // (10+20+30)/3
    expect(points[1].value).toBeCloseTo(30) // (20+30+40)/3
    expect(points[2].value).toBeCloseTo(40) // (30+40+50)/3
    expect(points[0].timestamp).toBe(bars[2].timestamp)
  })

  it('produces no points until the period is reached', () => {
    const bars = series(start, MIN, [10, 20])
    expect(computeSma(bars, 3)).toEqual([])
  })
})

describe('computeEma', () => {
  it('seeds with an SMA then applies exponential smoothing', () => {
    const bars = series(start, MIN, [10, 20, 30, 40, 50])
    const points = computeEma(bars, 3)
    expect(points).toHaveLength(3)
    // Seed: SMA(10,20,30) = 20. k = 2/(3+1) = 0.5.
    expect(points[0].value).toBeCloseTo(20)
    // Next: 40*0.5 + 20*0.5 = 30
    expect(points[1].value).toBeCloseTo(30)
    // Next: 50*0.5 + 30*0.5 = 40
    expect(points[2].value).toBeCloseTo(40)
  })
})

describe('computeWma', () => {
  it('weights recent bars more heavily', () => {
    const bars = series(start, MIN, [10, 20, 30])
    const points = computeWma(bars, 3)
    expect(points).toHaveLength(1)
    // weights 1,2,3 over closes 10,20,30: (10*1+20*2+30*3)/(1+2+3) = 140/6
    expect(points[0].value).toBeCloseTo(140 / 6)
  })
})
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx vitest run tests/indicatorLibrary.test.ts`
Expected: FAIL — `Cannot find module '@core/indicators/library'`.

- [ ] **Step 3: Implement the moving averages**

Create `src/core/indicators/library.ts`:

```ts
import type { Candle } from '@shared/types'
import { sma } from './math'

export interface IndicatorLinePoint {
  timestamp: number
  value: number
}

export interface IndicatorLineResult {
  id: string
  label: string
  points: IndicatorLinePoint[]
}

export function computeSma(candles: Candle[], period: number): IndicatorLinePoint[] {
  const points: IndicatorLinePoint[] = []
  for (let i = 0; i < candles.length; i++) {
    const window = candles.slice(Math.max(0, i + 1 - period), i + 1)
    const value = sma(window, period)
    if (value != null) points.push({ timestamp: candles[i].timestamp, value })
  }
  return points
}

export function computeEma(candles: Candle[], period: number): IndicatorLinePoint[] {
  const points: IndicatorLinePoint[] = []
  const k = 2 / (period + 1)
  let prev: number | null = null
  for (let i = 0; i < candles.length; i++) {
    if (i + 1 < period) continue
    if (prev == null) {
      const window = candles.slice(i + 1 - period, i + 1)
      prev = window.reduce((sum, c) => sum + c.close, 0) / period
    } else {
      prev = candles[i].close * k + prev * (1 - k)
    }
    points.push({ timestamp: candles[i].timestamp, value: prev })
  }
  return points
}

export function computeWma(candles: Candle[], period: number): IndicatorLinePoint[] {
  const points: IndicatorLinePoint[] = []
  const denom = (period * (period + 1)) / 2
  for (let i = 0; i < candles.length; i++) {
    if (i + 1 < period) continue
    const window = candles.slice(i + 1 - period, i + 1)
    let weightedSum = 0
    for (let w = 0; w < window.length; w++) weightedSum += window[w].close * (w + 1)
    points.push({ timestamp: candles[i].timestamp, value: weightedSum / denom })
  }
  return points
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `npx vitest run tests/indicatorLibrary.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/core/indicators/library.ts tests/indicatorLibrary.test.ts
git commit -m "$(cat <<'EOF'
Add SMA/EMA/WMA compute functions to the indicator library

Each takes the full candle history and returns a point series (not
just a last value) — same shape strategyIndicatorLines already uses.
Reuses the existing sma() helper from math.ts for the simple case;
EMA/WMA are new. Nothing calls these yet.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Compute library — Bollinger Bands + VWAP

**Files:**
- Modify: `src/core/indicators/library.ts`
- Modify: `tests/indicatorLibrary.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/indicatorLibrary.test.ts`, change the import line:

```ts
import { computeSma, computeEma, computeWma } from '@core/indicators/library'
```

to:

```ts
import {
  computeSma,
  computeEma,
  computeWma,
  computeBollingerBands,
  computeVwap
} from '@core/indicators/library'
```

Then add, at the end of the file:

```ts

describe('computeBollingerBands', () => {
  it('returns upper/mid/lower lines', () => {
    const bars = series(start, MIN, [10, 12, 8, 14, 6, 16])
    const result = computeBollingerBands(bars, 3, 2)
    expect(result.map((line) => line.id)).toEqual(['upper', 'mid', 'lower'])
    const mid = result.find((line) => line.id === 'mid')!
    expect(mid.points.length).toBeGreaterThan(0)
    const upper = result.find((line) => line.id === 'upper')!
    const lower = result.find((line) => line.id === 'lower')!
    for (let i = 0; i < mid.points.length; i++) {
      expect(upper.points[i].value).toBeGreaterThan(mid.points[i].value)
      expect(lower.points[i].value).toBeLessThan(mid.points[i].value)
    }
  })
})

describe('computeVwap', () => {
  it('is the cumulative volume-weighted typical price', () => {
    const bars = series(start, MIN, [10, 20]).map((bar, i) => ({
      ...bar,
      high: bar.close + 1,
      low: bar.close - 1,
      volume: i === 0 ? 10 : 20
    }))
    const points = computeVwap(bars)
    expect(points).toHaveLength(2)
    // Bar 0: typical price = 10, volume 10 -> vwap = 10
    expect(points[0].value).toBeCloseTo(10)
    // Bar 1: typical price = 20, volume 20. cumulative PV = 10*10 + 20*20 = 500,
    // cumulative volume = 30 -> vwap = 500/30
    expect(points[1].value).toBeCloseTo(500 / 30)
  })

  it('skips bars until there is any volume', () => {
    const bars = series(start, MIN, [10, 20]).map((bar) => ({ ...bar, volume: 0 }))
    expect(computeVwap(bars)).toEqual([])
  })
})
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx vitest run tests/indicatorLibrary.test.ts`
Expected: FAIL — `computeBollingerBands`/`computeVwap` are not exported yet.

- [ ] **Step 3: Implement Bollinger Bands and VWAP**

In `src/core/indicators/library.ts`, change the import line:

```ts
import { sma } from './math'
```

to:

```ts
import { bollinger, sma } from './math'
```

Then add, at the end of the file:

```ts

export function computeBollingerBands(
  candles: Candle[],
  period: number,
  stdDev: number
): IndicatorLineResult[] {
  const upper: IndicatorLinePoint[] = []
  const mid: IndicatorLinePoint[] = []
  const lower: IndicatorLinePoint[] = []
  for (let i = 0; i < candles.length; i++) {
    const window = candles.slice(Math.max(0, i + 1 - period), i + 1)
    const bands = bollinger(window, period, stdDev)
    if (!bands) continue
    const timestamp = candles[i].timestamp
    upper.push({ timestamp, value: bands.upper })
    mid.push({ timestamp, value: bands.mid })
    lower.push({ timestamp, value: bands.lower })
  }
  return [
    { id: 'upper', label: 'Upper', points: upper },
    { id: 'mid', label: 'Basis', points: mid },
    { id: 'lower', label: 'Lower', points: lower }
  ]
}

export function computeVwap(candles: Candle[]): IndicatorLinePoint[] {
  const points: IndicatorLinePoint[] = []
  let cumulativePV = 0
  let cumulativeVolume = 0
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3
    const volume = candle.volume ?? 0
    cumulativePV += typicalPrice * volume
    cumulativeVolume += volume
    if (cumulativeVolume > 0) {
      points.push({ timestamp: candle.timestamp, value: cumulativePV / cumulativeVolume })
    }
  }
  return points
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `npx vitest run tests/indicatorLibrary.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/core/indicators/library.ts tests/indicatorLibrary.test.ts
git commit -m "$(cat <<'EOF'
Add Bollinger Bands and VWAP to the indicator library

Bollinger reuses the existing bollinger() helper from math.ts over a
bounded trailing window, same pattern as the new moving averages.
VWAP is a cumulative volume-weighted typical price computed from the
start of whatever candle array it's given (not a daily/session
reset) — a documented v1 simplification.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Compute library — RSI + ATR

**Files:**
- Modify: `src/core/indicators/library.ts`
- Modify: `tests/indicatorLibrary.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/indicatorLibrary.test.ts`, change the import line:

```ts
import {
  computeSma,
  computeEma,
  computeWma,
  computeBollingerBands,
  computeVwap
} from '@core/indicators/library'
```

to:

```ts
import {
  computeSma,
  computeEma,
  computeWma,
  computeBollingerBands,
  computeVwap,
  computeRsi,
  computeAtr
} from '@core/indicators/library'
```

Then add, at the end of the file:

```ts

describe('computeRsi', () => {
  it('is 100 when there are no losses in the window', () => {
    const bars = series(start, MIN, [10, 11, 12, 13, 14])
    const points = computeRsi(bars, 4)
    expect(points).toHaveLength(1)
    expect(points[0].value).toBe(100)
  })

  it('is 0 when there are no gains in the window', () => {
    const bars = series(start, MIN, [14, 13, 12, 11, 10])
    const points = computeRsi(bars, 4)
    expect(points).toHaveLength(1)
    expect(points[0].value).toBe(0)
  })

  it('is between 0 and 100 for mixed movement', () => {
    const bars = series(start, MIN, [10, 12, 9, 13, 8, 14, 15])
    const points = computeRsi(bars, 3)
    expect(points.length).toBeGreaterThan(0)
    for (const point of points) {
      expect(point.value).toBeGreaterThanOrEqual(0)
      expect(point.value).toBeLessThanOrEqual(100)
    }
  })
})

describe('computeAtr', () => {
  it('averages true range over the period', () => {
    const bars = series(start, MIN, [10, 10, 10, 10, 10]).map((bar) => ({
      ...bar,
      high: bar.close + 2,
      low: bar.close - 2
    }))
    const points = computeAtr(bars, 3)
    expect(points.length).toBeGreaterThan(0)
    // Flat closes, constant high-low range of 4 -> true range is always 4 -> ATR settles at 4.
    for (const point of points) expect(point.value).toBeCloseTo(4)
  })
})
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx vitest run tests/indicatorLibrary.test.ts`
Expected: FAIL — `computeRsi`/`computeAtr` are not exported yet.

- [ ] **Step 3: Implement RSI and ATR**

In `src/core/indicators/library.ts`, add at the end of the file:

```ts

export function computeRsi(candles: Candle[], period: number): IndicatorLinePoint[] {
  const points: IndicatorLinePoint[] = []
  if (candles.length < period + 1) return points
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close
    if (change > 0) avgGain += change
    else avgLoss += -change
  }
  avgGain /= period
  avgLoss /= period
  const rsiAt = (gain: number, loss: number): number => {
    if (loss === 0) return 100
    const rs = gain / loss
    return 100 - 100 / (1 + rs)
  }
  points.push({ timestamp: candles[period].timestamp, value: rsiAt(avgGain, avgLoss) })
  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    points.push({ timestamp: candles[i].timestamp, value: rsiAt(avgGain, avgLoss) })
  }
  return points
}

function trueRange(candles: Candle[], i: number): number {
  const high = candles[i].high
  const low = candles[i].low
  const prevClose = candles[i - 1].close
  return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))
}

export function computeAtr(candles: Candle[], period: number): IndicatorLinePoint[] {
  const points: IndicatorLinePoint[] = []
  if (candles.length < period + 1) return points
  let atr = 0
  for (let i = 1; i <= period; i++) atr += trueRange(candles, i)
  atr /= period
  points.push({ timestamp: candles[period].timestamp, value: atr })
  for (let i = period + 1; i < candles.length; i++) {
    atr = (atr * (period - 1) + trueRange(candles, i)) / period
    points.push({ timestamp: candles[i].timestamp, value: atr })
  }
  return points
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `npx vitest run tests/indicatorLibrary.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/core/indicators/library.ts tests/indicatorLibrary.test.ts
git commit -m "$(cat <<'EOF'
Add RSI and ATR to the indicator library

Standard Wilder smoothing for both: RSI's average gain/loss and
ATR's true range are seeded with a simple average over the first
period bars, then smoothed forward one bar at a time — the
classic (not exponential-from-scratch) formulation.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Compute library — MACD, Stochastic, Volume, and the dispatcher

**Files:**
- Modify: `src/core/indicators/library.ts`
- Modify: `tests/indicatorLibrary.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/indicatorLibrary.test.ts`, change the import line:

```ts
import {
  computeSma,
  computeEma,
  computeWma,
  computeBollingerBands,
  computeVwap,
  computeRsi,
  computeAtr
} from '@core/indicators/library'
```

to:

```ts
import {
  computeSma,
  computeEma,
  computeWma,
  computeBollingerBands,
  computeVwap,
  computeRsi,
  computeAtr,
  computeMacd,
  computeStochastic,
  computeVolume,
  computeIndicator
} from '@core/indicators/library'
```

Then add, at the end of the file:

```ts

describe('computeMacd', () => {
  it('returns macd/signal/histogram lines', () => {
    const bars = series(
      start,
      MIN,
      Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 3) * 10)
    )
    const result = computeMacd(bars, 4, 8, 3)
    expect(result.map((line) => line.id)).toEqual(['macd', 'signal', 'histogram'])
    const macd = result.find((line) => line.id === 'macd')!
    const signal = result.find((line) => line.id === 'signal')!
    const histogram = result.find((line) => line.id === 'histogram')!
    expect(macd.points.length).toBeGreaterThan(0)
    expect(signal.points.length).toBeGreaterThan(0)
    // histogram = macd - signal at every timestamp the histogram has a point for
    const macdByTs = new Map(macd.points.map((p) => [p.timestamp, p.value]))
    const signalByTs = new Map(signal.points.map((p) => [p.timestamp, p.value]))
    for (const point of histogram.points) {
      const expected = (macdByTs.get(point.timestamp) ?? 0) - (signalByTs.get(point.timestamp) ?? 0)
      expect(point.value).toBeCloseTo(expected)
    }
  })
})

describe('computeStochastic', () => {
  it('returns %K between 0 and 100, and a smoothed %D', () => {
    const bars = series(start, MIN, [10, 15, 8, 20, 5, 18, 12]).map((bar) => ({
      ...bar,
      high: bar.close + 1,
      low: bar.close - 1
    }))
    const result = computeStochastic(bars, 3, 2)
    expect(result.map((line) => line.id)).toEqual(['k', 'd'])
    const k = result.find((line) => line.id === 'k')!
    for (const point of k.points) {
      expect(point.value).toBeGreaterThanOrEqual(0)
      expect(point.value).toBeLessThanOrEqual(100)
    }
    const d = result.find((line) => line.id === 'd')!
    expect(d.points.length).toBeGreaterThan(0)
    expect(d.points.length).toBeLessThanOrEqual(k.points.length)
  })
})

describe('computeVolume', () => {
  it('passes each candle volume through as one point per bar', () => {
    const bars = series(start, MIN, [10, 20, 30]).map((bar, i) => ({ ...bar, volume: i * 5 }))
    const points = computeVolume(bars)
    expect(points).toEqual([
      { timestamp: bars[0].timestamp, value: 0 },
      { timestamp: bars[1].timestamp, value: 5 },
      { timestamp: bars[2].timestamp, value: 10 }
    ])
  })
})

describe('computeIndicator', () => {
  it('dispatches to the right compute function by type', () => {
    const bars = series(start, MIN, [10, 20, 30, 40, 50])
    const sma = computeIndicator('sma', bars, { period: 3 })
    expect(sma).toEqual([{ id: 'sma', label: 'SMA(3)', points: computeSma(bars, 3) }])
    const rsi = computeIndicator('rsi', bars, { period: 3 })
    expect(rsi[0].id).toBe('rsi')
    const volume = computeIndicator('volume', bars, {})
    expect(volume[0].id).toBe('volume')
  })
})
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx vitest run tests/indicatorLibrary.test.ts`
Expected: FAIL — `computeMacd`/`computeStochastic`/`computeVolume`/`computeIndicator` are not exported yet.

- [ ] **Step 3: Implement MACD, Stochastic, Volume, and the dispatcher**

In `src/core/indicators/library.ts`, find the top-of-file import:

```ts
import type { Candle } from '@shared/types'
```

Replace it with:

```ts
import type { Candle, IndicatorType } from '@shared/types'
```

Then add, at the end of the file:

```ts

function emaOfPoints(points: IndicatorLinePoint[], period: number): IndicatorLinePoint[] {
  const result: IndicatorLinePoint[] = []
  const k = 2 / (period + 1)
  let prev: number | null = null
  for (let i = 0; i < points.length; i++) {
    if (i + 1 < period) continue
    if (prev == null) {
      const window = points.slice(i + 1 - period, i + 1)
      prev = window.reduce((sum, p) => sum + p.value, 0) / period
    } else {
      prev = points[i].value * k + prev * (1 - k)
    }
    result.push({ timestamp: points[i].timestamp, value: prev })
  }
  return result
}

export function computeMacd(
  candles: Candle[],
  fastPeriod: number,
  slowPeriod: number,
  signalPeriod: number
): IndicatorLineResult[] {
  const fast = computeEma(candles, fastPeriod)
  const slow = computeEma(candles, slowPeriod)
  const slowByTs = new Map(slow.map((p) => [p.timestamp, p.value]))
  const macdPoints: IndicatorLinePoint[] = []
  for (const point of fast) {
    const slowValue = slowByTs.get(point.timestamp)
    if (slowValue == null) continue
    macdPoints.push({ timestamp: point.timestamp, value: point.value - slowValue })
  }
  const signalPoints = emaOfPoints(macdPoints, signalPeriod)
  const signalByTs = new Map(signalPoints.map((p) => [p.timestamp, p.value]))
  const histogramPoints: IndicatorLinePoint[] = []
  for (const point of macdPoints) {
    const signalValue = signalByTs.get(point.timestamp)
    if (signalValue == null) continue
    histogramPoints.push({ timestamp: point.timestamp, value: point.value - signalValue })
  }
  return [
    { id: 'macd', label: 'MACD', points: macdPoints },
    { id: 'signal', label: 'Signal', points: signalPoints },
    { id: 'histogram', label: 'Histogram', points: histogramPoints }
  ]
}

export function computeStochastic(
  candles: Candle[],
  kPeriod: number,
  dPeriod: number
): IndicatorLineResult[] {
  const kPoints: IndicatorLinePoint[] = []
  for (let i = 0; i < candles.length; i++) {
    if (i + 1 < kPeriod) continue
    const window = candles.slice(i + 1 - kPeriod, i + 1)
    const highestHigh = Math.max(...window.map((c) => c.high))
    const lowestLow = Math.min(...window.map((c) => c.low))
    if (highestHigh === lowestLow) continue
    const k = ((candles[i].close - lowestLow) / (highestHigh - lowestLow)) * 100
    kPoints.push({ timestamp: candles[i].timestamp, value: k })
  }
  const dPoints: IndicatorLinePoint[] = []
  for (let i = 0; i < kPoints.length; i++) {
    if (i + 1 < dPeriod) continue
    const window = kPoints.slice(i + 1 - dPeriod, i + 1)
    const avg = window.reduce((sum, p) => sum + p.value, 0) / dPeriod
    dPoints.push({ timestamp: kPoints[i].timestamp, value: avg })
  }
  return [
    { id: 'k', label: '%K', points: kPoints },
    { id: 'd', label: '%D', points: dPoints }
  ]
}

export function computeVolume(candles: Candle[]): IndicatorLinePoint[] {
  return candles.map((c) => ({ timestamp: c.timestamp, value: c.volume ?? 0 }))
}

export function computeIndicator(
  type: IndicatorType,
  candles: Candle[],
  params: Record<string, number>
): IndicatorLineResult[] {
  switch (type) {
    case 'sma':
      return [{ id: 'sma', label: `SMA(${params.period})`, points: computeSma(candles, params.period) }]
    case 'ema':
      return [{ id: 'ema', label: `EMA(${params.period})`, points: computeEma(candles, params.period) }]
    case 'wma':
      return [{ id: 'wma', label: `WMA(${params.period})`, points: computeWma(candles, params.period) }]
    case 'bbands':
      return computeBollingerBands(candles, params.period, params.stdDev)
    case 'vwap':
      return [{ id: 'vwap', label: 'VWAP', points: computeVwap(candles) }]
    case 'rsi':
      return [{ id: 'rsi', label: `RSI(${params.period})`, points: computeRsi(candles, params.period) }]
    case 'macd':
      return computeMacd(candles, params.fast, params.slow, params.signal)
    case 'stoch':
      return computeStochastic(candles, params.kPeriod, params.dPeriod)
    case 'atr':
      return [{ id: 'atr', label: `ATR(${params.period})`, points: computeAtr(candles, params.period) }]
    case 'volume':
      return [{ id: 'volume', label: 'Volume', points: computeVolume(candles) }]
    default:
      return []
  }
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `npx vitest run tests/indicatorLibrary.test.ts`
Expected: PASS — all tests across the file green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including every new `tests/indicatorLibrary.test.ts` / `tests/indicatorCatalog.test.ts` case.

- [ ] **Step 7: Commit**

```bash
git add src/core/indicators/library.ts tests/indicatorLibrary.test.ts
git commit -m "$(cat <<'EOF'
Add MACD, Stochastic, Volume, and computeIndicator dispatcher

MACD and Stochastic complete the oscillator set; Volume is a plain
per-bar pass-through. computeIndicator(type, candles, params) is the
single entry point ChartPanel will call — dispatches by
IndicatorType to the right compute function above. This completes
the core indicator library; nothing in the app calls it yet.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Database schema + repository

**Files:**
- Modify: `src/main/database/schema.ts`
- Modify: `src/main/database/repositories.ts`

No test file — this codebase doesn't unit-test the SQLite repository layer directly (confirmed: no test imports `saveDrawing`/`listDrawings`/etc. either); `npm run typecheck` plus Task 12's manual verification are this layer's checks, consistent with how the drawings persistence layer itself was built.

- [ ] **Step 1: Add the table**

In `src/main/database/schema.ts`, find:

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
`
```

Replace it with:

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

CREATE TABLE IF NOT EXISTS chart_indicators (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  type TEXT NOT NULL,
  params_json TEXT NOT NULL,
  style_json TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chart_indicators_symbol ON chart_indicators(symbol);
`
```

(Only the final closing backtick moved down — everything before `CREATE TABLE IF NOT EXISTS chart_indicators` is unchanged.)

- [ ] **Step 2: Add the repository functions**

In `src/main/database/repositories.ts`, find the import block:

```ts
import type {
  BacktestSession,
  Candle,
  DataGap,
  DatasetInfo,
  DeskPrefs,
  Drawing,
  SavedStrategy,
  StrategySettings,
  Timeframe,
  Trade
} from '@shared/types'
```

Replace it with:

```ts
import type {
  BacktestSession,
  Candle,
  ChartIndicator,
  DataGap,
  DatasetInfo,
  DeskPrefs,
  Drawing,
  SavedStrategy,
  StrategySettings,
  Timeframe,
  Trade
} from '@shared/types'
```

Then find:

```ts
export function clearDrawings(symbol: string): void {
  getDb().prepare('DELETE FROM drawings WHERE symbol = ?').run(symbol)
}
```

Immediately after its closing `}`, add:

```ts

interface ChartIndicatorRow {
  id: string
  symbol: string
  type: string
  params_json: string
  style_json: string
  position: number
  created_at: number
  updated_at: number
}

function mapChartIndicator(row: ChartIndicatorRow): ChartIndicator {
  return {
    id: row.id,
    symbol: row.symbol,
    type: row.type as ChartIndicator['type'],
    params: JSON.parse(row.params_json),
    style: JSON.parse(row.style_json),
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listChartIndicators(symbol: string): ChartIndicator[] {
  const rows = getDb()
    .prepare('SELECT * FROM chart_indicators WHERE symbol = ? ORDER BY created_at ASC')
    .all(symbol) as ChartIndicatorRow[]
  return rows.map(mapChartIndicator)
}

export function saveChartIndicator(indicator: ChartIndicator): void {
  getDb()
    .prepare(
      `INSERT INTO chart_indicators (id, symbol, type, params_json, style_json, position, created_at, updated_at)
       VALUES (@id, @symbol, @type, @params, @style, @position, @created, @updated)
       ON CONFLICT(id) DO UPDATE SET
         params_json = excluded.params_json,
         style_json = excluded.style_json,
         position = excluded.position,
         updated_at = excluded.updated_at`
    )
    .run({
      id: indicator.id,
      symbol: indicator.symbol,
      type: indicator.type,
      params: JSON.stringify(indicator.params),
      style: JSON.stringify(indicator.style),
      position: indicator.position,
      created: indicator.createdAt,
      updated: indicator.updatedAt
    })
}

export function deleteChartIndicator(id: string): void {
  getDb().prepare('DELETE FROM chart_indicators WHERE id = ?').run(id)
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/database/schema.ts src/main/database/repositories.ts
git commit -m "$(cat <<'EOF'
Add chart_indicators table and repository functions

Same shape as the existing drawings table/repository: id, symbol,
type, a JSON params blob, a JSON style blob, a position (for
oscillator pane ordering), and timestamps. list/save (upsert)/delete
— no "clear all" yet, nothing calls for it. Nothing wires this up to
IPC yet.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: IPC channels + preload bridge

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add the IPC channel constants**

In `src/shared/ipc.ts`, find:

```ts
  DRAWINGS_LIST: 'drawings:list',
  DRAWINGS_SAVE: 'drawings:save',
  DRAWINGS_DELETE: 'drawings:delete',
  DRAWINGS_CLEAR: 'drawings:clear',
```

Replace it with:

```ts
  DRAWINGS_LIST: 'drawings:list',
  DRAWINGS_SAVE: 'drawings:save',
  DRAWINGS_DELETE: 'drawings:delete',
  DRAWINGS_CLEAR: 'drawings:clear',
  CHART_INDICATORS_LIST: 'chart-indicators:list',
  CHART_INDICATORS_SAVE: 'chart-indicators:save',
  CHART_INDICATORS_DELETE: 'chart-indicators:delete',
```

- [ ] **Step 2: Register the main-process handlers**

In `src/main/ipc.ts`, find the type-only import block:

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

Replace it with:

```ts
import type {
  BacktestSession,
  Candle,
  ChartIndicator,
  DeskPrefs,
  Drawing,
  SavedStrategy,
  Timeframe,
  Trade
} from '@shared/types'
```

Then find the repository import block:

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

Replace it with:

```ts
import {
  clearDrawings,
  deleteChartIndicator,
  deleteDataset,
  deleteDrawing,
  deleteSession,
  deleteStrategy,
  getCandles,
  getGaps,
  getRecentCandles,
  insertDataset,
  listChartIndicators,
  listDatasets,
  listDrawings,
  listStrategies,
  loadDeskPrefs,
  loadSession,
  replaceTape,
  saveChartIndicator,
  saveDeskPrefs,
  saveDrawing,
  saveSession,
  saveStrategy
} from './database/repositories'
```

Then find:

```ts
  handle(IPC.DRAWINGS_CLEAR, (_e, symbol: string) => clearDrawings(symbol))
}
```

Replace it with:

```ts
  handle(IPC.DRAWINGS_CLEAR, (_e, symbol: string) => clearDrawings(symbol))

  handle(IPC.CHART_INDICATORS_LIST, (_e, symbol: string) => listChartIndicators(symbol))

  handle(IPC.CHART_INDICATORS_SAVE, (_e, indicator: ChartIndicator) => saveChartIndicator(indicator))

  handle(IPC.CHART_INDICATORS_DELETE, (_e, id: string) => deleteChartIndicator(id))
}
```

- [ ] **Step 3: Add the preload bridge**

In `src/preload/index.ts`, find the type-only import block:

```ts
import type {
  BacktestSession,
  DatasetInfo,
  DeskPrefs,
  Drawing,
  SavedStrategy,
  Timeframe,
  Trade
} from '../shared/types'
```

Replace it with:

```ts
import type {
  BacktestSession,
  ChartIndicator,
  DatasetInfo,
  DeskPrefs,
  Drawing,
  SavedStrategy,
  Timeframe,
  Trade
} from '../shared/types'
```

Then find:

```ts
  drawings: {
    list: (symbol: string) => ipcRenderer.invoke(IPC.DRAWINGS_LIST, symbol) as Promise<Drawing[]>,
    save: (drawing: Drawing) => ipcRenderer.invoke(IPC.DRAWINGS_SAVE, drawing) as Promise<void>,
    delete: (id: string) => ipcRenderer.invoke(IPC.DRAWINGS_DELETE, id) as Promise<void>,
    clear: (symbol: string) => ipcRenderer.invoke(IPC.DRAWINGS_CLEAR, symbol) as Promise<void>
  }
}
```

Replace it with:

```ts
  drawings: {
    list: (symbol: string) => ipcRenderer.invoke(IPC.DRAWINGS_LIST, symbol) as Promise<Drawing[]>,
    save: (drawing: Drawing) => ipcRenderer.invoke(IPC.DRAWINGS_SAVE, drawing) as Promise<void>,
    delete: (id: string) => ipcRenderer.invoke(IPC.DRAWINGS_DELETE, id) as Promise<void>,
    clear: (symbol: string) => ipcRenderer.invoke(IPC.DRAWINGS_CLEAR, symbol) as Promise<void>
  },
  chartIndicators: {
    list: (symbol: string) =>
      ipcRenderer.invoke(IPC.CHART_INDICATORS_LIST, symbol) as Promise<ChartIndicator[]>,
    save: (indicator: ChartIndicator) =>
      ipcRenderer.invoke(IPC.CHART_INDICATORS_SAVE, indicator) as Promise<void>,
    delete: (id: string) => ipcRenderer.invoke(IPC.CHART_INDICATORS_DELETE, id) as Promise<void>
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc.ts src/main/ipc.ts src/preload/index.ts
git commit -m "$(cat <<'EOF'
Wire chart_indicators up to IPC and the preload bridge

CHART_INDICATORS_LIST/SAVE/DELETE, handled the same way as the
existing DRAWINGS_* channels, exposed to the renderer as
window.quantify.chartIndicators.list/save/delete. Nothing in the
renderer calls this yet.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Store — state, actions, and persistence wiring

**Files:**
- Modify: `src/renderer/src/store/useAppStore.ts`

No test file — this codebase doesn't unit-test `useAppStore.ts` (confirmed by every prior plan in this repo; it depends on Electron preload bridges not mocked anywhere). `npm run typecheck` plus Task 12's manual verification are this task's checks.

- [ ] **Step 1: Import the new types and catalog helpers**

Find:

```ts
import type {
  AmbiguityRule,
  BacktestSession,
  Candle,
  ChartTool,
  CostConfig,
  DataGap,
  DatasetInfo,
  DeskPrefs,
  DeskTheme,
  Direction,
  Drawing,
  DrawingPoint,
  DrawingStyle,
  DrawingTool,
  SavedStrategy,
  StrategySettings,
  StrategySignal,
  Timeframe,
  Trade
} from '@shared/types'
```

Replace it with:

```ts
import type {
  AmbiguityRule,
  BacktestSession,
  Candle,
  ChartIndicator,
  ChartTool,
  CostConfig,
  DataGap,
  DatasetInfo,
  DeskPrefs,
  DeskTheme,
  Direction,
  Drawing,
  DrawingPoint,
  DrawingStyle,
  DrawingTool,
  IndicatorType,
  SavedStrategy,
  StrategySettings,
  StrategySignal,
  Timeframe,
  Trade
} from '@shared/types'
```

Find:

```ts
import { DEFAULT_DRAWING_STYLE, DRAWING_TOOLS } from '@core/drawings/model'
```

Immediately after it, add:

```ts
import { INDICATOR_CATALOG, defaultParams, nextIndicatorColor } from '@core/indicators/catalog'
```

- [ ] **Step 2: Add the state field and action signatures**

Find:

```ts
  strategies: SavedStrategy[]
  activeStrategyId: string | null
  theme: DeskTheme
```

Replace it with:

```ts
  strategies: SavedStrategy[]
  activeStrategyId: string | null
  theme: DeskTheme
  chartIndicators: ChartIndicator[]
```

Find:

```ts
  loadDrawingsForSymbol: (symbol: string) => Promise<void>
  currentCandle: () => Candle | undefined
}
```

Replace it with:

```ts
  loadDrawingsForSymbol: (symbol: string) => Promise<void>
  addChartIndicator: (type: IndicatorType) => void
  updateChartIndicatorParams: (id: string, params: Record<string, number>) => void
  updateChartIndicatorStyle: (id: string, style: Partial<ChartIndicator['style']>) => void
  removeChartIndicator: (id: string) => void
  loadChartIndicatorsForSymbol: (symbol: string) => Promise<void>
  currentCandle: () => Candle | undefined
}
```

- [ ] **Step 3: Add the initial state value**

Find the initial state object's `strategies: [],` / `activeStrategyId: null,` area — specifically find:

```ts
  strategies: [],
  activeStrategyId: null,
```

Replace it with:

```ts
  strategies: [],
  activeStrategyId: null,
  chartIndicators: [],
```

(If `theme:` sits between these two lines in your checkout instead of right after, that's fine — just add `chartIndicators: [],` anywhere in this same top-level initial-state object; exact position among sibling fields doesn't matter.)

- [ ] **Step 4: Wire the initial load into `bootstrap`**

Find:

```ts
      // The symbol-change subscriber that loads drawings only fires when the
      // resolved symbol differs from the store's hardcoded initial value, so
      // a remembered symbol that happens to match it (the common case) would
      // otherwise never trigger a load. Load explicitly once bootstrap settles.
      void get().loadDrawingsForSymbol(get().symbol)
```

Replace it with:

```ts
      // The symbol-change subscriber that loads drawings only fires when the
      // resolved symbol differs from the store's hardcoded initial value, so
      // a remembered symbol that happens to match it (the common case) would
      // otherwise never trigger a load. Load explicitly once bootstrap settles.
      void get().loadDrawingsForSymbol(get().symbol)
      void get().loadChartIndicatorsForSymbol(get().symbol)
```

- [ ] **Step 5: Add the actions**

Find the `loadDrawingsForSymbol` action's implementation:

```ts
  loadDrawingsForSymbol: async (symbol) => {
    set({ drawingUndoStack: [], drawingRedoStack: [] })
    const api = desktop()
    if (!api?.drawings) {
      set({ drawings: [], selectedDrawingId: null })
      return
    }
    try {
      const drawings = await api.drawings.list(symbol)
      if (get().symbol === symbol) set({ drawings, selectedDrawingId: null })
    } catch {
      if (get().symbol === symbol) set({ drawings: [], selectedDrawingId: null })
    }
  }
}
```

Replace it with:

```ts
  loadDrawingsForSymbol: async (symbol) => {
    set({ drawingUndoStack: [], drawingRedoStack: [] })
    const api = desktop()
    if (!api?.drawings) {
      set({ drawings: [], selectedDrawingId: null })
      return
    }
    try {
      const drawings = await api.drawings.list(symbol)
      if (get().symbol === symbol) set({ drawings, selectedDrawingId: null })
    } catch {
      if (get().symbol === symbol) set({ drawings: [], selectedDrawingId: null })
    }
  },

  addChartIndicator: (type) => {
    const spec = INDICATOR_CATALOG.find((c) => c.id === type)
    if (!spec) return
    const current = get().chartIndicators
    const sameTypeCount = current.filter((ind) => ind.type === type).length
    const oscillatorCount = current.filter(
      (ind) => INDICATOR_CATALOG.find((c) => c.id === ind.type)?.category === 'oscillator'
    ).length
    const now = Date.now()
    const indicator: ChartIndicator = {
      id: newId(),
      symbol: get().symbol,
      type,
      params: defaultParams(spec),
      style: { color: nextIndicatorColor(sameTypeCount), lineWidth: 1 },
      position: spec.category === 'oscillator' ? oscillatorCount : 0,
      createdAt: now,
      updatedAt: now
    }
    set({ chartIndicators: [...current, indicator] })
    const api = desktop()
    if (api?.chartIndicators) void api.chartIndicators.save(indicator)
  },

  updateChartIndicatorParams: (id, params) => {
    let updated: ChartIndicator | undefined
    const chartIndicators = get().chartIndicators.map((ind) => {
      if (ind.id !== id) return ind
      updated = { ...ind, params, updatedAt: Date.now() }
      return updated
    })
    if (!updated) return
    set({ chartIndicators })
    const api = desktop()
    if (api?.chartIndicators) void api.chartIndicators.save(updated)
  },

  updateChartIndicatorStyle: (id, style) => {
    let updated: ChartIndicator | undefined
    const chartIndicators = get().chartIndicators.map((ind) => {
      if (ind.id !== id) return ind
      updated = { ...ind, style: { ...ind.style, ...style }, updatedAt: Date.now() }
      return updated
    })
    if (!updated) return
    set({ chartIndicators })
    const api = desktop()
    if (api?.chartIndicators) void api.chartIndicators.save(updated)
  },

  removeChartIndicator: (id) => {
    set({ chartIndicators: get().chartIndicators.filter((ind) => ind.id !== id) })
    const api = desktop()
    if (api?.chartIndicators) void api.chartIndicators.delete(id)
  },

  loadChartIndicatorsForSymbol: async (symbol) => {
    const api = desktop()
    if (!api?.chartIndicators) {
      set({ chartIndicators: [] })
      return
    }
    try {
      const chartIndicators = await api.chartIndicators.list(symbol)
      if (get().symbol === symbol) set({ chartIndicators })
    } catch {
      if (get().symbol === symbol) set({ chartIndicators: [] })
    }
  }
}
```

- [ ] **Step 6: Wire the symbol-change subscriber**

Find:

```ts
useAppStore.subscribe((state, prev) => {
  if (state.symbol !== prev.symbol) void state.loadDrawingsForSymbol(state.symbol)
})
```

Replace it with:

```ts
useAppStore.subscribe((state, prev) => {
  if (state.symbol !== prev.symbol) void state.loadDrawingsForSymbol(state.symbol)
})

useAppStore.subscribe((state, prev) => {
  if (state.symbol !== prev.symbol) void state.loadChartIndicatorsForSymbol(state.symbol)
})
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all tests pass (no existing test touches `useAppStore.ts`, so this just confirms nothing else broke).

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/store/useAppStore.ts
git commit -m "$(cat <<'EOF'
Add chartIndicators store state, actions, and per-symbol loading

addChartIndicator/updateChartIndicatorParams/updateChartIndicatorStyle/
removeChartIndicator, plus loadChartIndicatorsForSymbol wired into
both bootstrap and the same symbol-change subscriber that already
loads drawings — so switching symbols loads both together. Each
mutating action persists via window.quantify.chartIndicators.
Nothing in ChartPanel reads this yet.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: ChartPanel — render user-added indicators on the chart

**Files:**
- Modify: `src/renderer/src/components/ChartPanel.tsx`

- [ ] **Step 1: Import the catalog and compute dispatcher**

Find:

```ts
import {
  strategyIndicatorLast,
  strategyIndicatorLines,
  strategyIndicatorSpecs
} from '@core/indicators/overlay'
```

Immediately after it, add:

```ts
import { INDICATOR_CATALOG } from '@core/indicators/catalog'
import { computeIndicator } from '@core/indicators/library'
```

- [ ] **Step 2: Read `chartIndicators` from the store**

Find:

```ts
  const displayCandles = useAppStore((s) => s.displayCandles)
  const draft = useAppStore((s) => s.draft)
```

Replace it with:

```ts
  const displayCandles = useAppStore((s) => s.displayCandles)
  const chartIndicators = useAppStore((s) => s.chartIndicators)
  const draft = useAppStore((s) => s.draft)
```

- [ ] **Step 3: Add the new refs**

Find:

```ts
  const indicatorsRef = useRef(new Map<string, ISeriesApi<'Line'>>())
```

Replace it with:

```ts
  const indicatorsRef = useRef(new Map<string, ISeriesApi<'Line'>>())
  const chartIndicatorSeriesRef = useRef(new Map<string, ISeriesApi<'Line'>[]>())
  const oscillatorPaneIndexRef = useRef(new Map<string, number>())
  const prevOscillatorKeyRef = useRef('')
```

- [ ] **Step 4: Clear the new refs when the chart is torn down and recreated**

Find, inside the chart-creation effect (the one with dependency array `[theme, chartFull]`):

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

Replace it with:

```ts
    return () => {
      indicatorsRef.current.clear()
      chartIndicatorSeriesRef.current.clear()
      oscillatorPaneIndexRef.current.clear()
      prevOscillatorKeyRef.current = ''
      chart.remove()
      chartRef.current = null
      setChartApi(null)
      setSeriesApi(null)
    }
  }, [theme, chartFull])
```

- [ ] **Step 5: Add the sync effect**

Find the effect added most recently before the big `paint()` effect — specifically find:

```ts
  useEffect(() => {
    if (mode !== 'replay') return
    shellRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [mode])

  useEffect(() => {
    const syncOverlays = (chart: IChartApi, settings: StrategySettings) => {
```

Insert a new effect between them, so the file reads:

```ts
  useEffect(() => {
    if (mode !== 'replay') return
    shellRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [mode])

  useEffect(() => {
    if (!chartApi) return
    const chart = chartApi

    const isOscillator = (type: string): boolean =>
      INDICATOR_CATALOG.find((c) => c.id === type)?.category === 'oscillator'

    const sync = () => {
      const state = useAppStore.getState()
      const visible =
        state.mode === 'replay'
          ? state.displayCandles.slice(0, state.replayIndex + 1)
          : state.displayCandles
      const overlayIndicators = state.chartIndicators.filter((ind) => !isOscillator(ind.type))
      const oscillatorIndicators = state.chartIndicators
        .filter((ind) => isOscillator(ind.type))
        .slice()
        .sort((a, b) => a.position - b.position)

      const overlayKeep = new Set(overlayIndicators.map((ind) => ind.id))
      for (const [id, series] of chartIndicatorSeriesRef.current) {
        if (overlayKeep.has(id) || oscillatorPaneIndexRef.current.has(id)) continue
        for (const s of series) chart.removeSeries(s)
        chartIndicatorSeriesRef.current.delete(id)
      }
      for (const ind of overlayIndicators) {
        const results = computeIndicator(ind.type, visible, ind.params)
        let series = chartIndicatorSeriesRef.current.get(ind.id)
        if (!series) {
          series = results.map((line) =>
            chart.addSeries(LineSeries, {
              color: ind.style.color,
              lineWidth: (ind.style.lineWidth ?? 1) as 1 | 2 | 3 | 4,
              title: line.label,
              priceLineVisible: false,
              lastValueVisible: true,
              crosshairMarkerVisible: false
            })
          )
          chartIndicatorSeriesRef.current.set(ind.id, series)
        } else {
          for (const s of series) {
            s.applyOptions({
              color: ind.style.color,
              lineWidth: (ind.style.lineWidth ?? 1) as 1 | 2 | 3 | 4
            })
          }
        }
        results.forEach((line, i) => series![i]?.setData(line.points.map(toLinePoint)))
      }

      const oscillatorKey = oscillatorIndicators.map((ind) => ind.id).join(',')
      if (oscillatorKey !== prevOscillatorKeyRef.current) {
        prevOscillatorKeyRef.current = oscillatorKey
        for (const [id, series] of chartIndicatorSeriesRef.current) {
          if (!oscillatorPaneIndexRef.current.has(id)) continue
          for (const s of series) chart.removeSeries(s)
          chartIndicatorSeriesRef.current.delete(id)
        }
        const paneIndexesDesc = [...oscillatorPaneIndexRef.current.values()].sort((a, b) => b - a)
        for (const index of paneIndexesDesc) chart.removePane(index)
        oscillatorPaneIndexRef.current.clear()
        for (const ind of oscillatorIndicators) {
          const pane = chart.addPane()
          const paneIndex = chart.panes().indexOf(pane)
          oscillatorPaneIndexRef.current.set(ind.id, paneIndex)
          const results = computeIndicator(ind.type, visible, ind.params)
          const series = results.map((line) =>
            chart.addSeries(
              LineSeries,
              {
                color: ind.style.color,
                lineWidth: (ind.style.lineWidth ?? 1) as 1 | 2 | 3 | 4,
                title: line.label,
                priceLineVisible: false,
                lastValueVisible: true,
                crosshairMarkerVisible: false
              },
              paneIndex
            )
          )
          chartIndicatorSeriesRef.current.set(ind.id, series)
          results.forEach((line, i) => series[i]?.setData(line.points.map(toLinePoint)))
        }
      } else {
        for (const ind of oscillatorIndicators) {
          const results = computeIndicator(ind.type, visible, ind.params)
          const series = chartIndicatorSeriesRef.current.get(ind.id)
          if (!series) continue
          for (const s of series) {
            s.applyOptions({
              color: ind.style.color,
              lineWidth: (ind.style.lineWidth ?? 1) as 1 | 2 | 3 | 4
            })
          }
          results.forEach((line, i) => series[i]?.setData(line.points.map(toLinePoint)))
        }
      }
    }

    sync()
    let prevChartIndicators = useAppStore.getState().chartIndicators
    let prevTape = useAppStore.getState().displayCandles
    let prevIndex = useAppStore.getState().replayIndex
    let prevMode = useAppStore.getState().mode
    return useAppStore.subscribe((state) => {
      if (
        state.chartIndicators === prevChartIndicators &&
        state.displayCandles === prevTape &&
        state.replayIndex === prevIndex &&
        state.mode === prevMode
      ) {
        return
      }
      prevChartIndicators = state.chartIndicators
      prevTape = state.displayCandles
      prevIndex = state.replayIndex
      prevMode = state.mode
      sync()
    })
  }, [chartApi])

  useEffect(() => {
    const syncOverlays = (chart: IChartApi, settings: StrategySettings) => {
```

(This is a plain insertion — the existing `syncOverlays`/`paint` effect right after it is completely untouched, just now preceded by the new effect instead of directly following the `scrollIntoView` one.)

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/ChartPanel.tsx
git commit -m "$(cat <<'EOF'
Render user-added chart indicators, separate from strategy overlays

New sync effect, parallel to the existing strategy-overlay
syncOverlays/paint effect (not merged with it): overlay-type
indicators (SMA/EMA/WMA/Bollinger/VWAP) diff onto pane 0 by instance
id; oscillator-type indicators (RSI/MACD/Stochastic/ATR/Volume) each
get their own pane via addPane(), rebuilt in full whenever which
oscillator instances are active changes (removePane shifts later
pane indices, so incremental single-pane patching isn't safe —
rebuilding the whole set on membership change sidesteps that).
Always a full recompute over the visible candle array, no windowed
incremental optimization for this pass. Nothing adds an indicator to
the list yet — that's the picker UI, next.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: UI — Indicators picker button

**Files:**
- Create: `src/renderer/src/components/IndicatorPicker.tsx`
- Modify: `src/renderer/src/components/Icon.tsx`
- Modify: `src/renderer/src/components/ChartPanel.tsx`
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Add an "indicators" icon**

In `src/renderer/src/components/Icon.tsx`, find:

```ts
  | 'undo'
  | 'redo'
  | 'edit'
```

Replace it with:

```ts
  | 'undo'
  | 'redo'
  | 'edit'
  | 'indicators'
```

Find:

```ts
  edit: 'M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z'
}
```

Replace it with:

```ts
  edit: 'M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z',
  indicators: 'M3 17l4-7 4 4 4-9 4 6 2-3'
}
```

- [ ] **Step 2: Create the picker component**

Create `src/renderer/src/components/IndicatorPicker.tsx`:

```tsx
import { useState } from 'react'
import { INDICATOR_CATALOG } from '@core/indicators/catalog'
import type { IndicatorType } from '@shared/types'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'

export function IndicatorPicker(): React.JSX.Element {
  const addChartIndicator = useAppStore((s) => s.addChartIndicator)
  const [open, setOpen] = useState(false)
  const overlays = INDICATOR_CATALOG.filter((spec) => spec.category === 'overlay')
  const oscillators = INDICATOR_CATALOG.filter((spec) => spec.category === 'oscillator')

  function pick(type: IndicatorType): void {
    addChartIndicator(type)
    setOpen(false)
  }

  return (
    <div className="indicator-picker">
      <button
        type="button"
        className="icon-btn"
        data-active={open}
        title="Indicators"
        aria-label="Indicators"
        onClick={() => setOpen(!open)}
      >
        <Icon name="indicators" />
      </button>
      {open ? (
        <div className="indicator-picker-menu">
          <div className="indicator-picker-group">
            <span className="indicator-picker-heading">Overlays</span>
            {overlays.map((spec) => (
              <button
                key={spec.id}
                type="button"
                className="indicator-picker-option"
                onClick={() => pick(spec.id)}
              >
                {spec.label}
              </button>
            ))}
          </div>
          <div className="indicator-picker-group">
            <span className="indicator-picker-heading">Oscillators</span>
            {oscillators.map((spec) => (
              <button
                key={spec.id}
                type="button"
                className="indicator-picker-option"
                onClick={() => pick(spec.id)}
              >
                {spec.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 3: Render it in `ChartPanel.tsx`**

Find:

```tsx
      <DrawingToolbar />
      <div className="chart" data-drawing-active={useAppStore((s) => s.activeTool) !== null} ref={hostRef}>
```

Replace it with:

```tsx
      <DrawingToolbar />
      <IndicatorPicker />
      <div className="chart" data-drawing-active={useAppStore((s) => s.activeTool) !== null} ref={hostRef}>
```

Then find the import block for `ChartTradeOverlay`:

```ts
import { ChartTradeOverlay, resolvePositionLevels } from './ChartTradeOverlay'
import { DrawingLayer } from './DrawingLayer'
import { DrawingToolbar } from './DrawingToolbar'
```

Replace it with:

```ts
import { ChartTradeOverlay, resolvePositionLevels } from './ChartTradeOverlay'
import { DrawingLayer } from './DrawingLayer'
import { DrawingToolbar } from './DrawingToolbar'
import { IndicatorPicker } from './IndicatorPicker'
```

- [ ] **Step 4: Add the CSS**

In `src/renderer/src/styles/global.css`, find:

```css
.chart-frame-btn {
  position: absolute;
  top: 10px;
  right: 70px;
  z-index: 3;
}
```

Replace it with:

```css
.chart-frame-btn {
  position: absolute;
  top: 10px;
  right: 70px;
  z-index: 3;
}

.indicator-picker {
  position: absolute;
  top: 54px;
  right: 70px;
  z-index: 6;
}

.indicator-picker-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 7;
  display: flex;
  gap: 10px;
  padding: 8px;
  background: var(--steel);
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
}

.indicator-picker-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 160px;
}

.indicator-picker-heading {
  padding: 4px 8px;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.indicator-picker-option {
  padding: 7px 8px;
  border-radius: var(--radius-xs);
  font-size: 13px;
  text-align: left;
  color: var(--parchment);
  background: transparent;
  white-space: nowrap;
}

.indicator-picker-option:hover {
  background: var(--gold-soft);
  color: var(--gold);
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Manual visual check**

Run: `npm run dev`. Confirm a new icon button appears below the full-frame button (top-right of the chart). Click it — a two-column menu (Overlays / Oscillators) appears listing all 10 indicators. Click "Moving Average (Simple)" — confirm a teal line appears on the chart and the menu closes. Click the indicators button again and pick "RSI" — confirm a new pane appears below the price chart with an RSI line in it. Stop the dev server when done.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/IndicatorPicker.tsx src/renderer/src/components/Icon.tsx src/renderer/src/components/ChartPanel.tsx src/renderer/src/styles/global.css
git commit -m "$(cat <<'EOF'
Add the Indicators picker button

A small icon button below the full-frame toggle opens a two-column
menu (Overlays / Oscillators) of all 10 catalog entries; clicking
one calls addChartIndicator and closes the menu. This is the first
way to actually add an indicator through the UI.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: UI — indicator legend, removal, and a settings popup

**Files:**
- Create: `src/renderer/src/components/IndicatorLegend.tsx`
- Create: `src/renderer/src/components/IndicatorSettingsModal.tsx`
- Modify: `src/renderer/src/components/ChartPanel.tsx`
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Create the settings modal**

Create `src/renderer/src/components/IndicatorSettingsModal.tsx`:

```tsx
import { useState } from 'react'
import { INDICATOR_CATALOG } from '@core/indicators/catalog'
import type { ChartIndicator } from '@shared/types'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'

export function IndicatorSettingsModal({
  indicator,
  onClose
}: {
  indicator: ChartIndicator
  onClose: () => void
}): React.JSX.Element {
  const updateChartIndicatorParams = useAppStore((s) => s.updateChartIndicatorParams)
  const updateChartIndicatorStyle = useAppStore((s) => s.updateChartIndicatorStyle)
  const spec = INDICATOR_CATALOG.find((c) => c.id === indicator.type)
  const [params, setParams] = useState<Record<string, number>>({ ...indicator.params })
  const [color, setColor] = useState(indicator.style.color)

  function submit(): void {
    updateChartIndicatorParams(indicator.id, params)
    updateChartIndicatorStyle(indicator.id, { color })
    onClose()
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="indicator-settings-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <header>
          <div>
            <span className="stamp">Indicator</span>
            <h2 id="indicator-settings-title">{spec?.label ?? indicator.type}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close" aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        {spec?.params.map((paramDef) => (
          <label key={paramDef.key} className="field">
            {paramDef.label}
            <input
              type="number"
              min={paramDef.min}
              max={paramDef.max}
              step={paramDef.step}
              value={params[paramDef.key]}
              onChange={(e) => setParams({ ...params, [paramDef.key]: Number(e.target.value) })}
            />
          </label>
        ))}
        <label className="field">
          Color
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        <div className="composer-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="primary icon-label" type="submit">
            <Icon name="check" />
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Create the legend**

Create `src/renderer/src/components/IndicatorLegend.tsx`:

```tsx
import { useState } from 'react'
import { INDICATOR_CATALOG } from '@core/indicators/catalog'
import { Icon } from './Icon'
import { IndicatorSettingsModal } from './IndicatorSettingsModal'
import { useAppStore } from '../store/useAppStore'

function describeIndicator(type: string, params: Record<string, number>): string {
  const spec = INDICATOR_CATALOG.find((c) => c.id === type)
  if (!spec) return type
  if (spec.params.length === 0) return spec.label
  return `${spec.label} (${spec.params.map((p) => params[p.key]).join(', ')})`
}

export function IndicatorLegend(): React.JSX.Element {
  const chartIndicators = useAppStore((s) => s.chartIndicators)
  const removeChartIndicator = useAppStore((s) => s.removeChartIndicator)
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = chartIndicators.find((ind) => ind.id === editingId) ?? null

  if (chartIndicators.length === 0) return <></>

  return (
    <div className="indicator-legend">
      {chartIndicators.map((ind) => (
        <div key={ind.id} className="indicator-legend-row">
          <span className="indicator-legend-swatch" style={{ background: ind.style.color }} />
          <span className="indicator-legend-label">{describeIndicator(ind.type, ind.params)}</span>
          <button
            type="button"
            className="icon-btn"
            title="Settings"
            aria-label={`${describeIndicator(ind.type, ind.params)} settings`}
            onClick={() => setEditingId(ind.id)}
          >
            <Icon name="edit" />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Remove"
            aria-label={`Remove ${describeIndicator(ind.type, ind.params)}`}
            onClick={() => removeChartIndicator(ind.id)}
          >
            <Icon name="close" />
          </button>
        </div>
      ))}
      {editing ? (
        <IndicatorSettingsModal indicator={editing} onClose={() => setEditingId(null)} />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 3: Render it in `ChartPanel.tsx`**

Find:

```tsx
        <ChartTradeOverlay chart={chartApi} series={seriesApi} host={hostRef.current} />
        <DrawingLayer chart={chartApi} series={seriesApi} host={hostRef.current} />
      </div>
```

Replace it with:

```tsx
        <ChartTradeOverlay chart={chartApi} series={seriesApi} host={hostRef.current} />
        <DrawingLayer chart={chartApi} series={seriesApi} host={hostRef.current} />
        <IndicatorLegend />
      </div>
```

Then find:

```ts
import { IndicatorPicker } from './IndicatorPicker'
```

Replace it with:

```ts
import { IndicatorLegend } from './IndicatorLegend'
import { IndicatorPicker } from './IndicatorPicker'
```

- [ ] **Step 4: Add the CSS**

In `src/renderer/src/styles/global.css`, find the `.indicator-picker-option:hover` rule added in Task 10:

```css
.indicator-picker-option:hover {
  background: var(--gold-soft);
  color: var(--gold);
}
```

Immediately after it, add:

```css

.indicator-legend {
  position: absolute;
  top: 10px;
  left: 54px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.indicator-legend-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  border-radius: var(--radius-xs);
  background: rgba(18, 22, 18, 0.55);
  font-size: 11px;
  color: var(--parchment);
}

.indicator-legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.indicator-legend-label {
  white-space: nowrap;
}

.indicator-legend-row .icon-btn {
  min-width: 20px;
  min-height: 20px;
  padding: 0;
}
```

(`left: 54px` sits just to the right of the `.drawing-toolbar` column at `top: 54px` used elsewhere, so the legend doesn't collide with it or with `.chart-trade-actions` at `top: 10px; left: 10px`.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Manual visual check**

Run: `npm run dev`. Add a Moving Average (Simple) via the Indicators picker — confirm a legend row appears (color swatch + "Moving Average (Simple) (20)") near the top-left of the chart. Click its gear/edit icon — confirm a popup opens with a "Period" number field and a color picker, pre-filled with 20 and the swatch's color. Change the period to 10 and the color, click Save — confirm the line on the chart updates to the new color and the legend label now reads "(10)". Click the row's close icon — confirm the indicator disappears from both the legend and the chart. Add an RSI, confirm its legend row and settings popup work the same way, and that removing it also removes its pane. Reload the app (or switch to a different symbol and back) — confirm indicators you left in place are still there. Stop the dev server when done.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/IndicatorLegend.tsx src/renderer/src/components/IndicatorSettingsModal.tsx src/renderer/src/components/ChartPanel.tsx src/renderer/src/styles/global.css
git commit -m "$(cat <<'EOF'
Add the indicator legend, settings popup, and removal

One legend row per active indicator (color swatch + description +
gear + close) floats over the chart. The gear opens a settings
modal, generated from the catalog's param schema, to edit params and
color; close removes the indicator outright. This completes the
add/edit/remove loop for the chart indicator library.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass, including every new `tests/indicatorCatalog.test.ts` / `tests/indicatorLibrary.test.ts` case.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: `electron-vite build` completes with no errors.

- [ ] **Step 4: Manual end-to-end pass**

Run: `npm run dev` and walk through, in order:

1. Add one of each of the 10 indicator types via the picker. Confirm all 5 overlay types render on the price chart and all 5 oscillator types each get their own pane below it, stacked in the order added.
2. Edit an overlay indicator's period and color via its settings popup — confirm the line updates.
3. Remove one oscillator (e.g. the second one added) — confirm its pane disappears and the remaining oscillator panes are still correctly rendering (not corrupted by the pane-index shift).
4. Add a new oscillator after removing one — confirm it gets a fresh pane at the bottom, no stale/duplicate panes.
5. Start a replay with a few indicators active and press Play — confirm indicator lines/oscillators keep updating in sync with the candles, and note whether there's any noticeable lag (per this plan's documented deviation #1 — lag here is a legitimate follow-up signal, not a blocker for this plan).
6. Toggle full-frame chart mode (`F` key) and toggle the theme — confirm indicators survive the chart remount correctly (both overlays and oscillator panes).
7. Switch to a different symbol, confirm the indicator list clears/changes appropriately (each symbol has its own set), then switch back and confirm the original symbol's indicators reappear (persistence).
8. Restart the app entirely (quit and re-launch, or just reload the renderer) and confirm indicators added earlier are still there for the symbol you left open.

Stop the dev server when done.

- [ ] **Step 5: Report**

No commit needed for this task (verification only) unless Step 4 surfaces a bug — if it does, fix it, re-run the relevant checks above, and commit the fix with a description of what was wrong.
