# UI/UX consistency pass — design

## Context

The renderer UI (Electron + React, `src/renderer/src`) already has a coherent
dark-first design system in `styles/global.css` — a named gold/ink "trading
desk" palette (`--ink`, `--vault`, `--steel`, `--brand`/gold, etc.), a
radius scale, and shared primitives (`.primary`/`.ghost`/`.danger`/`.icon-btn`,
`.tabs`/`.tab`, `.field`, `.chip`, `.stat`). The system itself isn't broken —
but several components don't consistently follow it, which is what reads as
"unpolished" and "cluttered."

This was confirmed against the running app (dark and light themes,
screenshots taken 2026-09-09) and against the component source, not just
visual impression. Dark mode is the app's actual default (`DEFAULT_DESK_PREFS.theme
= 'dark'` in `src/core/desk/prefs.ts`) and is the priority for this pass;
light mode inherits the same fixes for free since they're token/structure
level, not color changes.

## Goals

Fix five concrete, verified inconsistencies without changing the color
palette, typography choices, or brand identity already in place. No new
dependencies. No changes to chart rendering, replay engine, or trading logic.

## Non-goals

- No redesign of the color system or component library from scratch
  (rejected as approach C during brainstorming — unnecessary risk to an
  identity that isn't actually broken).
- No formal type-scale/spacing-token refactor across every component
  (rejected as approach B — much larger surface area for a mostly-cosmetic
  gain).
- No changes to the chart overlay label stack (`ChartPanel.tsx` /
  `ChartTradeOverlay.tsx`) — cosmetic opportunity noted during review but
  out of scope: touching chart positioning logic carries disproportionate
  regression risk for this pass.
- No change to the `.primary`/`.ghost` button styles themselves — the
  Start/Random weight question was raised and explicitly deferred by the
  user, not included in this spec.

## The five fixes

### 1. Right panel tabs lose their label

**File:** `src/renderer/src/components/RightPanel.tsx`

`RightPanel` is the *only* consumer of the shared `.tab` class that renders
icon-only buttons (`<Icon name={t.icon} />`, label only in `title`/`aria-label`).
`StrategyLibrary.tsx` ("Strategies" / "Market") and `MarketDesk.tsx`
("Your data" / "Add a pair") both render visible text. Same component class,
inconsistent affordance — confirmed by grepping every `className="tab"` /
`"tabs` usage in `src/renderer/src/components/*.tsx`.

**Fix:** render icon + a visible label inside each `.tab` button:

```tsx
<Icon name={t.icon} />
<span className="tab-label">{t.label}</span>
```

**CSS:** add `.tab-label` reusing the existing uppercase micro-label voice
already established for `.stat span` / field labels (10–11px, letter-spacing,
uppercase; inherits `.tab`'s existing color rules, so it goes `var(--gold)`
automatically when `data-active='true'`, same as today). Lay out icon +
label inline with a 4px gap as the default — it fits the 360px right panel
at 4 tabs at this label length ("Strategy", "Sessions" are the longest).
Fall back to icon-over-label stacking only if implementation finds it
clips in practice.

### 2. Top bar mixes controls and readouts with no grouping

**File:** `src/renderer/src/components/TopBar.tsx`, `styles/global.css`

`.top-controls` renders six `<label>` blocks in one flex row: Symbol,
Timeframe, Speed are real `<select>` controls; Date, Time, Session are
plain `<div className="chip">` readouts. All six get identical label
typography and box styling, so the row reads as uniformly dense rather than
"here's what you set, here's what's happening."

**Fix:**
- Add a `.readout` style for Date/Time/Session: transparent background, no
  border, just `label` (muted, uppercase, as now) over `value` (parchment,
  tabular-nums monospace) — a ticker-style readout rather than a fake input.
  Replace their `<div className="chip">` with `<div className="readout-value">`.
- Wrap the fields in two groups: `<div className="control-group">` holding
  Symbol, Timeframe, Speed (all three are user-set `<select>`s), and
  `<div className="readout-group">` holding Date, Time, Session (all three
  are derived, read-only).
- Add a thin vertical divider between the two groups
  (`border-left: 1px solid var(--rule)` with padding, on `.readout-group`).

Net result: Symbol / Timeframe / Speed on the left as one visual cluster of
things you set, Date / Time / Session on the right as a live-status
cluster, separated by a hairline instead of six equal-weight boxes in a row.

