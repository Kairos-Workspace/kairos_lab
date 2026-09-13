# Welcome Page (Home Base) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent "Welcome" home-base screen that shows first on every app launch, displays a couple of live stats, and gets the user into the Strategy Lab — with a Home button in the Strategy Lab to return to it.

**Architecture:** The app has no router — it's a single `screen` field on the Zustand store (`useAppStore.ts`) switched over in `App.tsx`. We add a third screen value, `'welcome'`, make it the default, add two trivial navigation actions (`enterLibrary`, `goHome`), and build one new component (`Welcome.tsx`) that reads existing store fields for its stats.

**Tech Stack:** React + TypeScript (renderer), Zustand store, plain CSS (no CSS-in-JS). Vitest exists in this repo but only covers `src/core`/`src/shared` logic (`vitest.config.ts` has no jsdom environment and no alias for `src/renderer`) — there is no harness for testing React components. Per the approved spec, this feature is verified with `npm run typecheck` after each code change and a manual run-through at the end (via the `run` skill), not automated component tests.

**Spec:** `docs/superpowers/specs/2026-09-13-welcome-page-design.md`

---

## File Structure

- **Modify** `src/renderer/src/store/useAppStore.ts` — widen `AppScreen`, change default `screen`, add `enterLibrary`/`goHome` actions.
- **Modify** `src/renderer/src/components/Icon.tsx` — add a `home` glyph.
- **Create** `src/renderer/src/components/Welcome.tsx` — the new screen.
- **Modify** `src/renderer/src/styles/global.css` — add the `welcome` frame variant and layout classes.
- **Modify** `src/renderer/src/App.tsx` — render `Welcome` when `screen === 'welcome'`.
- **Modify** `src/renderer/src/components/StrategyLibrary.tsx` — add the Home button to the topbar.

---

### Task 1: Add the `welcome` screen value to the store

**Files:**
- Modify: `src/renderer/src/store/useAppStore.ts:47`
- Modify: `src/renderer/src/store/useAppStore.ts:381`

- [x] **Step 1: Widen the `AppScreen` type**

In `src/renderer/src/store/useAppStore.ts`, change line 47 from:

```ts
export type AppScreen = 'library' | 'workspace'
```

to:

```ts
export type AppScreen = 'welcome' | 'library' | 'workspace'
```

- [x] **Step 2: Make `welcome` the default screen**

In the same file, change line 381 from:

```ts
  screen: 'library',
```

to:

```ts
  screen: 'welcome',
```

- [x] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors (this is a pure type/value widening; nothing consumes `AppScreen` exhaustively yet).

- [x] **Step 4: Commit**

```bash
git add src/renderer/src/store/useAppStore.ts
git commit -m "Add welcome screen value to app store, make it the default"
```

---

### Task 2: Add `enterLibrary` and `goHome` navigation actions

**Files:**
- Modify: `src/renderer/src/store/useAppStore.ts:115` (interface)
- Modify: `src/renderer/src/store/useAppStore.ts:587` (implementation, after `leaveWorkspace`)

- [x] **Step 1: Declare the actions on the store interface**

In `src/renderer/src/store/useAppStore.ts`, change:

```ts
  autosaveProgress: () => void
  leaveWorkspace: () => void
  createStrategy: (input: { name: string; notes?: string; settings?: Partial<StrategySettings> }) => Promise<string>
```

to:

```ts
  autosaveProgress: () => void
  leaveWorkspace: () => void
  enterLibrary: () => void
  goHome: () => void
  createStrategy: (input: { name: string; notes?: string; settings?: Partial<StrategySettings> }) => Promise<string>
```

- [x] **Step 2: Implement the actions**

Directly below the existing `leaveWorkspace` implementation:

```ts
  leaveWorkspace: () => {
    get().autosaveProgress()
    clearTimer()
    set({
      screen: 'library',
      isPlaying: false,
      pendingSetup: null,
      draft: null,
      chartFull: false,
      status: 'Strategy library'
    })
  },
```

add:

```ts

  enterLibrary: () => {
    set({ screen: 'library' })
  },

  goHome: () => {
    set({ screen: 'welcome' })
  },
```

(These are pure screen flips — no session/replay state to touch, unlike `leaveWorkspace`.)

- [x] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [x] **Step 4: Commit**

```bash
git add src/renderer/src/store/useAppStore.ts
git commit -m "Add enterLibrary and goHome navigation actions"
```

---

### Task 3: Add a `home` icon

