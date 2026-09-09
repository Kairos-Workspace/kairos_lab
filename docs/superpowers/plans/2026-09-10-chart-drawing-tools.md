# Chart Drawing Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a TradingView-style drawing toolkit (trend line, horizontal line, ray, vertical line, rectangle, ellipse, fib retracement, text, brush, measure) to the chart, with per-symbol SQLite persistence.

**Architecture:** Pure geometry/validation logic lives in new `@core/drawings/*` modules (unit-tested with vitest, following the existing `@core/desk`, `@core/trade` pattern). Persistence follows the exact `strategies` CRUD pattern (SQLite table → repository functions → IPC → preload). Rendering reuses the coordinate-sync pattern already proven in `ChartTradeOverlay.tsx` (canvas overlay + HTML drag handles, kept in sync with `lightweight-charts`' pan/zoom via its subscription APIs), but placement/selection clicks go through `chart.subscribeClick`/`subscribeCrosshairMove` instead of a pointer-events-capturing overlay, so normal chart panning and the existing SL/TP drag handles are never blocked.

**Tech Stack:** TypeScript, React 19, Zustand 5, `lightweight-charts` 5, better-sqlite3, Vitest.

**Design doc:** `docs/superpowers/specs/2026-09-10-chart-drawing-tools-design.md`

---

## Task 1: Core drawing types, defaults, and validation

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/core/drawings/model.ts`
- Test: `tests/drawingModel.test.ts`

- [ ] **Step 1: Add the shared types**

Append to the end of `src/shared/types.ts` (after the `DeskPrefs` interface, which currently ends the file at line 192):

```ts
export type DrawingTool =
  | 'trendline'
  | 'horizontal'
  | 'ray'
  | 'vertical'
  | 'rectangle'
  | 'ellipse'
  | 'fib'
  | 'text'
  | 'brush'

export type ChartTool = DrawingTool | 'measure'

export interface DrawingPoint {
  time: number
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
  points: DrawingPoint[]
  text?: string
  style: DrawingStyle
  createdAt: number
  updatedAt: number
}
```

`DrawingTool` is the set of persisted shape kinds. `ChartTool` widens that with `'measure'`, which is a transient UI mode that never becomes a `Drawing` (see Task 8) — this is why it's a separate type from `DrawingTool` rather than adding `'measure'` to the persisted union.

- [ ] **Step 2: Write the failing model tests**

Create `tests/drawingModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DRAWING_STYLE,
  DRAWING_TOOLS,
  isDrawingComplete,
  parseDrawing
} from '@core/drawings/model'

describe('isDrawingComplete', () => {
  it('requires exactly one point for single-anchor tools', () => {
    expect(isDrawingComplete('horizontal', [{ time: 1, price: 1 }])).toBe(true)
    expect(isDrawingComplete('horizontal', [])).toBe(false)
    expect(isDrawingComplete('text', [{ time: 1, price: 1 }])).toBe(true)
  })

  it('requires two points for two-anchor tools', () => {
    expect(isDrawingComplete('trendline', [{ time: 1, price: 1 }])).toBe(false)
    expect(
      isDrawingComplete('rectangle', [
        { time: 1, price: 1 },
        { time: 2, price: 2 }
      ])
    ).toBe(true)
  })

  it('requires at least two points for brush strokes', () => {
    expect(isDrawingComplete('brush', [{ time: 1, price: 1 }])).toBe(false)
    expect(
      isDrawingComplete('brush', [
        { time: 1, price: 1 },
        { time: 2, price: 2 },
        { time: 3, price: 1.5 }
      ])
    ).toBe(true)
  })
})