### 3. Strategy grid looks broken with only 1–2 cards

**File:** `src/renderer/src/components/StrategyLibrary.tsx`, `styles/global.css`

`.strategy-grid` is `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`.
With few items, `auto-fill` still creates as many column tracks as fit the
container, and `1fr` distributes leftover width across *all* tracks
(including empty ones) — not just the ones holding a card. Net effect,
confirmed in both light and dark screenshots: two ~360px-wide cards
top-left, then a large dead void filling the rest of the row and all the
vertical space below it. With only 2 strategies saved, this reads as a
broken page, not a library with room to grow.

**Fix:**
- Change track sizing to `minmax(280px, 320px)` (cap growth) and set
  `justify-content: start` on `.strategy-grid`, so existing cards keep a
  natural, comfortable size instead of stretching to fill imaginary
  columns.
- Add a persistent "Add strategy" tile as the last item in the grid
  (dashed border, `.ghost`-style, centered `+` icon + "New strategy" label,
  same footprint as a `.strategy-card`), wired to the existing
  `setComposer(true)` flow — the exact same action as the top-right `+`
  icon-btn, just with a second, more discoverable entry point that also
  gives the grid a natural terminal element instead of trailing off into
  empty space. This tile is additive — it appears whenever `strategies.length > 0`;
  the existing zero-state (`strategies.length === 0` → centered "No
  strategies yet" message) is unchanged.

### 4. Market table pair-grouping is unstyled

**File:** `styles/global.css` (no JSX change needed)

`MarketDesk.tsx` already renders this correctly at the markup level —
`rowSpan={tapes.length}` on the pair cell, and `data-group-start={i === 0}`
on every `<tr>` — but no CSS selector in `global.css` reads
`data-group-start`. Confirmed live: in the dark-mode screenshot, XAUUSD's
five sub-timeframe rows (1D/1D/1H/4H/5M) show a blank first cell with no
visual cue they belong together, indistinguishable from unrelated rows.

**Fix:** add to `global.css`:

```css
.market-table tbody tr[data-group-start='true'] td {
  border-top: 1px solid var(--rule);
}
```

and confirm the existing per-row `border-top` on plain `.history-table td`
(from the base `.history-table td { border-top: 1px solid var(--rule) }`
rule) doesn't already double up — if it does, scope the base rule off for
`.market-table` continuation rows (`.market-table tbody tr:not([data-group-start='true']) td { border-top: 0 }`)
so only group boundaries get a divider, not every row.

### 5. Trade history "Skipped N" crowds the last filter button

**File:** `styles/global.css`

`.filters { display: flex; gap: 6px; flex-wrap: wrap }` places the
`<span className="muted">Skipped {skipped.length}</span>` immediately after
the SELL filter button with only the standard 6px gap — confirmed in the
tester screenshot ("SELL Skipped 0" reading as one crowded cluster).

**Fix:** `.filters .muted { margin-left: auto }` so the skipped count is
pinned to the row's trailing edge, clearly separated from the filter
buttons as a distinct readout.

## Verification plan

No unit-testable behavior changes (pure layout/CSS + one new button wired
to an existing store action). Verification is visual:

1. `npm run dev`, confirm in dark mode (the default) for all five fixes:
   - Right panel tabs show icon + label, fit without clipping/wrapping at
     the panel's default width.
   - Top bar reads as two visually separated groups with the readout
     styling looking like a status display, not a disabled input.
   - Strategy Library with the current 2 saved strategies no longer shows
     a large dead void; the "Add strategy" tile appears as the third grid
     item and opens the composer.
   - Market tab: existing multi-timeframe pairs show a clear divider
     between pair groups, no divider between a pair's own sub-rows.
   - Trade History filter row: "Skipped N" sits at the far right,
     separated from the SELL button.
2. Repeat the same check in light mode (toggle via the existing theme
   toggle) — all fixes are token/structure-level so they should carry over
   without additional light-mode-specific CSS, but confirm no contrast
   regressions (e.g. `.readout` transparent background against `--ink`
   light value).
3. `npm run typecheck` and `npm test` (existing suite) to confirm no
   regressions from the `RightPanel.tsx` / `StrategyLibrary.tsx` JSX changes.