**Files:**
- Modify: `src/renderer/src/components/Icon.tsx:42` (type union)
- Modify: `src/renderer/src/components/Icon.tsx:86` (path map)

- [x] **Step 1: Add `home` to `IconName`**

In `src/renderer/src/components/Icon.tsx`, change:

```ts
  | 'undo'
  | 'redo'
  | 'edit'
```

to:

```ts
  | 'undo'
  | 'redo'
  | 'edit'
  | 'home'
```

- [x] **Step 2: Add the path**

Change:

```ts
  undo: 'M7 10H3V6M3 10a8 8 0 1 1 2.3 6.7',
  redo: 'M17 10h4V6M21 10a8 8 0 1 0-2.3 6.7',
  edit: 'M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z'
}
```

to:

```ts
  undo: 'M7 10H3V6M3 10a8 8 0 1 1 2.3 6.7',
  redo: 'M17 10h4V6M21 10a8 8 0 1 0-2.3 6.7',
  edit: 'M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z',
  home: 'M4 11l8-7 8 7M6 10v10h5v-6h2v6h5V10'
}
```

- [x] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [x] **Step 4: Commit**

```bash
git add src/renderer/src/components/Icon.tsx
git commit -m "Add home icon"
```

---

### Task 4: Create the `Welcome` component

**Files:**
- Create: `src/renderer/src/components/Welcome.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { BrandMark } from './BrandMark'
import { ThemeToggle } from './ThemeToggle'
import { withoutSeeds } from '../store/strategyVault'
import { useAppStore } from '../store/useAppStore'

export function Welcome(): React.JSX.Element {
  const strategies = withoutSeeds(useAppStore((s) => s.strategies))
  const datasets = useAppStore((s) => s.datasets)
  const enterLibrary = useAppStore((s) => s.enterLibrary)
  const tapeCount = new Set(
    datasets.filter((row) => row.candleCount > 0).map((row) => row.symbol)
  ).size

  return (
    <div className="app" data-frame="welcome">
      <div className="welcome-screen">
        <div className="welcome-theme-toggle">
          <ThemeToggle />
        </div>
        <div className="brand">
          <BrandMark subtitle="Backtesting desk" />
        </div>
        <div className="welcome-stats">
          <span className="chip">{strategies.length} strategies saved</span>
          <span className="chip">{tapeCount} pairs downloaded</span>
        </div>
        <button type="button" className="primary" onClick={enterLibrary}>
          Enter Strategy Lab
        </button>
      </div>
    </div>
  )
}
```