describe('parseDrawing', () => {
  it('rejects junk', () => {
    expect(parseDrawing(null)).toBeNull()
    expect(parseDrawing('nope')).toBeNull()
    expect(parseDrawing({})).toBeNull()
  })

  it('rejects an unknown type', () => {
    expect(parseDrawing({ id: 'a', symbol: 'XAUUSD', type: 'pitchfork', points: [] })).toBeNull()
  })

  it('rejects a drawing with too few points for its type', () => {
    expect(parseDrawing({ id: 'a', symbol: 'XAUUSD', type: 'trendline', points: [{ time: 1, price: 1 }] })).toBeNull()
  })

  it('accepts a valid drawing and fills in default style', () => {
    const drawing = parseDrawing({
      id: 'a',
      symbol: 'xauusd',
      type: 'trendline',
      points: [
        { time: 1000, price: 10 },
        { time: 2000, price: 20 }
      ]
    })
    expect(drawing).not.toBeNull()
    expect(drawing?.symbol).toBe('xauusd')
    expect(drawing?.style).toEqual(DEFAULT_DRAWING_STYLE)
    expect(drawing?.points).toHaveLength(2)
  })

  it('keeps a provided style and drops malformed points', () => {
    const drawing = parseDrawing({
      id: 'b',
      symbol: 'EURUSD',
      type: 'horizontal',
      points: [{ time: 1000, price: 1.2 }, { bogus: true }],
      style: { color: '#fff', lineWidth: 3, dashed: true }
    })
    expect(drawing?.points).toHaveLength(1)
    expect(drawing?.style).toEqual({ color: '#fff', lineWidth: 3, dashed: true })
  })

  it('exposes every drawing tool exactly once', () => {
    expect(new Set(DRAWING_TOOLS).size).toBe(DRAWING_TOOLS.length)
    expect(DRAWING_TOOLS).toContain('fib')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/drawingModel.test.ts`
Expected: FAIL — `Cannot find module '@core/drawings/model'`

- [ ] **Step 4: Implement `src/core/drawings/model.ts`**

```ts
import type { Drawing, DrawingPoint, DrawingStyle, DrawingTool } from '@shared/types'

export const DRAWING_TOOLS: DrawingTool[] = [
  'trendline',
  'horizontal',
  'ray',
  'vertical',
  'rectangle',
  'ellipse',
  'fib',
  'text',
  'brush'
]

export const DEFAULT_DRAWING_STYLE: DrawingStyle = {
  color: '#4a45d4',
  lineWidth: 2,
  dashed: false
}

const SINGLE_POINT_TOOLS: DrawingTool[] = ['horizontal', 'vertical', 'text']

export function isDrawingComplete(type: DrawingTool, points: DrawingPoint[]): boolean {
  if (type === 'brush') return points.length >= 2
  if (SINGLE_POINT_TOOLS.includes(type)) return points.length >= 1
  return points.length >= 2
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function parsePoint(raw: unknown): DrawingPoint | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Partial<DrawingPoint>
  if (!Number.isFinite(row.time) || !Number.isFinite(row.price)) return null
  return { time: row.time as number, price: row.price as number }
}

function parseStyle(raw: unknown): DrawingStyle {
  const row = raw && typeof raw === 'object' ? (raw as Partial<DrawingStyle>) : {}
  return {
    color: text(row.color, DEFAULT_DRAWING_STYLE.color),
    lineWidth: num(row.lineWidth, DEFAULT_DRAWING_STYLE.lineWidth),
    dashed: typeof row.dashed === 'boolean' ? row.dashed : DEFAULT_DRAWING_STYLE.dashed
  }
}

export function parseDrawing(raw: unknown): Drawing | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Partial<Drawing>
  if (typeof row.id !== 'string' || !row.id) return null
  if (typeof row.symbol !== 'string' || !row.symbol) return null
  if (!DRAWING_TOOLS.includes(row.type as DrawingTool)) return null
  const type = row.type as DrawingTool
  const points = Array.isArray(row.points)
    ? row.points.map(parsePoint).filter((p): p is DrawingPoint => p !== null)
    : []
  if (!isDrawingComplete(type, points)) return null
  const now = Date.now()
  return {
    id: row.id,
    symbol: row.symbol,
    type,
    points,
    text: typeof row.text === 'string' ? row.text : undefined,
    style: parseStyle(row.style),
    createdAt: num(row.createdAt, now),
    updatedAt: num(row.updatedAt, now)
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/drawingModel.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/core/drawings/model.ts tests/drawingModel.test.ts
git commit -m "Add drawing types and validation model"
```

---

## Task 2: Drawing geometry (hit-testing + pixel projection)

**Files:**
- Create: `src/core/drawings/geometry.ts`
- Test: `tests/drawingGeometry.test.ts`

This module is deliberately decoupled from `lightweight-charts` — it operates purely on pixel `{x, y}` numbers, so it's fully unit-testable and reusable for both painting and hit-testing (the renderer computes pixel points once per frame and reuses them for both).

- [ ] **Step 1: Write the failing geometry tests**

Create `tests/drawingGeometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  distanceToPolyline,
  distanceToSegment,
  pointInEllipse,
  pointInRect,
  projectedPixelPoints
} from '@core/drawings/geometry'

describe('distanceToSegment', () => {
  it('is zero for a point on the segment', () => {
    expect(distanceToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0)
  })

  it('measures perpendicular distance to the segment body', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3)
  })

  it('measures distance to the nearest endpoint beyond the segment', () => {
    expect(distanceToSegment({ x: -4, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(4)
  })
})

describe('distanceToPolyline', () => {
  it('finds the closest of several segments', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 }
    ]
    expect(distanceToPolyline({ x: 10, y: 5 }, points)).toBe(0)
    expect(distanceToPolyline({ x: 5, y: 2 }, points)).toBe(2)
  })
})

describe('pointInRect', () => {
  it('accepts corners defined in either order', () => {
    expect(pointInRect({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 10 })).toBe(true)
    expect(pointInRect({ x: 5, y: 5 }, { x: 10, y: 10 }, { x: 0, y: 0 })).toBe(true)
    expect(pointInRect({ x: 15, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 10 })).toBe(false)
  })
})

describe('pointInEllipse', () => {
  it('accepts the center and rejects far corners', () => {
    expect(pointInEllipse({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 10 })).toBe(true)
    expect(pointInEllipse({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 })).toBe(false)
  })
})

describe('projectedPixelPoints', () => {
  const width = 100
  const height = 100

  it('extends a horizontal line across the full width', () => {
    const points = projectedPixelPoints('horizontal', [{ x: 40, y: 30 }], width, height)
    expect(points).toEqual([
      { x: 0, y: 30 },
      { x: width, y: 30 }
    ])
  })

  it('extends a vertical line across the full height', () => {
    const points = projectedPixelPoints('vertical', [{ x: 40, y: 30 }], width, height)
    expect(points).toEqual([
      { x: 40, y: 0 },
      { x: 40, y: height }
    ])
  })

  it('extends a ray from its anchor to the right edge', () => {
    const points = projectedPixelPoints(
      'ray',
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 }
      ],
      width,
      height
    )
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points[1].x).toBe(width)
    expect(points[1].y).toBe(100)
  })

  it('extends a ray from its anchor to the left edge when pointing left', () => {
    const points = projectedPixelPoints(
      'ray',
      [
        { x: 10, y: 10 },
        { x: 0, y: 0 }
      ],
      width,
      height
    )
    expect(points[1]).toEqual({ x: 0, y: 0 })
  })

  it('passes trendline and brush anchors through unchanged', () => {
    const anchors = [
      { x: 1, y: 2 },
      { x: 3, y: 4 }
    ]
    expect(projectedPixelPoints('trendline', anchors, width, height)).toEqual(anchors)
    expect(projectedPixelPoints('brush', anchors, width, height)).toEqual(anchors)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/drawingGeometry.test.ts`
Expected: FAIL — `Cannot find module '@core/drawings/geometry'`

- [ ] **Step 3: Implement `src/core/drawings/geometry.ts`**

```ts
import type { DrawingTool } from '@shared/types'

export interface Point {
  x: number
  y: number
}

export const HIT_TOLERANCE_PX = 6

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))
  const projX = a.x + t * dx
  const projY = a.y + t * dy
  return Math.hypot(p.x - projX, p.y - projY)
}

export function distanceToPolyline(p: Point, points: Point[]): number {
  if (points.length === 0) return Infinity
  if (points.length === 1) return Math.hypot(p.x - points[0].x, p.y - points[0].y)
  let min = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    min = Math.min(min, distanceToSegment(p, points[i], points[i + 1]))
  }
  return min
}

export function pointInRect(p: Point, a: Point, b: Point): boolean {
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxY = Math.max(a.y, b.y)
  return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
}

export function pointInEllipse(p: Point, a: Point, b: Point): boolean {
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2
  const rx = Math.abs(b.x - a.x) / 2
  const ry = Math.abs(b.y - a.y) / 2
  if (rx === 0 || ry === 0) return false
  const nx = (p.x - cx) / rx
  const ny = (p.y - cy) / ry
  return nx * nx + ny * ny <= 1
}

/**
 * Turns a drawing's raw anchor pixels into the pixels that are actually
 * rendered/hit-tested — e.g. a horizontal line's single anchor becomes a
 * segment spanning the full canvas width. Anchors for two-point shapes that
 * don't extend (trendline, rectangle, ellipse, fib) and brush strokes pass
 * through unchanged.
 */
