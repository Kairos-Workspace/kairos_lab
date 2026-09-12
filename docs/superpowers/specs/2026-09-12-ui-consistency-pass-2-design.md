# UI consistency pass #2 — design

## Context

The first consistency pass (`2026-09-09-ui-ux-consistency-pass-design.md`) fixed five
concrete inconsistencies and was merged. Auditing the current codebase the same way
(reading every component and the full stylesheet, not visual impression) found that
one of those five fixes has since regressed, plus several new inconsistencies
introduced by work since then (drawing tools, the rewritten Market Desk "Add a pair"
flow). Confirmed against component source and `global.css`, not guessed.

## Goals

Fix five concrete issues without a color-system or component-library redesign,
matching the same "small, verified, token/structure-level" scope as the first pass.

## Non-goals

- Not restoring the deleted `Sessions` tab/panel — that was bundled into the same
  commit that reverted the tab-label fix, but removing a whole feature is a separate,
  larger product decision, not a styling regression. Only the 3 current tabs
  (Strategy/Trade/Costs) get labels back.
- Not resolving the duplicate replay-range UI (inline `ReplayControls` form vs.
  `ReplayRangeModal`) — that needs a product decision on which pattern to keep,
  explicitly deferred by the user for this pass.
- Not touching chart positioning/transform logic in `ChartPanel.tsx` /
  `ChartTradeOverlay.tsx` / `DrawingLayer.tsx` — only the shared color/radius token
  values on `.drawing-measure-label` change, matching the first pass's same
  regression-risk judgment call.
- Not converting every inline style in `MarketDesk.tsx` — only the ones causing an
  actual verified inconsistency (dead classnames, the grid anti-pattern, inert
  `.ghost` usage, label typography divergence). Layout-only inline styles
  (`display:flex`/`marginBottom` on the "Add a pair" section) are left alone.

## The five fixes

### 1. RightPanel tabs — restore the label fix (regression)

**File:** `src/renderer/src/components/RightPanel.tsx`, `styles/global.css`

The first pass's fix #1 added visible labels to `RightPanel`'s icon-only tabs
(commit `1199973`). A later broad "optimized" commit (`8e90156`) reverted this back
to icon-only *and* deleted the `.tab-label` CSS rule (bundled together with removing
the whole `Sessions` tab — an unrelated change, not part of this fix). `RightPanel`
is once again the only consumer of `.tab` rendering icon-only, while
`StrategyLibrary.tsx` and `MarketDesk.tsx`'s tab bars both show text.

**Fix:** in `RightPanel.tsx`, restore:

```tsx
<span className="icon-label">
  <Icon name={t.icon} />
  <span className="tab-label">{t.label}</span>
</span>
```

in place of the current bare `<Icon name={t.icon} />`. In `global.css`, restore the
`.tab-label` rule (right after the existing `.tab`-related block, matching where it
lived before):

```css
.tab-label {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
```

`.icon-label` (still present, unchanged) already provides the inline-flex +
8px-gap layout.

### 2. MarketDesk "Add a pair" — replace inline styles with real classes

**File:** `src/renderer/src/components/MarketDesk.tsx`, `styles/global.css`

The "Add a pair" view (lines ~200-247) is built almost entirely with inline
`style={{}}` props: `search-bar`, `pair-grid`, and `pair-card` have zero matching
CSS rules today (dead classnames), the grid reinvents the exact `minmax(_, 1fr)`
anti-pattern the first pass fixed in `.strategy-grid`, `pair-card ghost` combines the
shared pill-button class with inline overrides that make `.ghost` functionally
inert, and the "Timeframes" label uses its own one-off 13px style instead of the
`.field` uppercase voice the adjacent From/To Date labels in the same modal use.

**Fix — `MarketDesk.tsx`:**

- Search input (line ~207-215): drop the wrapping `style={{width:'300px'}}` on
  `.search-bar` and the input's own inline style object entirely. The input then
  inherits the app's base `input` rule (`background: var(--ink)`, `border: 1px solid
  var(--rule)`, etc.) like every other text input.
- Pair grid (line ~219): drop the inline `style` object; keep `className="pair-grid"`.
- Pair cards (lines ~221-231, ~235-244): change `className="pair-card ghost"` to
  `className="pair-card"` (and `className="pair-card pair-card-custom"` for the
  dashed custom-symbol variant), drop each button's inline `style` object, and
  remove the `onMouseOver`/`onMouseOut` handlers (lines 226-227, 239-240) — replaced
  by a CSS `:hover` rule. Card content (`<b>`/`<span>`) loses its inline
  `fontSize`/`color` — inherited from the new `.pair-card` rule instead.
- Timeframes label (line ~283): remove the inline `style={{fontSize:'13px',
  color:'var(--muted)', display:'block', marginBottom:'8px'}}` from the `<span>` so
  it inherits `.field`'s existing uppercase/10px/muted cascade from its parent
  (`className="field field-group"` — see below), matching the From/To Date labels'
  own text three lines down. Keep the surrounding checkbox row's own inline style
  (out of scope — no reported inconsistency there).
- Outer Timeframes wrapper (line ~282): replace its inline
  `style={{border, padding, borderRadius, background}}` with a second class,
  `className="field field-group"` (new `.field-group` rule holds the box treatment,
  `.field` keeps providing the label-text cascade).

**Fix — `global.css`, new rules (near `.strategy-grid`/`.strategy-card`):**

```css
.pair-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 240px));
  justify-content: start;
  gap: 12px;
  overflow-y: auto;
  padding-bottom: 24px;
}