This mirrors exactly how `StrategyLibrary.tsx` computes its own strategy count and `tapeCount` (same `withoutSeeds` call, same distinct-symbol-with-candles calculation), so the numbers shown here always agree with what the Strategy Lab itself reports.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors. (The component isn't imported anywhere yet — that's fine, it's still valid, self-contained TypeScript.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Welcome.tsx
git commit -m "Add Welcome component"
```

---

### Task 5: Style the welcome screen

**Files:**
- Modify: `src/renderer/src/styles/global.css:198-201`

- [ ] **Step 1: Add the frame variant and layout classes**

In `src/renderer/src/styles/global.css`, change:

```css
.app[data-frame='full'],
.app[data-frame='library'] {
  grid-template-rows: 60px minmax(0, 1fr);
}
```

to:

```css
.app[data-frame='full'],
.app[data-frame='library'] {
  grid-template-rows: 60px minmax(0, 1fr);
}

.app[data-frame='welcome'] {
  grid-template-rows: minmax(0, 1fr);
}

.welcome-screen {
  position: relative;
  height: 100%;
  display: grid;
  place-content: center;
  place-items: center;
  text-align: center;
  gap: 18px;
}

.welcome-theme-toggle {
  position: absolute;
  top: 4px;
  right: 4px;
}

.welcome-stats {
  display: flex;
  gap: 10px;
}
```

`.welcome-screen` deliberately doesn't touch `.brand`/`.brand-lockup`/`.chip`/`.primary` — those are reused as-is from the rest of the app so the welcome screen looks consistent with everything else rather than introducing its own visual language.

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/styles/global.css
git commit -m "Style the welcome screen"
```

(No automated check here — CSS isn't typechecked. This is visually confirmed in Task 8.)

---

### Task 6: Wire `Welcome` into the app

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Import and render `Welcome`**

In `src/renderer/src/App.tsx`, change:

```tsx
import { useEffect } from 'react'
import { applyDeskTheme } from '@core/desk/theme'
import { LoadingOverlay } from './components/LoadingOverlay'
import { StrategyLibrary } from './components/StrategyLibrary'
import { ToastHost } from './components/ToastHost'
import { Workspace } from './components/Workspace'
import { useKeyboard } from './hooks/useKeyboard'
import { useAppStore } from './store/useAppStore'
```

to:

```tsx
import { useEffect } from 'react'
import { applyDeskTheme } from '@core/desk/theme'
import { LoadingOverlay } from './components/LoadingOverlay'
import { StrategyLibrary } from './components/StrategyLibrary'
import { ToastHost } from './components/ToastHost'
import { Welcome } from './components/Welcome'
import { Workspace } from './components/Workspace'
import { useKeyboard } from './hooks/useKeyboard'
import { useAppStore } from './store/useAppStore'
```

Then change:

```tsx
  return (
    <>
      {screen === 'workspace' ? <Workspace /> : <StrategyLibrary />}
      <LoadingOverlay />
      <ToastHost />
    </>
  )
```

to:

```tsx
  return (
    <>
      {screen === 'workspace' ? (
        <Workspace />
      ) : screen === 'welcome' ? (
        <Welcome />
      ) : (
        <StrategyLibrary />
      )}
      <LoadingOverlay />
      <ToastHost />
    </>
  )
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "Render Welcome as the app's default screen"
```

---

### Task 7: Add the Home button to the Strategy Lab

**Files:**
- Modify: `src/renderer/src/components/StrategyLibrary.tsx:26` (selector)
- Modify: `src/renderer/src/components/StrategyLibrary.tsx:105-106` (topbar JSX)

- [ ] **Step 1: Select the `goHome` action**

In `src/renderer/src/components/StrategyLibrary.tsx`, change:

```tsx
  const purgeSeededStrategies = useAppStore((s) => s.purgeSeededStrategies)
  const [desk, setDesk] = useState<LibraryDesk>('strategies')
```

to:

```tsx
  const purgeSeededStrategies = useAppStore((s) => s.purgeSeededStrategies)
  const goHome = useAppStore((s) => s.goHome)
  const [desk, setDesk] = useState<LibraryDesk>('strategies')
```

- [ ] **Step 2: Add the Home button to the topbar**

Change:

```tsx
        <div className="session-chip">
          <ThemeToggle />
          {desk === 'market' ? (
```

to:

```tsx
        <div className="session-chip">
          <button
            type="button"
            className="icon-btn"
            onClick={goHome}
            title="Home"
            aria-label="Home"
          >
            <Icon name="home" />
          </button>
          <ThemeToggle />
          {desk === 'market' ? (
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/StrategyLibrary.tsx
git commit -m "Add Home button to the Strategy Lab topbar"
```

---

### Task 8: Manual verification

**REQUIRED SUB-SKILL:** Use the `run` skill to launch the app for this task.

- [ ] **Step 1: Launch the app**

Use the `run` skill to start the Electron app (`npm run dev`).

- [ ] **Step 2: Verify the welcome screen appears first**

On launch, confirm the `Welcome` screen renders (not the Strategy Lab), showing the brand mark, tagline "Backtesting desk", and two stat chips.

- [ ] **Step 3: Verify the stats are accurate**

Compare the "N strategies saved" / "N pairs downloaded" chips against the actual counts shown once inside the Strategy Lab (its own saved-count chip and Market tab's pair count). They must match.

- [ ] **Step 4: Verify the CTA**

Click "Enter Strategy Lab" — confirm it navigates to the Strategy Lab screen.

- [ ] **Step 5: Verify the Home button**

From the Strategy Lab, click the new Home icon button in the topbar — confirm it returns to the `Welcome` screen.

- [ ] **Step 6: Verify the Workspace flow is unaffected**

From the Strategy Lab, open any existing strategy (or create one first if none exist) — confirm it enters the Workspace as before. Then use the existing "leave workspace" control — confirm it returns to the Strategy Lab (not Welcome), matching the spec's decision not to add a Home button inside Workspace.

- [ ] **Step 7: Check both themes**

Toggle light/dark mode from the Welcome screen's theme button — confirm the welcome screen reads correctly in both.

If any step fails, fix the relevant file from Tasks 1–7, re-run `npm run typecheck`, and re-verify before moving on. No commit is needed for this task unless a fix was required, in which case commit the fix with a message describing what was wrong.