export function projectedPixelPoints(
  type: DrawingTool,
  anchors: Point[],
  width: number,
  height: number
): Point[] {
  if (type === 'horizontal') {
    return [
      { x: 0, y: anchors[0].y },
      { x: width, y: anchors[0].y }
    ]
  }
  if (type === 'vertical') {
    return [
      { x: anchors[0].x, y: 0 },
      { x: anchors[0].x, y: height }
    ]
  }
  if (type === 'ray') {
    const [a, b] = anchors
    if (a.x === b.x) return [a, { x: a.x, y: b.y >= a.y ? height : 0 }]
    const slope = (b.y - a.y) / (b.x - a.x)
    const dirRight = b.x >= a.x
    const endX = dirRight ? width : 0
    const endY = a.y + slope * (endX - a.x)
    return [a, { x: endX, y: endY }]
  }
  return anchors
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/drawingGeometry.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/drawings/geometry.ts tests/drawingGeometry.test.ts
git commit -m "Add drawing hit-testing and pixel-projection geometry"
```

---

## Task 3: Fib retracement math

**Files:**
- Create: `src/core/drawings/fib.ts`
- Test: `tests/drawingFib.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/drawingFib.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { FIB_RATIOS, fibLevels } from '@core/drawings/fib'

describe('fibLevels', () => {
  it('interpolates the standard ratios from the first anchor to the second', () => {
    const levels = fibLevels(100, 200)
    expect(levels).toHaveLength(FIB_RATIOS.length)
    expect(levels[0]).toEqual({ ratio: 0, price: 100 })
    expect(levels.find((l) => l.ratio === 0.5)?.price).toBe(150)
    expect(levels.find((l) => l.ratio === 0.618)?.price).toBeCloseTo(161.8)
    expect(levels[levels.length - 1]).toEqual({ ratio: 1, price: 200 })
  })

  it('works in reverse when the second anchor is lower than the first', () => {
    const levels = fibLevels(200, 100)
    expect(levels[0]).toEqual({ ratio: 0, price: 200 })
    expect(levels.find((l) => l.ratio === 0.5)?.price).toBe(150)
    expect(levels[levels.length - 1]).toEqual({ ratio: 1, price: 100 })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/drawingFib.test.ts`
Expected: FAIL — `Cannot find module '@core/drawings/fib'`

- [ ] **Step 3: Implement `src/core/drawings/fib.ts`**

```ts
export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const

export interface FibLevel {
  ratio: number
  price: number
}

export function fibLevels(anchorPrice: number, targetPrice: number): FibLevel[] {
  return FIB_RATIOS.map((ratio) => ({
    ratio,
    price: anchorPrice + ratio * (targetPrice - anchorPrice)
  }))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/drawingFib.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/drawings/fib.ts tests/drawingFib.test.ts
git commit -m "Add fib retracement level calculation"
```

---

## Task 4: Persistence — schema, repository, IPC, preload

**Files:**
- Modify: `src/main/database/schema.ts`
- Modify: `src/main/database/repositories.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

No automated tests here: `repositories.ts`/`ipc.ts` depend on Electron's `app` module (see `src/main/database/db.ts`'s `app.getPath('userData')`), which is why nothing in this codebase unit-tests that layer today (confirmed: no existing test touches `repositories.ts`). This is verified by `npm run typecheck` now and by the end-to-end manual pass in Task 13.

- [ ] **Step 1: Add the `drawings` table**

In `src/main/database/schema.ts`, add before the closing `` ` `` of `SCHEMA_SQL` (after the `prefs` table):

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

- [ ] **Step 2: Add repository functions**

In `src/main/database/repositories.ts`, add `Drawing` to the type import from `@shared/types` and add this import:

```ts
import { parseDrawing } from '@core/drawings/model'
```

Then append (near the other row-mapping/CRUD functions):

```ts
interface DrawingRow {
  id: string
  symbol: string
  type: string
  payload_json: string
  created_at: number
  updated_at: number
}

function mapDrawing(row: DrawingRow): Drawing | null {
  let payload: unknown = {}
  try {
    payload = JSON.parse(row.payload_json)
  } catch {
    return null
  }
  return parseDrawing({
    ...(payload as object),
    id: row.id,
    symbol: row.symbol,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  })
}

export function listDrawings(symbol: string): Drawing[] {
  const rows = getDb()
    .prepare('SELECT * FROM drawings WHERE symbol = ? ORDER BY created_at ASC')
    .all(symbol) as DrawingRow[]
  return rows.map(mapDrawing).filter((d): d is Drawing => d !== null)
}

export function saveDrawing(drawing: Drawing): void {
  getDb()
    .prepare(
      `INSERT INTO drawings (id, symbol, type, payload_json, created_at, updated_at)
       VALUES (@id, @symbol, @type, @payload, @created, @updated)
       ON CONFLICT(id) DO UPDATE SET
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`
    )
    .run({
      id: drawing.id,
      symbol: drawing.symbol,
      type: drawing.type,
      payload: JSON.stringify({
        type: drawing.type,
        points: drawing.points,
        text: drawing.text,
        style: drawing.style
      }),
      created: drawing.createdAt,
      updated: drawing.updatedAt
    })
}

export function deleteDrawing(id: string): void {
  getDb().prepare('DELETE FROM drawings WHERE id = ?').run(id)
}

export function clearDrawings(symbol: string): void {
  getDb().prepare('DELETE FROM drawings WHERE symbol = ?').run(symbol)
}
```

- [ ] **Step 3: Add IPC channel names**

In `src/shared/ipc.ts`, add to the `IPC` object (after `TRADES_LIST`):

```ts
  DRAWINGS_LIST: 'drawings:list',
  DRAWINGS_SAVE: 'drawings:save',
  DRAWINGS_DELETE: 'drawings:delete',
  DRAWINGS_CLEAR: 'drawings:clear',
```

- [ ] **Step 4: Wire the IPC handlers**

In `src/main/ipc.ts`, add `Drawing` to the type import from `@shared/types`, add `clearDrawings, deleteDrawing, listDrawings, saveDrawing` to the import from `./database/repositories`, then append inside `registerIpc()` (after the `PREFS_SAVE` handler):

```ts
  handle(IPC.DRAWINGS_LIST, (_e, symbol: string) => listDrawings(symbol))

  handle(IPC.DRAWINGS_SAVE, (_e, drawing: Drawing) => saveDrawing(drawing))

  handle(IPC.DRAWINGS_DELETE, (_e, id: string) => deleteDrawing(id))

  handle(IPC.DRAWINGS_CLEAR, (_e, symbol: string) => clearDrawings(symbol))
```

- [ ] **Step 5: Expose the API in preload**

In `src/preload/index.ts`, add `Drawing` to the type import from `../shared/types`, then add to the `api` object (after `prefs`):

```ts
  drawings: {
    list: (symbol: string) => ipcRenderer.invoke(IPC.DRAWINGS_LIST, symbol) as Promise<Drawing[]>,
    save: (drawing: Drawing) => ipcRenderer.invoke(IPC.DRAWINGS_SAVE, drawing) as Promise<void>,
    delete: (id: string) => ipcRenderer.invoke(IPC.DRAWINGS_DELETE, id) as Promise<void>,
    clear: (symbol: string) => ipcRenderer.invoke(IPC.DRAWINGS_CLEAR, symbol) as Promise<void>
  }
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS. Fix any import/type mismatches surfaced.

- [ ] **Step 7: Commit**

```bash
git add src/main/database/schema.ts src/main/database/repositories.ts src/shared/ipc.ts src/main/ipc.ts src/preload/index.ts
git commit -m "Add drawings table, repository, IPC channels, and preload API"
```

---

## Task 5: Store — drawings state and actions

**Files:**
- Modify: `src/renderer/src/store/useAppStore.ts`

- [ ] **Step 1: Add imports**

Add to the `@shared/types` type import list: `ChartTool, Drawing, DrawingPoint, DrawingStyle, DrawingTool`.

Add a new import line:

```ts
import { DEFAULT_DRAWING_STYLE, DRAWING_TOOLS } from '@core/drawings/model'
```

- [ ] **Step 2: Add state fields**

In `interface AppState`, after `horizontalLevels: number[]` (line 85), add:

```ts
  drawings: Drawing[]
  drawingsHidden: boolean
  activeTool: ChartTool | null
  selectedDrawingId: string | null
  drawingDefaults: Record<DrawingTool, DrawingStyle>
```

- [ ] **Step 3: Add action signatures**

In `interface AppState`, after `addHorizontal: (price: number) => void` (line 146), add:

```ts
  setActiveTool: (tool: ChartTool | null) => void
  selectDrawing: (id: string | null) => void
  setDrawingsHidden: (hidden: boolean) => void
  addDrawing: (input: { type: DrawingTool; points: DrawingPoint[]; text?: string }) => string
  updateDrawing: (
    id: string,
    patch: { points?: DrawingPoint[]; text?: string; style?: Partial<DrawingStyle>; immediate?: boolean }
  ) => void
  removeDrawing: (id: string) => void
  clearDrawings: () => void
  loadDrawingsForSymbol: (symbol: string) => Promise<void>
```

- [ ] **Step 4: Add the debounced-save helper next to `persistDesk`**

Inside `create<AppState>((set, get) => { ... })`, right after the `persistDesk` closure (around line 244), add:

```ts
  const drawingSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()

  const saveDrawingNow = (drawing: Drawing): void => {
    const api = desktop()
    if (api?.drawings) void api.drawings.save(drawing)
  }

  const scheduleDrawingSave = (drawing: Drawing, immediate: boolean): void => {
    const existing = drawingSaveTimers.get(drawing.id)
    if (existing) clearTimeout(existing)
    if (immediate) {
      drawingSaveTimers.delete(drawing.id)
      saveDrawingNow(drawing)
      return
    }
    drawingSaveTimers.set(
      drawing.id,
      setTimeout(() => {
        drawingSaveTimers.delete(drawing.id)
        saveDrawingNow(drawing)
      }, 300)
    )
  }
```

- [ ] **Step 5: Add initial state**

In the returned state object, after `horizontalLevels: [],` (line 280), add:

```ts
  drawings: [],
  drawingsHidden: false,
  activeTool: null,
  selectedDrawingId: null,
  drawingDefaults: Object.fromEntries(
    DRAWING_TOOLS.map((t) => [t, { ...DEFAULT_DRAWING_STYLE }])
  ) as Record<DrawingTool, DrawingStyle>,
```

- [ ] **Step 6: Implement the actions**

After the `addHorizontal` implementation (line 1195, currently the last entry before the closing `}`), add (note the trailing comma now needed on `addHorizontal`'s line):

```ts
  setActiveTool: (tool) => set({ activeTool: tool, selectedDrawingId: tool ? null : get().selectedDrawingId }),

  selectDrawing: (id) => set({ selectedDrawingId: id, activeTool: id ? null : get().activeTool }),

  setDrawingsHidden: (hidden) => set({ drawingsHidden: hidden }),

  addDrawing: (input) => {
    const id = newId()
    const now = Date.now()
    const drawing: Drawing = {
      id,
      symbol: get().symbol,
      type: input.type,
      points: input.points,
      text: input.text,
      style: { ...get().drawingDefaults[input.type] },
      createdAt: now,
      updatedAt: now
    }
    set({ drawings: [...get().drawings, drawing], selectedDrawingId: id, activeTool: null })
    scheduleDrawingSave(drawing, true)
    return id
  },

  updateDrawing: (id, patch) => {
    let updated: Drawing | undefined
    const drawings = get().drawings.map((d) => {
      if (d.id !== id) return d
      updated = {
        ...d,
        points: patch.points ?? d.points,
        text: patch.text !== undefined ? patch.text : d.text,
        style: patch.style ? { ...d.style, ...patch.style } : d.style,
        updatedAt: Date.now()
      }
      return updated
    })
    if (!updated) return
    set({ drawings })
    if (patch.style) {
      set({ drawingDefaults: { ...get().drawingDefaults, [updated.type]: updated.style } })
    }
    scheduleDrawingSave(updated, patch.immediate ?? false)
  },

  removeDrawing: (id) => {
    set({
      drawings: get().drawings.filter((d) => d.id !== id),
      selectedDrawingId: get().selectedDrawingId === id ? null : get().selectedDrawingId
    })
    const timer = drawingSaveTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      drawingSaveTimers.delete(id)
    }
    const api = desktop()
    if (api?.drawings) void api.drawings.delete(id)
  },

  clearDrawings: () => {
    const symbol = get().symbol
    set({ drawings: [], selectedDrawingId: null })
    const api = desktop()
    if (api?.drawings) void api.drawings.clear(symbol)
  },

  loadDrawingsForSymbol: async (symbol) => {
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
```

- [ ] **Step 7: Load drawings whenever the symbol changes**

After the `export const useAppStore = create<AppState>((set, get) => { ... })` block closes (the final `})` that currently ends the file), add:

```ts

useAppStore.subscribe((state, prev) => {
  if (state.symbol !== prev.symbol) void state.loadDrawingsForSymbol(state.symbol)
})
```

This fires whenever `symbol` changes for *any* reason (`bootstrap`, `selectSymbol`, `loadDataset`, `loadSession`, etc.) without needing to call it from every one of those call sites individually.

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/store/useAppStore.ts
git commit -m "Add drawings state slice with symbol-scoped persistence"
```

---

## Task 6: DrawingLayer — read-only rendering

**Files:**
- Create: `src/renderer/src/components/DrawingLayer.tsx`

This first pass only paints whatever is in `drawings` (nothing yet, since there's no way to create one) and proves the canvas-sizing/coordinate-sync plumbing works. Placement is added in Task 7.

- [ ] **Step 1: Implement the component**

Create `src/renderer/src/components/DrawingLayer.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import type { Drawing, DrawingPoint } from '@shared/types'
import { fibLevels } from '@core/drawings/fib'
import { projectedPixelPoints, type Point } from '@core/drawings/geometry'
import { useAppStore } from '../store/useAppStore'

interface Props {
  chart: IChartApi | null
  series: ISeriesApi<'Candlestick'> | null
  host: HTMLDivElement | null
}

export function DrawingLayer({ chart, series, host }: Props): React.JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawings = useAppStore((s) => s.drawings)
  const drawingsHidden = useAppStore((s) => s.drawingsHidden)
  const drawingsRef = useRef(drawings)
  drawingsRef.current = drawings

  function toPixel(point: DrawingPoint): Point | null {
    if (!chart || !series) return null
    const x = chart.timeScale().timeToCoordinate((point.time / 1000) as UTCTimestamp)
    const y = series.priceToCoordinate(point.price)
    if (x == null || y == null) return null
    return { x, y }
  }

  function drawingPixels(drawing: Drawing, width: number, height: number): Point[] | null {
    const pixels: Point[] = []
    for (const point of drawing.points) {
      const pixel = toPixel(point)
      if (!pixel) return null
      pixels.push(pixel)
    }
    return projectedPixelPoints(drawing.type, pixels, width, height)
  }

  function paint(): void {
    const canvas = canvasRef.current
    if (!canvas || !chart || !series || !host) return
    const width = host.clientWidth
    const height = host.clientHeight
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    if (drawingsHidden) return
    for (const drawing of drawingsRef.current) {
      const pixels = drawingPixels(drawing, width, height)
      if (!pixels) continue
      paintShape(ctx, drawing, pixels, (price) => series.priceToCoordinate(price))
    }
  }

  useEffect(() => {
    if (!chart || !series || !host) return
    let raf = 0
    const loop = (): void => {
      paint()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [chart, series, host, drawings, drawingsHidden])

  return <canvas className="drawing-layer-canvas" ref={canvasRef} data-capture="false" />
}

function paintShape(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  pixels: Point[],
  toY: (price: number) => number | null
): void {
  ctx.save()
  ctx.strokeStyle = drawing.style.color
  ctx.fillStyle = drawing.style.color
  ctx.lineWidth = drawing.style.lineWidth
  ctx.setLineDash(drawing.style.dashed ? [6, 4] : [])
  ctx.font = '11px "IBM Plex Mono", monospace'

  if (drawing.type === 'rectangle') {
    const [a, b] = pixels
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    const w = Math.abs(b.x - a.x)
    const h = Math.abs(b.y - a.y)
    ctx.globalAlpha = 0.12
    ctx.fillRect(x, y, w, h)
    ctx.globalAlpha = 1
    ctx.strokeRect(x, y, w, h)
  } else if (drawing.type === 'ellipse') {
    const [a, b] = pixels
    const cx = (a.x + b.x) / 2
    const cy = (a.y + b.y) / 2
    const rx = Math.abs(b.x - a.x) / 2
    const ry = Math.abs(b.y - a.y) / 2
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.globalAlpha = 0.12
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.stroke()
  } else if (drawing.type === 'text') {
    const [a] = pixels
    ctx.textBaseline = 'bottom'
    ctx.fillText(drawing.text ?? '', a.x + 4, a.y - 4)
  } else if (drawing.type === 'fib') {
    const [a, b] = drawing.points
    const x0 = Math.min(pixels[0].x, pixels[1].x)
    const x1 = Math.max(pixels[0].x, pixels[1].x)
    for (const level of fibLevels(a.price, b.price)) {
      const y = toY(level.price)
      if (y == null) continue
      ctx.beginPath()
      ctx.moveTo(x0, y)
      ctx.lineTo(x1, y)
      ctx.stroke()
      ctx.fillText(`${(level.ratio * 100).toFixed(1)}%  ${level.price.toFixed(2)}`, x1 + 4, y - 2)
    }
  } else {
    ctx.beginPath()
    pixels.forEach((point, i) => (i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)))
    ctx.stroke()
  }
  ctx.restore()
}
```

- [ ] **Step 2: Add the canvas overlay CSS**

In `src/renderer/src/styles/global.css`, add near `.pos-tool`:

```css
.drawing-layer-canvas {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
}

.drawing-layer-canvas[data-capture='true'] {
  pointer-events: auto;
}
```

- [ ] **Step 3: Mount it in `ChartPanel.tsx`**

In `src/renderer/src/components/ChartPanel.tsx`, import and render it next to `ChartTradeOverlay` (it needs to sit visually above the SL/TP overlay, so mount it *after* `<ChartTradeOverlay />`):

```tsx
import { DrawingLayer } from './DrawingLayer'
```

```tsx
        <ChartTradeOverlay chart={chartApi} series={seriesApi} host={hostRef.current} />
        <DrawingLayer chart={chartApi} series={seriesApi} host={hostRef.current} />
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Manual smoke check**

Use the `run` skill to launch the app. Confirm: the chart loads and behaves exactly as before (no visible change yet — there are no drawings to render), and there are no console errors from the new canvas element.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/DrawingLayer.tsx src/renderer/src/components/ChartPanel.tsx src/renderer/src/styles/global.css
git commit -m "Add read-only drawing canvas layer"
```

---

## Task 7: DrawingLayer — placing drawings

**Files:**
- Modify: `src/renderer/src/components/DrawingLayer.tsx`

Placement and idle-mode selection both go through `chart.subscribeClick`, which fires on genuine clicks on the chart's own canvas regardless of our overlay's `pointer-events` value — so this never fights with `lightweight-charts`' own pan/zoom handling. Live preview of an in-progress two-point drawing uses `chart.subscribeCrosshairMove`. Brush and measure need actual drag-tracking (not just clicks), so the overlay canvas temporarily becomes `pointer-events: auto` only while one of those two tools is active (see `data-capture`).

Single-point tools (horizontal, vertical) commit on the first click. `text` also commits on the first click, using a native `window.prompt()` for the note body — the simplest thing that works for v1; an inline editable text box is a natural follow-up, not required here. Two-point tools (trendline, ray, rectangle, ellipse, fib) commit on the second click. Brush draws continuously between `pointerdown` and `pointerup`. Measure is drag-only and never persists.

- [ ] **Step 1: Add placement state and helpers**

In `DrawingLayer.tsx`, add to the imports:

```tsx
import type { ChartTool, DrawingTool } from '@shared/types'
import type { MouseEventParams } from 'lightweight-charts'
```

Inside the component, after the existing `drawingsRef` lines, add:

```tsx
  const activeTool = useAppStore((s) => s.activeTool)
  const activeToolRef = useRef<ChartTool | null>(activeTool)
  activeToolRef.current = activeTool
  const pendingPointsRef = useRef<DrawingPoint[]>([])
  const previewPointRef = useRef<DrawingPoint | null>(null)

  useEffect(() => {
    pendingPointsRef.current = []
    previewPointRef.current = null
  }, [activeTool])

  function fromPixel(pixel: Point): DrawingPoint | null {
    if (!chart || !series) return null
    const time = chart.timeScale().coordinateToTime(pixel.x) as UTCTimestamp | null
    const price = series.coordinateToPrice(pixel.y)
    if (time == null || price == null) return null
    return { time: time * 1000, price }
  }
```

- [ ] **Step 2: Add click/crosshair-driven placement**

Add a new effect (after the RAF paint-loop effect):

```tsx
  useEffect(() => {
    if (!chart || !series || !host) return

    const commitPoint = (point: DrawingPoint, tool: DrawingTool): void => {
      if (tool === 'horizontal' || tool === 'vertical' || tool === 'text') {
        if (tool === 'text') {
          const value = window.prompt('Note text', '')
          if (!value) {
            useAppStore.getState().setActiveTool(null)
            return
          }
          useAppStore.getState().addDrawing({ type: tool, points: [point], text: value })
          return
        }
        useAppStore.getState().addDrawing({ type: tool, points: [point] })
        return
      }
      const pending = pendingPointsRef.current
      if (pending.length === 0) {
        pendingPointsRef.current = [point]
        return
      }
      useAppStore.getState().addDrawing({ type: tool, points: [pending[0], point] })
      pendingPointsRef.current = []
    }

    const onClick = (param: MouseEventParams): void => {
      if (!param.point) return
      const tool = activeToolRef.current
      if (!tool) {
        const width = host.clientWidth
        const height = host.clientHeight
        const hitId = hitTest(param.point, width, height)
        useAppStore.getState().selectDrawing(hitId)
        return
      }
      if (tool === 'brush' || tool === 'measure') return
      const point = fromPixel(param.point)
      if (!point) return
      commitPoint(point, tool)
    }

    const onCrosshairMove = (param: MouseEventParams): void => {
      if (!param.point || pendingPointsRef.current.length === 0) {
        previewPointRef.current = null
        return
      }
      previewPointRef.current = fromPixel(param.point)
    }

    chart.subscribeClick(onClick)
    chart.subscribeCrosshairMove(onCrosshairMove)
    return () => {
      chart.unsubscribeClick(onClick)
      chart.unsubscribeCrosshairMove(onCrosshairMove)
    }
  }, [chart, series, host])

  function hitTest(target: Point, width: number, height: number): string | null {
    for (let i = drawingsRef.current.length - 1; i >= 0; i--) {
      const drawing = drawingsRef.current[i]
      const pixels = drawingPixels(drawing, width, height)
      if (!pixels) continue
      if (drawing.type === 'rectangle' || drawing.type === 'fib') {
        if (pointInRect(target, pixels[0], pixels[1])) return drawing.id
      } else if (drawing.type === 'ellipse') {
        if (pointInEllipse(target, pixels[0], pixels[1])) return drawing.id
      } else if (drawing.type === 'text') {
        if (Math.hypot(target.x - pixels[0].x, target.y - pixels[0].y) <= 14) return drawing.id
      } else if (distanceToPolyline(target, pixels) <= 6) {
        return drawing.id
      }
    }
    return null
  }
```

Add `distanceToPolyline, pointInEllipse, pointInRect` to the `@core/drawings/geometry` import.

- [ ] **Step 3: Render the live two-point preview**

Extend `paint()`'s body (after the persisted-drawings loop, still inside the `if (drawingsHidden) return` guard's else path — i.e. add this after the `for (const drawing of drawingsRef.current)` loop, still within `paint()`):

```tsx
    const tool = activeToolRef.current
    if (tool && tool !== 'brush' && tool !== 'measure' && pendingPointsRef.current.length > 0) {
      const anchorPixel = toPixel(pendingPointsRef.current[0])
      const livePoint = previewPointRef.current
      const livePixel = livePoint ? toPixel(livePoint) : null
      if (anchorPixel && livePixel) {
        const preview: Drawing = {
          id: '__preview__',
          symbol: '',
          type: tool,
          points: [pendingPointsRef.current[0], livePoint as DrawingPoint],
          style: { color: '#4a45d4', lineWidth: 1, dashed: true },
          createdAt: 0,
          updatedAt: 0
        }
        const previewPixels = projectedPixelPoints(tool, [anchorPixel, livePixel], width, height)
        paintShape(ctx, preview, previewPixels, (price) => series.priceToCoordinate(price))
      }
    }
```

- [ ] **Step 4: Add brush and measure drag-capture**

Add a new effect:

```tsx
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !host) return
    const capturing = activeTool === 'brush' || activeTool === 'measure'
    canvas.dataset.capture = capturing ? 'true' : 'false'
    if (!capturing) return

    const bounds = (): DOMRect => host.getBoundingClientRect()

    if (activeTool === 'brush') {
      let points: DrawingPoint[] = []
      let lastPixel: Point | null = null
      const onDown = (event: PointerEvent): void => {
        const box = bounds()
        const pixel = { x: event.clientX - box.left, y: event.clientY - box.top }
        const point = fromPixel(pixel)
        if (!point) return
        points = [point]
        lastPixel = pixel
      }
      const onMove = (event: PointerEvent): void => {
        if (points.length === 0) return
        const box = bounds()
        const pixel = { x: event.clientX - box.left, y: event.clientY - box.top }
        if (lastPixel && Math.hypot(pixel.x - lastPixel.x, pixel.y - lastPixel.y) < 3) return
        const point = fromPixel(pixel)
        if (!point) return
        points = [...points, point]
        lastPixel = pixel
        pendingPointsRef.current = points
      }
      const onUp = (): void => {
        if (points.length >= 2) useAppStore.getState().addDrawing({ type: 'brush', points })
        points = []
        pendingPointsRef.current = []
        useAppStore.getState().setActiveTool(null)
      }
      canvas.addEventListener('pointerdown', onDown)
      canvas.addEventListener('pointermove', onMove)
      canvas.addEventListener('pointerup', onUp)
      return () => {
        canvas.removeEventListener('pointerdown', onDown)
        canvas.removeEventListener('pointermove', onMove)
        canvas.removeEventListener('pointerup', onUp)
      }
    }

    let anchor: DrawingPoint | null = null
    const onDown = (event: PointerEvent): void => {
      const box = bounds()
      anchor = fromPixel({ x: event.clientX - box.left, y: event.clientY - box.top })
    }
    const onMove = (event: PointerEvent): void => {
      if (!anchor) return
      const box = bounds()
      const pixel = { x: event.clientX - box.left, y: event.clientY - box.top }
      const point = fromPixel(pixel)
      if (!point) return
      const deltaPrice = point.price - anchor.price
      const deltaPct = (deltaPrice / anchor.price) * 100
      const candles = useAppStore.getState().displayCandles
      const lo = Math.min(anchor.time, point.time)
      const hi = Math.max(anchor.time, point.time)
      const bars = candles.filter((c) => c.timestamp >= lo && c.timestamp <= hi).length
      setMeasureReadout({
        left: pixel.x,
        top: pixel.y,
        text: `${deltaPrice >= 0 ? '+' : ''}${deltaPrice.toFixed(2)} (${deltaPct.toFixed(2)}%) · ${bars} bars`
      })
    }
    const onUp = (): void => {
      anchor = null
      setMeasureReadout(null)
      useAppStore.getState().setActiveTool(null)
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
    }
  }, [activeTool, chart, series, host])
```

Add the measure-readout state near the top of the component (with the other refs):

```tsx
  const [measureReadout, setMeasureReadout] = useState<{ left: number; top: number; text: string } | null>(null)
```

Add `useState` to the `react` import. Render the readout in the returned JSX (replace the current single-`<canvas>` return with a fragment):

```tsx
  return (
    <>
      <canvas className="drawing-layer-canvas" ref={canvasRef} data-capture="false" />
      {measureReadout ? (
        <div className="drawing-measure-label" style={{ left: measureReadout.left, top: measureReadout.top }}>
          {measureReadout.text}
        </div>
      ) : null}
    </>
  )
```

- [ ] **Step 5: Add the measure-label CSS**

In `global.css`, add:

```css
.drawing-measure-label {
  position: absolute;
  z-index: 7;
  padding: 4px 8px;
  background: rgba(18, 22, 18, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 6px;
  color: #fff;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  white-space: nowrap;
  pointer-events: none;
  transform: translate(12px, -50%);
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Manual verification**

There's no toolbar yet, so drive `activeTool` directly from the devtools console while the app is running (`run` skill): open devtools in the Electron window and, with a symbol loaded, note that there's no global store handle yet — instead, defer full manual verification of placement to Task 12 once the toolbar exists. For now just confirm `npm run typecheck` passes and the app still launches without runtime errors (`run` skill: open the app, confirm the chart renders normally).

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/DrawingLayer.tsx src/renderer/src/styles/global.css
git commit -m "Add click-to-place drawing creation, brush, and measure tool"
```

---

## Task 8: DrawingLayer — selection and drag handles

**Files:**
- Modify: `src/renderer/src/components/DrawingLayer.tsx`

- [ ] **Step 1: Add handle dragging**

Add to the component, after the placement effect:

```tsx
  const selectedDrawingId = useAppStore((s) => s.selectedDrawingId)
  const selected = drawings.find((d) => d.id === selectedDrawingId) ?? null

  function dragHandle(index: number, event: React.PointerEvent<HTMLButtonElement>): void {
    event.preventDefault()
    event.stopPropagation()
    if (!selected || !host) return
    const box = host.getBoundingClientRect()
    const move = (ev: PointerEvent): void => {
      const point = fromPixel({ x: ev.clientX - box.left, y: ev.clientY - box.top })
      if (!point) return
      const points = [...selected.points]
      points[index] = point
      useAppStore.getState().updateDrawing(selected.id, { points })
    }
    const up = (ev: PointerEvent): void => {
      const point = fromPixel({ x: ev.clientX - box.left, y: ev.clientY - box.top })
      const points = [...selected.points]
      if (point) points[index] = point
      useAppStore.getState().updateDrawing(selected.id, { points, immediate: true })
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
```

- [ ] **Step 2: Render the handles**

Update the returned JSX to include one handle per anchor point of the selected drawing:

```tsx
  return (
    <>
      <canvas className="drawing-layer-canvas" ref={canvasRef} data-capture="false" />
      {selected
        ? selected.points.map((point, index) => {
            const pixel = toPixel(point)
            if (!pixel) return null
            return (
              <button
                key={index}
                type="button"
                className="drawing-handle"
                style={{ left: pixel.x, top: pixel.y }}
                aria-label={`Drag ${selected.type} anchor ${index + 1}`}
                onPointerDown={(event) => dragHandle(index, event)}
              />
            )
          })
        : null}
      {measureReadout ? (
        <div className="drawing-measure-label" style={{ left: measureReadout.left, top: measureReadout.top }}>
          {measureReadout.text}
        </div>
      ) : null}
    </>
  )
```

- [ ] **Step 3: Add the handle CSS**

In `global.css`:

```css
.drawing-handle {
  position: absolute;
  z-index: 6;
  width: 10px;
  height: 10px;
  padding: 0;
  min-height: 0;
  min-width: 0;
  border: 2px solid var(--brand);
  border-radius: 50%;
  background: var(--parchment);
  transform: translate(-50%, -50%);
  pointer-events: auto;
  cursor: move;
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/DrawingLayer.tsx src/renderer/src/styles/global.css
git commit -m "Add drawing selection and drag-to-edit handles"
```

---

## Task 9: DrawingStyleMenu — color/width/dashed/delete

**Files:**
- Create: `src/renderer/src/components/DrawingStyleMenu.tsx`
- Modify: `src/renderer/src/components/DrawingLayer.tsx`

- [ ] **Step 1: Implement the component**

Create `src/renderer/src/components/DrawingStyleMenu.tsx`:

```tsx
import type { Drawing, DrawingStyle } from '@shared/types'
import type { Point } from '@core/drawings/geometry'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'

const COLORS = ['#4a45d4', '#5dcec0', '#e07a5f', '#c9863a', '#e5e5f0']
const WIDTHS = [1, 2, 3, 4]

export function DrawingStyleMenu({
  drawing,
  anchor,
  onStyleChange,
  onDelete
}: {
  drawing: Drawing
  anchor: Point
  onStyleChange: (style: Partial<DrawingStyle>) => void
  onDelete: () => void
}): React.JSX.Element {
  return (
    <div className="drawing-style-menu" style={{ left: anchor.x, top: anchor.y }}>
      {COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className="drawing-color-swatch"
          data-active={drawing.style.color === color}
          style={{ background: color }}
          aria-label={`Color ${color}`}
          onClick={() => onStyleChange({ color })}
        />
      ))}
      <Dropdown
        value={drawing.style.lineWidth}
        onChange={(lineWidth) => onStyleChange({ lineWidth })}
        options={WIDTHS.map((w) => ({ value: w, label: `${w}px` }))}
        ariaLabel="Line width"
      />
      <button
        type="button"
        className="icon-btn"
        data-active={drawing.style.dashed}
        aria-label="Toggle dashed"
        title="Dashed"
        onClick={() => onStyleChange({ dashed: !drawing.style.dashed })}
      >
        <Icon name="dashed" size={12} />
      </button>
      <button
        type="button"
        className="icon-btn danger"
        aria-label="Delete drawing"
        title="Delete"
        onClick={onDelete}
      >
        <Icon name="trash" />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Add the `dashed` icon**

In `src/renderer/src/components/Icon.tsx`, add `'dashed'` to `IconName` and to `PATHS`:

```ts
  dashed: 'M3 12h3M10 12h3M17 12h3',
```

- [ ] **Step 3: Mount it from `DrawingLayer.tsx`**

Import it and render it alongside the handles when a drawing is selected:

```tsx
import { DrawingStyleMenu } from './DrawingStyleMenu'
```

```tsx
      {selected
        ? (() => {
            const anchor = toPixel(selected.points[0])
            return anchor ? (
              <DrawingStyleMenu
                drawing={selected}
                anchor={anchor}
                onStyleChange={(style) => useAppStore.getState().updateDrawing(selected.id, { style, immediate: true })}
                onDelete={() => useAppStore.getState().removeDrawing(selected.id)}
              />
            ) : null
          })()
        : null}
```

Place this block right after the handles map in the returned JSX.

- [ ] **Step 4: Add the style-menu CSS**

In `global.css`:

```css
.drawing-style-menu {
  position: absolute;
  z-index: 7;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--steel);
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  transform: translate(-50%, calc(-100% - 12px));
  pointer-events: auto;
}

.drawing-color-swatch {
  width: 16px;
  height: 16px;
  padding: 0;
  min-height: 0;
  min-width: 0;
  border-radius: 50%;
  border: 1px solid var(--rule);
  cursor: pointer;
}

.drawing-color-swatch[data-active='true'] {
  border-color: var(--parchment);
  box-shadow: 0 0 0 2px var(--brand);
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/DrawingStyleMenu.tsx src/renderer/src/components/DrawingLayer.tsx src/renderer/src/components/Icon.tsx src/renderer/src/styles/global.css
git commit -m "Add per-drawing style menu (color, width, dashed, delete)"
```

---

## Task 10: Keyboard shortcuts

**Files:**
- Modify: `src/renderer/src/hooks/useKeyboard.ts`

- [ ] **Step 1: Add Delete/Backspace and extend Escape**

In `src/renderer/src/hooks/useKeyboard.ts`, add a case (anywhere in the `switch`, e.g. after `'R':`):

```ts
        case 'Delete':
        case 'Backspace':
          if (store.selectedDrawingId) store.removeDrawing(store.selectedDrawingId)
          break
```

Update the existing `Escape` case to also back out of drawing mode:

```ts
        case 'Escape':
          if (store.chartFull) store.setChartFull(false)
          else if (store.activeTool) store.setActiveTool(null)
          else if (store.selectedDrawingId) store.selectDrawing(null)
          break
```

Note this file's top-level guard already returns early for `Escape` when `store.screen !== 'workspace'` — no change needed there since drawings only exist inside the workspace.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/hooks/useKeyboard.ts
git commit -m "Wire Delete/Backspace/Escape to drawing selection and tool state"
```

---

## Task 11: Toolbar icons

**Files:**
- Modify: `src/renderer/src/components/Icon.tsx`

- [ ] **Step 1: Add the new icon names and paths**

Add to `IconName`:

```ts
  | 'cursor'
  | 'trendLine'
  | 'horizontalLine'
  | 'ray'
  | 'verticalLine'
  | 'rectangle'
  | 'ellipse'
  | 'fib'
  | 'text'
  | 'brush'
  | 'measure'
```

(`dashed` was already added in Task 9.)

Add to `PATHS`:

```ts
  cursor: 'M4 3l16 6-6.5 2.5L11 18z',
  trendLine: 'M4 20L20 4',
  horizontalLine: 'M3 12h18',
  ray: 'M3 12h14m0 0-4-4m4 4-4 4',
  verticalLine: 'M12 3v18',
  rectangle: 'M4 6h16v12H4z',
  ellipse: 'M4 12a8 5 0 1 0 16 0 8 5 0 1 0-16 0z',
  fib: 'M3 6h18M6 10.5h12M9 15h6M6 19.5h12',
  text: 'M5 4h14M12 4v16M8 20h8',
  brush: 'M3 21l4-1L18 9l-3-3L4 17l-1 4zM15 4l3 3',
  measure: 'M4 16L16 4M7 13l2 2M11 9l2 2'
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Icon.tsx
git commit -m "Add drawing-tool icons"
```

---

## Task 12: DrawingToolbar + final wiring

**Files:**
- Create: `src/renderer/src/components/DrawingToolbar.tsx`
- Modify: `src/renderer/src/components/ChartPanel.tsx`
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Implement the toolbar**

Create `src/renderer/src/components/DrawingToolbar.tsx`:

```tsx
import { useState } from 'react'
import type { ChartTool, DrawingTool } from '@shared/types'
import { Icon, type IconName } from './Icon'
import { ConfirmIconButton } from './ConfirmIconButton'
import { useAppStore } from '../store/useAppStore'

const LINE_TOOLS: { tool: DrawingTool; icon: IconName; label: string }[] = [
  { tool: 'trendline', icon: 'trendLine', label: 'Trend line' },
  { tool: 'horizontal', icon: 'horizontalLine', label: 'Horizontal line' },
  { tool: 'ray', icon: 'ray', label: 'Ray' },
  { tool: 'vertical', icon: 'verticalLine', label: 'Vertical line' }
]

const SHAPE_TOOLS: { tool: DrawingTool; icon: IconName; label: string }[] = [
  { tool: 'rectangle', icon: 'rectangle', label: 'Rectangle' },
  { tool: 'ellipse', icon: 'ellipse', label: 'Ellipse' }
]

export function DrawingToolbar(): React.JSX.Element {
  const activeTool = useAppStore((s) => s.activeTool)
  const setActiveTool = useAppStore((s) => s.setActiveTool)
  const clearDrawings = useAppStore((s) => s.clearDrawings)
  const drawingsHidden = useAppStore((s) => s.drawingsHidden)
  const setDrawingsHidden = useAppStore((s) => s.setDrawingsHidden)
  const [openFlyout, setOpenFlyout] = useState<'lines' | 'shapes' | null>(null)

  function pick(tool: ChartTool): void {
    setActiveTool(activeTool === tool ? null : tool)
    setOpenFlyout(null)
  }

  const activeLineTool = LINE_TOOLS.find((t) => t.tool === activeTool)
  const activeShapeTool = SHAPE_TOOLS.find((t) => t.tool === activeTool)

  return (
    <div className="drawing-toolbar">
      <button
        type="button"
        className="icon-btn"
        data-active={activeTool === null}
        title="Cursor"
        aria-label="Cursor"
        onClick={() => setActiveTool(null)}
      >
        <Icon name="cursor" />
      </button>

      <div className="drawing-toolbar-group">
        <button
          type="button"
          className="icon-btn"
          data-active={activeLineTool != null}
          title={activeLineTool?.label ?? 'Line tools'}
          aria-label="Line tools"
          onClick={() => setOpenFlyout(openFlyout === 'lines' ? null : 'lines')}
        >
          <Icon name={activeLineTool?.icon ?? 'trendLine'} />
        </button>
        {openFlyout === 'lines' ? (
          <div className="drawing-flyout">
            {LINE_TOOLS.map(({ tool, icon, label }) => (
              <button
                key={tool}
                type="button"
                className="icon-btn"
                data-active={activeTool === tool}
                title={label}
                aria-label={label}
                onClick={() => pick(tool)}
              >
                <Icon name={icon} />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="drawing-toolbar-group">
        <button
          type="button"
          className="icon-btn"
          data-active={activeShapeTool != null}
          title={activeShapeTool?.label ?? 'Shapes'}
          aria-label="Shapes"
          onClick={() => setOpenFlyout(openFlyout === 'shapes' ? null : 'shapes')}
        >
          <Icon name={activeShapeTool?.icon ?? 'rectangle'} />
        </button>
        {openFlyout === 'shapes' ? (
          <div className="drawing-flyout">
            {SHAPE_TOOLS.map(({ tool, icon, label }) => (
              <button
                key={tool}
                type="button"
                className="icon-btn"
                data-active={activeTool === tool}
                title={label}
                aria-label={label}
                onClick={() => pick(tool)}
              >
                <Icon name={icon} />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="icon-btn"
        data-active={activeTool === 'fib'}
        title="Fib retracement"
        aria-label="Fib retracement"
        onClick={() => pick('fib')}
      >
        <Icon name="fib" />
      </button>

      <button
        type="button"
        className="icon-btn"
        data-active={activeTool === 'text'}
        title="Text"
        aria-label="Text"
        onClick={() => pick('text')}
      >
        <Icon name="text" />
      </button>

      <button
        type="button"
        className="icon-btn"
        data-active={activeTool === 'brush'}
        title="Brush"
        aria-label="Brush"
        onClick={() => pick('brush')}
      >
        <Icon name="brush" />
      </button>

      <button
        type="button"
        className="icon-btn"
        data-active={activeTool === 'measure'}
        title="Measure"
        aria-label="Measure"
        onClick={() => pick('measure')}
      >
        <Icon name="measure" />
      </button>

      <button
        type="button"
        className="icon-btn"
        data-active={drawingsHidden}
        title={drawingsHidden ? 'Show drawings' : 'Hide drawings'}
        aria-label={drawingsHidden ? 'Show drawings' : 'Hide drawings'}
        onClick={() => setDrawingsHidden(!drawingsHidden)}
      >
        <Icon name={drawingsHidden ? 'eyeOff' : 'eye'} />
      </button>

      <ConfirmIconButton
        icon="trash"
        label="Clear all drawings"
        confirmLabel="Confirm clear"
        onConfirm={clearDrawings}
      />
    </div>
  )
}
```

- [ ] **Step 2: Mount it in `ChartPanel.tsx`**

```tsx
import { DrawingToolbar } from './DrawingToolbar'
```

Render it as a sibling of `.chart` inside `.chart-shell` (after the `chart-frame-btn`/`chart-trade-actions` buttons, before the `<div className="chart">`):

```tsx
      <DrawingToolbar />
```

Also set the crosshair cursor on `.chart` while a tool is active — pass a `data-drawing-active` attribute:

```tsx
      <div className="chart" data-drawing-active={useAppStore((s) => s.activeTool) !== null} ref={hostRef}>
```

- [ ] **Step 3: Add the toolbar CSS**

In `global.css`:

```css
.chart[data-drawing-active='true'] {
  cursor: crosshair;
}

.drawing-toolbar {
  position: absolute;
  top: 54px;
  left: 10px;
  z-index: 6;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  background: var(--steel);
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm);
}

.drawing-toolbar-group {
  position: relative;
}

.drawing-flyout {
  position: absolute;
  left: calc(100% + 6px);
  top: 0;
  z-index: 7;
  display: flex;
  gap: 4px;
  padding: 6px;
  background: var(--steel);
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Use the `run` skill to launch the app with a symbol loaded, then:
1. Click the trend line icon (via the line-tools flyout), click twice on the chart — a trend line appears, the tool auto-deselects (cursor becomes active again).
2. Click the fib icon, click twice — 7 labeled levels appear between the two clicks.
3. Click horizontal/vertical/text/rectangle/ellipse/brush/measure in turn and confirm each places correctly; confirm measure's label disappears on release and never persists (check after reload, per Task 13).
4. Click an existing drawing with the cursor tool active (no tool selected) — handles and the style menu appear.
5. Drag a handle — the shape follows; change its color/width/dashed in the style menu — it updates live.
6. Press Delete with a drawing selected — it disappears. Press Escape mid-placement (after one click of a two-point tool) — the pending point is discarded.
7. Click the eye icon — all drawings hide; click again — they reappear. Click trash, confirm — all drawings for the symbol are gone.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/DrawingToolbar.tsx src/renderer/src/components/ChartPanel.tsx src/renderer/src/styles/global.css
git commit -m "Add drawing toolbar and mount the full drawing toolkit"
```

---

## Task 13: End-to-end verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full manual pass**

Use the `run` skill. Beyond the per-tool checks already done in Task 12, specifically verify the cross-cutting behaviors from the design doc:

1. Draw a trend line, reload the app (or restart it) — the drawing is still there, in the same place.
2. Switch to a different symbol that has no drawings — the chart is empty of drawings; switch back — the original drawing reappears. Drawings don't leak across symbols.
3. Start a manual trade (Buy/Sell) so the SL/TP drag handles and price lines from `ChartTradeOverlay` are visible, then confirm: the chart still pans/zooms normally, the crosshair still works, and the SL/TP handles still drag correctly with a drawing tool inactive.
4. With a drawing tool active, confirm chart panning is suspended for that click (matches TradingView) and resumes once the tool is placed or cancelled.
5. Draw a rectangle and an ellipse; confirm clicking anywhere inside their body (not just the border) selects them.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS (all existing tests plus `drawingModel.test.ts`, `drawingGeometry.test.ts`, `drawingFib.test.ts`).

- [ ] **Step 3: Final typecheck**

Run: `npm run typecheck`
Expected: PASS.
