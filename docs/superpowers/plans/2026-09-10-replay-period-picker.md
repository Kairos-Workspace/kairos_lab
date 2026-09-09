# Replay Period Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking "Start" in the Strategy panel opens a popup asking the user to choose "Full history" (default) or a custom date range, instead of silently reusing whatever range was last set.

**Architecture:** Extract the existing datetime-input helpers out of `ReplayControls.tsx` into a shared module, build a new `ReplayRangeModal` component that reuses the app's existing `.modal-backdrop`/`.composer` visual pattern (already used by `MarketDesk.tsx`'s download modal), and wire the Strategy panel's Start button to open it instead of calling `startReplay()` directly.

**Tech Stack:** React 18 + TypeScript (renderer), Zustand store (`useAppStore.ts`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-10-replay-period-picker-design.md`

**Note on testing:** This codebase's `tests/` suite (vitest, `tsconfig.node.json`) only covers `src/core`, `src/shared`, `src/main`, and `src/preload` — `src/renderer` is a separate TS project (`tsconfig.web.json`) with no automated test harness (no jsdom/RTL configured). This matches the existing pattern: none of `ReplayControls.tsx`, `StrategyPanel.tsx`, or `MarketDesk.tsx` have component tests today. So verification for every task below is `npm run typecheck` plus manual exercise of the UI — no new test infra is introduced.

---

### Task 1: Extract shared replay-range input helpers

**Files:**
- Create: `src/renderer/src/lib/replayRange.ts`
- Modify: `src/renderer/src/components/ReplayControls.tsx:1-16`

- [ ] **Step 1: Create the shared helper module**

Create `src/renderer/src/lib/replayRange.ts`:

```ts
export function toReplayInput(ts: number | null | undefined): string {
  if (ts == null) return ''
  const date = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromReplayInput(value: string): number | null {
  if (!value) return null
  const ts = Date.parse(value)
  return Number.isNaN(ts) ? null : ts
}
```

This is the exact logic already in `ReplayControls.tsx` (`toInput`/`fromInput`), just renamed and moved so `ReplayRangeModal` (Task 2) can reuse it without duplication.

- [ ] **Step 2: Update `ReplayControls.tsx` to use the shared helpers**

In `src/renderer/src/components/ReplayControls.tsx`, replace lines 1-16:

```ts
import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'

function toInput(ts: number | null | undefined): string {
  if (ts == null) return ''
  const date = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromInput(value: string): number | null {
  if (!value) return null
  const ts = Date.parse(value)
  return Number.isNaN(ts) ? null : ts
}
```

with:

```ts
import { useEffect, useState } from 'react'
import { fromReplayInput, toReplayInput } from '../lib/replayRange'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'
```

Then update the two call sites further down in the same file:

- Line 33-34 (inside the `useEffect`):
  ```ts
  setFrom(toInput(replayFromTs ?? candles[0]?.timestamp))
  setTo(toInput(replayToTs ?? candles.at(-1)?.timestamp))
  ```
  becomes:
  ```ts
  setFrom(toReplayInput(replayFromTs ?? candles[0]?.timestamp))
  setTo(toReplayInput(replayToTs ?? candles.at(-1)?.timestamp))
  ```

- Line 38-39 (inside `applyRange`):
  ```ts
  const fromTs = fromInput(from)
  const toTs = fromInput(to)
  ```
  becomes:
  ```ts
  const fromTs = fromReplayInput(from)
  const toTs = fromReplayInput(to)
  ```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors (it only runs `tsc -b`, so this confirms the rename didn't break any references).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/lib/replayRange.ts src/renderer/src/components/ReplayControls.tsx
git commit -m "$(cat <<'EOF'
Extract replay date-input helpers into a shared module

ReplayRangeModal (next commit) needs the same datetime-local <-> timestamp
conversion ReplayControls already has; sharing it avoids duplicating the
logic.
EOF
)"
```

---

### Task 2: Build the `ReplayRangeModal` component

**Files:**
- Create: `src/renderer/src/components/ReplayRangeModal.tsx`

- [ ] **Step 1: Create the component**

Create `src/renderer/src/components/ReplayRangeModal.tsx`:

```tsx
import { useState } from 'react'
import { fromReplayInput, toReplayInput } from '../lib/replayRange'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'

type RangeMode = 'full' | 'custom'

export function ReplayRangeModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const replayFromTs = useAppStore((s) => s.replayFromTs)
  const replayToTs = useAppStore((s) => s.replayToTs)
  const candles = useAppStore((s) => s.displayCandles)
  const setReplayRange = useAppStore((s) => s.setReplayRange)
  const startReplay = useAppStore((s) => s.startReplay)

  const [mode, setMode] = useState<RangeMode>('full')
  const [from, setFrom] = useState(() => toReplayInput(replayFromTs ?? candles[0]?.timestamp))
  const [to, setTo] = useState(() => toReplayInput(replayToTs ?? candles.at(-1)?.timestamp))

  function handleStart(): void {
    if (mode === 'full') {
      setReplayRange(null, null)
      startReplay()
    } else {
      const fromTs = fromReplayInput(from)
      const toTs = fromReplayInput(to)
      setReplayRange(fromTs, toTs)
      startReplay({ fromTs: fromTs ?? undefined, toTs: toTs ?? undefined })
    }
    onClose()
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

        <label className="field">
          <span>
            <input
              type="radio"
              name="replay-range-mode"
              checked={mode === 'full'}
              onChange={() => setMode('full')}
            />{' '}
            Full history
          </span>
        </label>
        <label className="field">
          <span>
            <input
              type="radio"
              name="replay-range-mode"
              checked={mode === 'custom'}
              onChange={() => setMode('custom')}
            />{' '}
            Custom range
          </span>
        </label>

        {mode === 'custom' ? (
          <div className="row">
            <label className="field">
              From
              <input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="Replay from"
              />
            </label>
            <label className="field">
              To
              <input
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-label="Replay to"
              />
            </label>
          </div>
        ) : null}

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

Notes on why each piece is the way it is:
- `setReplayRange(null, null)` before `startReplay()` in the `'full'` branch is what fixes the actual bug: it clears any narrowed range left over from a previous session before starting, so "Full history" always means the whole dataset, not whatever was last set.
- The `'custom'` branch mirrors `ReplayControls.tsx`'s existing `applyRange()` exactly (same `setReplayRange` + `startReplay({ fromTs, toTs })` call shape), so behavior stays consistent between the two entry points.
- `primary`/`ghost`/`icon-btn`/`modal-backdrop`/`composer`/`composer-actions`/`field`/`stamp` are all existing CSS classes (see `MarketDesk.tsx`'s download modal and `StrategyPanel.tsx`'s checkbox rows) — no new CSS is needed.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ReplayRangeModal.tsx
git commit -m "$(cat <<'EOF'
Add ReplayRangeModal component

Not wired up yet (next commit) - this is the standalone popup for
choosing "Full history" vs a custom date range before starting a replay.
EOF
)"
```

---

### Task 3: Wire the Strategy panel's Start button to the modal

**Files:**
- Modify: `src/renderer/src/components/StrategyPanel.tsx`

- [ ] **Step 1: Add the import and modal-visibility state**

In `src/renderer/src/components/StrategyPanel.tsx`, replace the top of the file:

```tsx
import { STRATEGY_CATALOG } from '@core/strategy/registry'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'

export function StrategyPanel(): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const setSettings = useAppStore((s) => s.setSettings)
  const startReplay = useAppStore((s) => s.startReplay)
  const account = useAppStore((s) => s.account)
  const setAccountRisk = useAppStore((s) => s.setAccountRisk)
  const activeStrategyId = useAppStore((s) => s.activeStrategyId)
  const strategies = useAppStore((s) => s.strategies)
  const activeName = strategies.find((s) => s.id === activeStrategyId)?.name
```

with:

```tsx
import { useState } from 'react'
import { STRATEGY_CATALOG } from '@core/strategy/registry'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'
import { ReplayRangeModal } from './ReplayRangeModal'
import { useAppStore } from '../store/useAppStore'

export function StrategyPanel(): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const setSettings = useAppStore((s) => s.setSettings)
  const startReplay = useAppStore((s) => s.startReplay)
  const account = useAppStore((s) => s.account)
  const setAccountRisk = useAppStore((s) => s.setAccountRisk)
  const activeStrategyId = useAppStore((s) => s.activeStrategyId)
  const strategies = useAppStore((s) => s.strategies)
  const activeName = strategies.find((s) => s.id === activeStrategyId)?.name
  const [showRangeModal, setShowRangeModal] = useState(false)
```

- [ ] **Step 2: Point the Start button at the modal**

Further down in the same file, replace:

```tsx
      <button
        className="primary icon-label"
        onClick={() => startReplay()}
        title="Start replay from warmup"
      >
        <Icon name="play" />
        Start
      </button>
      <button
        className="ghost icon-label"
        onClick={() => startReplay({ random: true, hideDate: true })}
        title="Random historical start"
      >
        <Icon name="shuffle" />
        Random
      </button>
    </>
  )
}
```

with:

```tsx
      <button
        className="primary icon-label"
        onClick={() => setShowRangeModal(true)}
        title="Start replay from warmup"
      >
        <Icon name="play" />
        Start
      </button>
      <button
        className="ghost icon-label"
        onClick={() => startReplay({ random: true, hideDate: true })}
        title="Random historical start"
      >
        <Icon name="shuffle" />
        Random
      </button>
      {showRangeModal ? <ReplayRangeModal onClose={() => setShowRangeModal(false)} /> : null}
    </>
  )
}
```

(`startReplay` stays used by the Random button, so no unused-variable issue.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/StrategyPanel.tsx
git commit -m "$(cat <<'EOF'
Open a period-picker popup from the Strategy panel's Start button

Previously Start called startReplay() directly, silently reusing
whatever replay range was last set (which could be a narrowed range
left over from an earlier session). Now it opens ReplayRangeModal so
the user explicitly picks "Full history" or a custom range every time.
EOF
)"
```

---

### Task 4: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Launch the app**

Run: `npm run dev`

- [ ] **Step 2: Verify the "stale narrow range" bug is fixed**

1. Load any dataset.
2. In the replay bar under the chart, narrow the range using the From/To fields and click Apply.
3. Go to the Strategy panel and click **Start**.
4. Confirm the popup appears with **Full history** selected by default.
5. Click **Start** in the popup.
6. Confirm playback covers the entire dataset (not the narrowed range from step 2) — e.g. step through with the replay bar's step buttons and check the candle timestamps span the full loaded range, or watch the chart's visible range.

- [ ] **Step 3: Verify custom range still works**

1. Click **Start** again.
2. Switch to **Custom range**, pick a From/To narrower than the full dataset.
3. Click **Start** in the popup.
4. Confirm replay begins at the chosen From time, and press Play — confirm it stops advancing once it reaches the chosen To time (per existing `step()` behavior at `useAppStore.ts:875`).

- [ ] **Step 4: Verify cancel paths**

1. Click **Start**, then click **Cancel** in the popup footer — confirm the popup closes and no replay state changes (mode/status unchanged).
2. Click **Start** again, then click outside the popup card (on the dark backdrop) — confirm it closes the same way.
3. Click **Start** again, then click the **×** close icon in the popup header — confirm it closes the same way.

- [ ] **Step 5: Verify Random is unaffected**

Click **Random** in the Strategy panel — confirm it jumps straight into a random replay start with no popup (unchanged behavior).

- [ ] **Step 6: Final typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.
