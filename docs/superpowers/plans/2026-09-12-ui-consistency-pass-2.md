# UI Consistency Pass #2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five concrete, verified UI inconsistencies: a regressed tab-label fix, MarketDesk's inline-styled "Add a pair" view, divergent chart-overlay-label CSS tokens, a stray icon-size override, and a duplicate CSS block.

**Architecture:** Pure JSX/CSS changes across `RightPanel.tsx`, `MarketDesk.tsx`, `DrawingStyleMenu.tsx`, and `styles/global.css` — no store, IPC, or chart-logic changes. Each fix is independent of the others (different files or non-overlapping regions of `global.css`), so tasks can be done and committed in any order, but are listed in the same order as the design doc.

**Tech Stack:** Electron + React (renderer), plain CSS (no CSS-in-JS/modules — one shared `global.css`), Vitest (existing test suite covers `@core`/`@shared` only, no component tests — this plan changes no testable logic).

**Design doc:** `docs/superpowers/specs/2026-09-12-ui-consistency-pass-2-design.md`

---

### Task 1: RightPanel tabs — restore the label fix

**Files:**
- Modify: `src/renderer/src/components/RightPanel.tsx`
- Modify: `src/renderer/src/styles/global.css`

No test file — this is a pure JSX/CSS change with no testable logic, consistent with the first consistency pass's own verification plan (visual + typecheck only).

- [ ] **Step 1: Restore the icon+label markup**

In `src/renderer/src/components/RightPanel.tsx`, find:

```tsx
            title={t.label}
            aria-label={t.label}
          >
            <Icon name={t.icon} />
          </button>
```

Replace it with:

```tsx
            title={t.label}
            aria-label={t.label}
          >
            <span className="icon-label">
              <Icon name={t.icon} />
              <span className="tab-label">{t.label}</span>
            </span>
          </button>
```

- [ ] **Step 2: Restore the `.tab-label` CSS rule**

In `src/renderer/src/styles/global.css`, find:

```css
.icon-btn[data-active='true'],
.tab[data-active='true'] {
  border-color: var(--gold-dim);
  background: var(--gold-soft);
  color: var(--gold);
}
```

Replace it with:

```css
.icon-btn[data-active='true'],
.tab[data-active='true'] {
  border-color: var(--gold-dim);
  background: var(--gold-soft);
  color: var(--gold);
}

.tab-label {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual visual check**

Run: `npm run dev`. Confirm the right panel's Strategy/Trade/Costs tabs now show an
icon plus a visible uppercase label, matching the text-only tabs in the Strategy
Library and Market Desk panels. Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/RightPanel.tsx src/renderer/src/styles/global.css
git commit -m "$(cat <<'EOF'
Restore visible labels on right panel tabs

A prior fix for this exact inconsistency (RightPanel was the only
tab bar in the app rendering icon-only buttons) got silently
reverted by an unrelated broad "optimized" commit that also removed
the Sessions tab. Re-adding the label markup and its .tab-label CSS
rule — not restoring Sessions, that removal is a separate product
decision bundled into the same commit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: MarketDesk "Add a pair" — replace inline styles with real classes

**Files:**
- Modify: `src/renderer/src/components/MarketDesk.tsx`
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Simplify the search input**

In `src/renderer/src/components/MarketDesk.tsx`, find:

```tsx
            <div className="search-bar" style={{ width: '300px' }}>
              <input
                type="text"
                placeholder="Search symbol..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--rule)', background: 'var(--steel)', color: 'var(--parchment)' }}
              />
            </div>
```

Replace it with:

```tsx
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search symbol..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
```

- [ ] **Step 2: Simplify the pair grid and cards**

In the same file, find:

```tsx
          <div className="pair-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', overflowY: 'auto', paddingBottom: '24px' }}>
            {filteredPairs.map(row => (
              <button
                key={row.symbol}
                className="pair-card ghost"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '16px', border: '1px solid var(--rule)', borderRadius: '8px', cursor: 'pointer', background: 'var(--plate)', transition: 'background 0.2s' }}
                onClick={() => setSelectedPair(row.symbol)}
                onMouseOver={(e) => e.currentTarget.style.background = 'var(--rule)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'var(--plate)'}
              >
                <b style={{ fontSize: '16px', color: 'var(--parchment)' }}>{row.symbol}</b>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{row.name}</span>
              </button>
            ))}
            {/* Custom option */}
            {showCustomOption && (
              <button
                className="pair-card ghost"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '16px', border: '1px dashed var(--rule)', borderRadius: '8px', cursor: 'pointer', background: 'transparent' }}
                onClick={() => setSelectedPair(searchQuery.toUpperCase())}
                onMouseOver={(e) => e.currentTarget.style.background = 'var(--rule)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <b style={{ fontSize: '16px', color: 'var(--parchment)' }}>{searchQuery.toUpperCase()}</b>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Custom Symbol</span>
              </button>
            )}
          </div>
