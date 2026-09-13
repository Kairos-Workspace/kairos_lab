# Welcome Page (Home Base) Design

## Context

Today the app has two screens, switched via a Zustand `screen` field
(`AppScreen = 'library' | 'workspace'` in `src/renderer/src/store/useAppStore.ts`)
and rendered by a plain conditional in `src/renderer/src/App.tsx`:

```tsx
{screen === 'workspace' ? <Workspace /> : <StrategyLibrary />}
```

`StrategyLibrary` (the "Strategy Lab") is the default screen — the very first
thing a user sees on launch. There is no router; screen transitions are just
`set({ screen: ... })` calls inside store actions (e.g. `openStrategy` sets
`'workspace'`, `leaveWorkspace` sets `'library'`).

We're adding a third screen, `'welcome'`, that becomes the new default landing
screen and acts as a persistent "home base" — shown on every launch, and
reachable again later via a Home button.

## Goals

- A branded landing screen shown first on every app launch.
- It should feel like a real home base, not an empty splash: show a couple of
  live stats already available in the store, not just a logo and a button.
- One primary action: enter the Strategy Lab.
- A way to return to it later without relaunching the app.

## Non-goals

- No onboarding/tutorial content, no "don't show again" dismissal — it always
  shows on launch, per explicit product decision.
- No new top-level navigation destinations beyond what exists today (Strategy
  Lab, Market data are still reached via Strategy Lab's own tabs). This is not
  a multi-section dashboard.
- No Home button inside Workspace — leaving a workspace already returns to the
  Strategy Lab (`leaveWorkspace`), and Home is one additional click from there.
  Adding Home to Workspace's topbar too was considered and explicitly declined
  to keep the change small.

## Design

### State & navigation (`src/renderer/src/store/useAppStore.ts`)

- `AppScreen` becomes `'welcome' | 'library' | 'workspace'`.
- The store's initial `screen` value changes from `'library'` to `'welcome'`.
- Two new actions, following the existing convention that store actions own
  `screen` transitions (rather than components setting it directly):
  - `enterLibrary: () => set({ screen: 'library' })`
  - `goHome: () => set({ screen: 'welcome' })`
  
  These are pure screen flips with no side effects, unlike `openStrategy` or
  `leaveWorkspace` which also manage session/replay state.

### Routing (`src/renderer/src/App.tsx`)

The single conditional becomes a three-way check:

```tsx
{screen === 'workspace' ? (
  <Workspace />
) : screen === 'welcome' ? (
  <Welcome />
) : (
  <StrategyLibrary />
)}
```

### New component: `src/renderer/src/components/Welcome.tsx`

Follows the same page-shell convention as the other two screens
(`<div className="app" data-frame="welcome">`), but needs its own frame
variant in `global.css` since it has no topbar/tabs grid — it's a single
centered column, not a data-dense layout.

Contents, top to bottom:

1. A small `ThemeToggle` in a corner (every screen exposes this today).
2. `BrandMark` (reused as-is) with a tagline subtitle.
3. Two stat chips computed with the exact same logic `StrategyLibrary`
   already uses, so behavior stays consistent if that logic ever changes:
   - Saved strategies: `withoutSeeds(useAppStore((s) => s.strategies)).length`
   - Pairs downloaded: distinct-symbol count over
     `useAppStore((s) => s.datasets)` filtered to `candleCount > 0`
     (the same `tapeCount` calculation in `StrategyLibrary.tsx`).
4. One primary button, "Enter Strategy Lab", calling `enterLibrary()`.

Zero-state: chips just read "0 strategies saved" / "0 pairs downloaded" — no
separate empty-state treatment, consistent with how `StrategyLibrary` handles
zero counts elsewhere (only the strategy grid itself has a dedicated empty
state, for its own different reasons).

### Home button (`src/renderer/src/components/StrategyLibrary.tsx`)

An icon button added to the `session-chip` group in the topbar, next to
`ThemeToggle`, calling `goHome()`. Requires a new `home` glyph in
`Icon.tsx` (a simple house-shaped path), since no existing icon fits.

### Styling (`src/renderer/src/styles/global.css`)

Add `.app[data-frame='welcome']` alongside the existing `.app[data-frame='full']` /
`.app[data-frame='library']` variants — collapsing to a single centered cell
rather than the topbar+content grid those two share.

## Edge cases

- Store hydration: `bootstrap()` runs on `App` mount regardless of screen, so
  if it's still loading when `Welcome` first renders, the existing global
  `LoadingOverlay` covers that exactly as it does today for the other screens.
  No special loading state needed inside `Welcome` itself.
- Zero strategies / zero pairs: covered above — just renders "0".

## Verification

There's no automated UI test harness covering screen navigation in this app
today, so this will be verified manually (via the `run` skill):

- Launch the app → `Welcome` renders first, stat chips match actual saved
  strategies / downloaded pairs.
- "Enter Strategy Lab" → lands on `StrategyLibrary`.
- Home button in `StrategyLibrary`'s topbar → returns to `Welcome`.
- Open a strategy from `StrategyLibrary`, then leave the workspace → confirm
  the existing `Workspace` → `StrategyLibrary` flow is unaffected by the new
  screen value.