.pair-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, var(--bar-from) 0%, var(--bar-to) 100%);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.pair-card:hover {
  border-color: var(--gold-dim);
}

.pair-card b {
  font-size: 16px;
  color: var(--parchment);
}

.pair-card span {
  font-size: 12px;
  color: var(--muted);
}

.pair-card-custom {
  border-style: dashed;
  background: transparent;
}

.pair-card-custom:hover {
  border-color: var(--gold-dim);
  background: var(--gold-soft);
}

.search-bar {
  width: 300px;
  max-width: 100%;
}

.search-bar input {
  width: 100%;
}

.field-group {
  border: 1px solid var(--rule);
  padding: 12px;
  border-radius: var(--radius);
  background: var(--vault);
}
```

Track width capped at `240px` rather than `.strategy-grid`'s `320px` — pair cards
hold only a symbol + name (no description line), so a narrower card reads correctly
at this content size; the fix for the actual bug (unbounded `1fr` growth) applies
regardless of the specific cap chosen.

### 3. Chart overlay labels — unify shared token values

**File:** `styles/global.css`

`.pos-card` and `.drawing-measure-label` are both "dark floating readout over the
chart, IBM Plex Mono, white text" but use three different literal values each
(background alpha, border alpha, border-radius) — noted but explicitly deferred by
the first pass as chart-adjacent. Fixing only the shared visual tokens, not any
positioning/transform/z-index/padding (those differ legitimately by use).

**Fix:** `.drawing-measure-label` changes from:

```css
background: rgba(18, 22, 18, 0.82);
border: 1px solid rgba(255, 255, 255, 0.35);
border-radius: 6px;
```

to:

```css
background: rgba(18, 22, 18, 0.72);
border: 1px solid rgba(255, 255, 255, 0.45);
border-radius: 10px;
```

(matching `.pos-card`'s values exactly). Everything else in the rule (`position`,
`z-index`, `padding`, `transform`, `pointer-events`, font settings) is untouched.

### 4. DrawingStyleMenu icon size

**File:** `src/renderer/src/components/DrawingStyleMenu.tsx`

The dashed-toggle button renders `<Icon name="dashed" size={12} />` while every
other icon in this menu and in the sibling `DrawingToolbar.tsx` uses the shared
default (`size = 15` in `Icon.tsx`). Confirmed there's no geometric justification —
`Icon` renders every glyph through the same fixed `viewBox="0 0 24 24"`, so `size`
scales all icons identically regardless of glyph shape.

**Fix:** change `<Icon name="dashed" size={12} />` to `<Icon name="dashed" />`.

### 5. Dedupe duplicate CSS block

**File:** `styles/global.css`

Lines 184–258 are a byte-for-byte duplicate of lines 109–183 (`.dropdown-trigger`,
`.dropdown-menu`, `.dropdown-option` and their modifiers) — introduced by the same
`8e90156` "optimized" commit. Not currently causing a visual bug (both copies are
identical), but risks silent drift if one copy is edited later and not the other.

**Fix:** delete lines 184–258 (the second copy, including its trailing blank line),
keeping the first copy at 109–183 as the single source of truth. Confirm via `grep
-c` that each of the three selectors appears exactly once afterward.

## Verification plan

No unit-testable behavior changes (pure JSX/CSS + one inert-JS-handler removal).
Verification is visual + build health, same as the first pass:

1. `npm run dev`, dark mode (default):
   - Right panel tabs show icon + label again, no clipping.
   - Market Desk → "Add a pair": search input looks like every other text field;
     with a narrow search query, cards stay compact top-left instead of stretching
     into a dead void; hovering a card shows the border-color change with no JS
     console errors; Timeframes label reads in the same uppercase micro-label style
     as From/To Date below it.
   - Select a drawing with the measure/style menu open (or trigger the measure
     label via the measure tool) and confirm the floating label's color/radius now
     visually matches the trade position card's.
   - Open a drawing's style menu: dashed-toggle icon is now the same size as the
     delete icon next to it.
2. Repeat in light mode — token-level changes only, should carry over without
   additional light-mode CSS.
3. `grep -c '\.dropdown-trigger {'` (and `-menu`/`-option`) each returns `1` in
   `global.css`; dropdowns elsewhere in the app (Symbol/Timeframe/Speed selects,
   etc.) still render and function identically.
4. `npm run typecheck` and `npm test` (existing suite) — confirm no regressions
   from the `RightPanel.tsx` / `MarketDesk.tsx` / `DrawingStyleMenu.tsx` JSX changes.
5. `npm run build` — production build succeeds.