```

Replace it with:

```tsx
          <div className="pair-grid">
            {filteredPairs.map(row => (
              <button
                key={row.symbol}
                className="pair-card"
                onClick={() => setSelectedPair(row.symbol)}
              >
                <b>{row.symbol}</b>
                <span>{row.name}</span>
              </button>
            ))}
            {/* Custom option */}
            {showCustomOption && (
              <button
                className="pair-card pair-card-custom"
                onClick={() => setSelectedPair(searchQuery.toUpperCase())}
              >
                <b>{searchQuery.toUpperCase()}</b>
                <span>Custom Symbol</span>
              </button>
            )}
          </div>
```

- [ ] **Step 3: Fix the Timeframes label typography**

In the same file, find:

```tsx
            <div className="field" style={{ border: '1px solid var(--rule)', padding: '12px', borderRadius: 'var(--radius)', background: 'var(--vault)' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>Timeframes</span>
```

Replace it with:

```tsx
            <div className="field field-group">
              <span style={{ display: 'block', marginBottom: '8px' }}>Timeframes</span>
```

(The checkbox row directly below this — `<div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>...` — is unchanged; it's a layout-only style, not a reported inconsistency.)

- [ ] **Step 4: Add the new CSS rules**

In `src/renderer/src/styles/global.css`, find:

```css
.strategy-card-add:hover {
  border-color: var(--gold-dim);
  color: var(--gold);
  background: var(--gold-soft);
}
```

Replace it with:

```css
.strategy-card-add:hover {
  border-color: var(--gold-dim);
  color: var(--gold);
  background: var(--gold-soft);
}

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

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Manual visual check**

Run: `npm run dev`. Go to Market Desk → "Add a pair":
- The search input looks like every other text input in the app (no visual change
  from before other than removing a slightly different steel-gray background).
- Type a search query that matches only 1-2 pairs — confirm the cards stay
  compact, top-left, at a natural size, instead of stretching to fill the row.
- Hover a pair card — confirm the border color changes (CSS `:hover`, no JS
  console errors from the removed `onMouseOver`/`onMouseOut` handlers).
- The "Timeframes" label reads in the same small uppercase style as "From Date"/
  "To Date" below it, inside the same bordered box as before.

Stop the dev server when done.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/MarketDesk.tsx src/renderer/src/styles/global.css
git commit -m "$(cat <<'EOF'
Replace MarketDesk's inline-styled "Add a pair" view with real classes

search-bar, pair-grid, and pair-card had zero matching CSS rules —
their whole appearance came from inline style props, including a
reinvented version of the exact minmax(_, 1fr) grid bug the first
consistency pass fixed elsewhere, a .ghost class rendered inert by
inline overrides, and JS-driven hover handlers doing what CSS
already does everywhere else in the app. Also fixes the Timeframes
label's one-off font-size to inherit the same uppercase micro-label
voice the adjacent From/To Date labels already use.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Chart overlay labels — unify shared token values

**Files:**
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Match `.drawing-measure-label`'s tokens to `.pos-card`'s**

Find:

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

Replace it with:

```css
.drawing-measure-label {
  position: absolute;
  z-index: 7;
  padding: 4px 8px;
  background: rgba(18, 22, 18, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 10px;
  color: #fff;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  white-space: nowrap;
  pointer-events: none;
  transform: translate(12px, -50%);
}
```

(Only `background`, `border`, and `border-radius` changed — `position`, `z-index`,
`padding`, `transform`, `pointer-events`, and the font settings are untouched.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual visual check**

Run: `npm run dev`. Select the measure/ruler drawing tool on the chart and drag to
create a measurement — confirm the floating label's background/border/corner
radius now visually matches the trade position card (`.pos-card`, visible when a
manual trade is active). Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/styles/global.css
git commit -m "$(cat <<'EOF'
Unify chart overlay label tokens between drawings and trade cards

.pos-card and .drawing-measure-label are the same conceptual "dark
floating readout" pattern but used three different literal values
each for background/border/radius. Matching drawing-measure-label to
pos-card's values — position/transform/z-index/padding untouched,
those legitimately differ per use.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: DrawingStyleMenu icon size

**Files:**
- Modify: `src/renderer/src/components/DrawingStyleMenu.tsx`

- [ ] **Step 1: Remove the stray size override**

Find:

```tsx
        <Icon name="dashed" size={12} />
```

Replace it with:

```tsx
        <Icon name="dashed" />
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual visual check**

Run: `npm run dev`. Draw a shape with the drawing tools, open its style menu, and
confirm the dashed-toggle icon is now the same size as the delete icon next to it.
Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/DrawingStyleMenu.tsx
git commit -m "$(cat <<'EOF'
Fix stray icon-size override in DrawingStyleMenu

The dashed-toggle button rendered its icon at size 12 while every
other icon in this menu and in DrawingToolbar uses the shared
default (15). Every icon shares the same viewBox, so there was no
geometric reason for the override.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Dedupe duplicate CSS block

**Files:**
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Confirm the duplicate exists exactly as expected**

Run: `grep -c "^\.dropdown-trigger {$" src/renderer/src/styles/global.css`
Expected: `2`

If this prints anything other than `2`, stop and re-read the file around both
matches (`grep -n "^\.dropdown-trigger {$" src/renderer/src/styles/global.css`)
before proceeding — the exact duplicate this task removes may have already been
partially cleaned up or changed since this plan was written.

- [ ] **Step 2: Remove the second (duplicate) copy**

Find this exact block — note it includes the blank line and the start of the next
rule (`.app {`) at the end, which is what makes this match unique to the *second*
copy rather than the first (both copies are otherwise byte-identical):

```css
.dropdown-trigger {
  display: block;
  width: auto;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  appearance: none;
  -webkit-appearance: none;
  background: var(--ink);
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm);
  padding: 7px 30px 7px 11px;
  font-size: 13px;
  letter-spacing: normal;
  text-transform: none;
  color: var(--parchment);
  cursor: pointer;
  background-image: var(--chevron);
  background-repeat: no-repeat;
  background-position: right 11px center;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.dropdown-trigger:hover,
.dropdown-trigger[aria-expanded='true'] {
  border-color: var(--gold-dim);
  background-color: var(--steel);
  background-image: var(--chevron-active);
}

.dropdown-trigger:focus-visible {
  outline: 1px solid var(--gold);
  outline-offset: 1px;
}

.field .dropdown-trigger {
  width: 100%;
}

.dropdown-menu {
  position: fixed;
  z-index: 100;
  max-height: 260px;
  overflow-y: auto;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--vault);
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
}

.dropdown-option {
  padding: 7px 10px;
  border-radius: var(--radius-xs);
  font-size: 13px;
  color: var(--parchment);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-option[data-active='true'] {
  background: var(--gold-soft);
  color: var(--gold);
}

.dropdown-option[aria-selected='true'] {
  font-weight: 600;
}

.app {
```

Replace it with just:

```css
.app {
```

- [ ] **Step 3: Confirm exactly one copy remains**

Run: `grep -c "^\.dropdown-trigger {$" src/renderer/src/styles/global.css`
Expected: `1`

Run also: `grep -c "^\.dropdown-menu {$" src/renderer/src/styles/global.css` and
`grep -c "^\.dropdown-option {$" src/renderer/src/styles/global.css`
Expected: `1` for each.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Manual visual check**

Run: `npm run dev`. Open any dropdown in the app (e.g. the Symbol or Timeframe
selector in the top bar) and confirm it still opens, shows its options, and lets
you pick one — no visual or functional change expected, this step only confirms
removing the duplicate didn't break anything. Stop the dev server when done.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/styles/global.css
git commit -m "$(cat <<'EOF'
Remove duplicate dropdown CSS block

.dropdown-trigger/.dropdown-menu/.dropdown-option were defined
twice, byte-for-byte identical. Not currently a visual bug since
both copies matched, but risked silent drift if one copy got edited
later and not the other.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all existing tests pass (this plan changes no testable logic, so this
just confirms nothing else broke).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: `electron-vite build` completes with no errors.

- [ ] **Step 4: Light mode pass**

Run: `npm run dev`, toggle to light mode via the existing theme toggle, and repeat
the five manual visual checks from Tasks 1-5 above. All fixes are token/structure
level, so they should carry over without additional light-mode-specific CSS — this
step just confirms no contrast regressions. Stop the dev server when done.

- [ ] **Step 5: Report**

No commit needed for this task (verification only) unless Step 4 surfaces a bug —
if it does, fix it, re-run the relevant checks above, and commit the fix with a
description of what was wrong.
