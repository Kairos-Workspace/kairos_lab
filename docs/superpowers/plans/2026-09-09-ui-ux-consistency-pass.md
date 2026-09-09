# UI/UX Consistency Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five verified UI inconsistencies in the Quantify renderer (icon-only right-panel tabs, undifferentiated top-bar controls/readouts, an overflowing strategy grid, an unstyled market-table row grouping, and a crowded trade-history filter row) without touching the color palette, brand identity, or any chart/replay/trading logic.

**Architecture:** Pure presentational changes — CSS additions/edits in `src/renderer/src/styles/global.css` plus small, self-contained JSX edits in three component files (`RightPanel.tsx`, `TopBar.tsx`, `StrategyLibrary.tsx`). No new state, no new dependencies, no changes to `useAppStore` or any `src/core`/`src/main` logic. Each task is independent of the others and can be done in any order.

**Tech Stack:** React 19 + TypeScript (renderer), plain CSS (no CSS-in-JS, no Tailwind — this app hand-writes `global.css` with custom-property design tokens), Vite/electron-vite dev server, Vitest for the existing (non-UI) test suite.

**Spec:** `docs/superpowers/specs/2026-09-09-ui-ux-consistency-pass-design.md`

---

## Environment note (read before running the dev server)

This machine's shell has `ELECTRON_RUN_AS_NODE=1` set (inherited from the
editor environment). With that set, `npm run dev` launches Electron's
binary in plain-Node mode and crashes immediately with:

```
SyntaxError: The requested module 'electron' does not provide an export named 'BrowserWindow'
```

Always unset it for dev-server / Electron launches in this environment:

```bash
env -u ELECTRON_RUN_AS_NODE npm run dev
```

Verify a real Electron window process exists (not just a Node process) before trusting any visual check:

```bash
ps aux | grep "Electron.app/Contents/MacOS/Electron \." | grep -v grep
```

**Do not drive the running app with blind OS-level clicks/keystrokes** (e.g.
`osascript ... click at {x,y}`) — on a real desktop with multiple windows
open, coordinate-based clicks can land on the wrong window entirely (this
happened during design review: a stray click opened a context menu on an
unrelated editor tab, and a keystroke nearly interacted with an unrelated
macOS system dialog). For visual verification in this repo, either:
- ask a human to look at the running app, or
- take a passive `screencapture -x <path>` screenshot only (no synthetic
  clicks/keystrokes) after bringing the window forward with
  `osascript -e 'tell application "System Events" to set frontmost of (first process whose unix id is <pid>) to true'`
  (this "set frontmost" call is safe — it's a window-ordering request, not
  a synthetic input event).

The persisted theme preference lives in `data/strategy-tester.db`, table
`prefs`, key `desk`, as a JSON blob with a `"theme"` field ("dark" or
"light"). To check dark mode specifically without clicking the in-app
toggle:

```bash
cp data/strategy-tester.db /tmp/strategy-tester.db.bak   # back up first
sqlite3 data/strategy-tester.db "UPDATE prefs SET value = json_set(value, '\$.theme', 'dark') WHERE key='desk';"
# ... launch, verify, screenshot ...
cp /tmp/strategy-tester.db.bak data/strategy-tester.db    # restore after
```

Always restore the backup afterward — this file is a local dev artifact
(git-ignored) but it's the user's real saved app state, not a fixture.

---

### Task 1: Right panel tabs get a visible label

**Files:**
- Modify: `src/renderer/src/components/RightPanel.tsx`
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Add the label span in the tab button**

In `src/renderer/src/components/RightPanel.tsx`, replace:

```tsx
        {TABS.map((t) => (
          <button
            key={t.id}
            className="tab"
            data-active={tab === t.id}
            onClick={() => setTab(t.id)}
            title={t.label}
            aria-label={t.label}
          >
            <Icon name={t.icon} />
          </button>
        ))}
```

with:

```tsx
        {TABS.map((t) => (
          <button
            key={t.id}
            className="tab"
            data-active={tab === t.id}
            onClick={() => setTab(t.id)}
            title={t.label}
            aria-label={t.label}
          >
            <span className="icon-label">
              <Icon name={t.icon} />
              <span className="tab-label">{t.label}</span>
            </span>
          </button>
        ))}
```

- [ ] **Step 2: Add the `.tab-label` style**

In `src/renderer/src/styles/global.css`, find this existing block (it's the
tab layout rule, currently ~line 590):

```css
.tab {
  flex: 1;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  padding: 8px 6px;
  display: inline-grid;
  place-items: center;
  min-height: 36px;
}
```

Add immediately after it:

```css

.tab-label {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
```

(No color rule needed — it inherits `currentColor` from `.tab`, so it
automatically turns gold when the tab is active via the existing
`.tab[data-active='true']` rule.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no new errors (this is a pure JSX structure change, no type
changes).

- [ ] **Step 4: Visual verification**

```bash
env -u ELECTRON_RUN_AS_NODE npm run dev
```

Open a strategy from the Strategy Library (click a strategy card) to reach
the Tester workspace, where the right panel is visible. Confirm:
- All four tabs (Strategy, Trade, Sessions, Costs) show an icon **and** a
  visible uppercase label, not icon-only.
- No label wraps to a second line or gets clipped at the panel's default
  width. If any label clips, replace the `.icon-label` wrapper's layout
  for `.tab` specifically with a stacked (icon above label) layout instead:

  ```css
  .tab .icon-label {
    flex-direction: column;
    gap: 2px;
  }
  ```

  Add this rule after the `.tab-label` rule from Step 2 only if clipping is
  observed — do not add it speculatively.
- The active tab's icon and label are both gold (`var(--gold)`); inactive
  tabs are the default parchment/muted color.

Stop the dev server (`Ctrl+C` in its terminal, or `pkill -f electron-vite`)
when done.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/RightPanel.tsx src/renderer/src/styles/global.css
git commit -m "$(cat <<'EOF'
Add visible labels to right panel tabs

RightPanel was the only consumer of the shared .tab class rendering
icon-only buttons; every other tab group in the app (Strategy Library,
Market Tapes) shows text. Brings it in line and reuses the existing
uppercase micro-label voice already used for .stat labels.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Top bar — separate controls from readouts

**Files:**
- Modify: `src/renderer/src/components/TopBar.tsx`
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Split `.top-controls` into two groups**

In `src/renderer/src/components/TopBar.tsx`, replace:

```tsx
      <div className="top-controls">
        <label>
          Symbol
          <select value={symbol} onChange={(e) => void selectSymbol(e.target.value)}>
            {pairs.map((pair) => (
              <option key={pair} value={pair}>
                {pair}
              </option>
            ))}
          </select>
        </label>
        <label>
          Timeframe
          <select
            value={timeframe}
            onChange={(e) => void setTimeframe(e.target.value as typeof timeframe)}
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf} disabled={!canShowTimeframe(datasets, symbol, tf)}>
                {tf}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <div className="chip">
            {clock ? (hideDate && mode === 'replay' ? '••••-••-••' : clock.date) : '—'}
          </div>
        </label>
        <label>
          Time
          <div className="chip">{clock ? clock.time : '—'}</div>
        </label>
        <label>
          Session
          <div className="chip">{session}</div>
        </label>
        <label>
          Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEED_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </label>
      </div>
```

with:

```tsx
      <div className="top-controls">
        <div className="control-group">
          <label>
            Symbol
            <select value={symbol} onChange={(e) => void selectSymbol(e.target.value)}>
              {pairs.map((pair) => (
                <option key={pair} value={pair}>
                  {pair}
                </option>
              ))}
            </select>
          </label>
          <label>
            Timeframe
            <select
              value={timeframe}
              onChange={(e) => void setTimeframe(e.target.value as typeof timeframe)}
            >
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf} disabled={!canShowTimeframe(datasets, symbol, tf)}>
                  {tf}
                </option>
              ))}
            </select>
          </label>
          <label>
            Speed
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {SPEED_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}x
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="readout-group">
          <label>
            Date
            <div className="readout-value">
              {clock ? (hideDate && mode === 'replay' ? '••••-••-••' : clock.date) : '—'}
            </div>
          </label>
          <label>
            Time
            <div className="readout-value">{clock ? clock.time : '—'}</div>
          </label>
          <label>
            Session
            <div className="readout-value">{session}</div>
          </label>
        </div>
      </div>
```

- [ ] **Step 2: Add the group and readout styles**

In `src/renderer/src/styles/global.css`, find this existing block (currently
~line 251):

```css
.field textarea {
  resize: vertical;
  min-height: 72px;
}
```

Add immediately after it:

```css

.control-group,
.readout-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.readout-group {
  padding-left: 16px;
  border-left: 1px solid var(--rule);
}

.readout-value {
  padding: 7px 2px;
  color: var(--parchment);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 4: Visual verification**

```bash
env -u ELECTRON_RUN_AS_NODE npm run dev
```

Open a strategy to reach the Tester workspace. Confirm in the top bar:
- Symbol, Timeframe, and Speed sit together on the left as one group.
- Date, Time, and Session sit together on the right, separated from the
  first group by a visible thin vertical divider.
- Date/Time/Session no longer look like boxed inputs (no border/background
  behind them) — they read as plain status text, visually distinct from
  the real dropdowns.
- Nothing overlaps or wraps awkwardly at the app's default 1600×1000
  window size.

Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/TopBar.tsx src/renderer/src/styles/global.css
git commit -m "$(cat <<'EOF'
Separate top bar controls from read-only readouts

Symbol/Timeframe/Speed (real selects) and Date/Time/Session (derived
display values) were rendered with identical styling in one flat row of
six. Groups them visually and gives the read-only values a plain
ticker-style look instead of a fake-input box, so the row reads as two
clusters instead of six equal-weight fields.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Strategy grid stops overflowing with few cards

**Files:**
- Modify: `src/renderer/src/components/StrategyLibrary.tsx`
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Add the "Add strategy" tile to the grid**

In `src/renderer/src/components/StrategyLibrary.tsx`, replace:

```tsx
          <div className="strategy-grid">
            {strategies.map((s) => (
              <article key={s.id} className="strategy-card">
                <button className="strategy-card-main" onClick={() => openStrategy(s.id)}>
                  <span className="stamp">{engineName(s.settings.strategyId)}</span>
                  <strong>{s.name}</strong>
                  <span>
                    {s.notes ||
                      STRATEGY_CATALOG.find((c) => c.id === s.settings.strategyId)?.description}
                  </span>
                  <dl>
                    <div className="stat">
                      <span>Lookback</span>
                      <b>{s.settings.lookback}</b>
                    </div>
                    <div className="stat">
                      <span>RR</span>
                      <b>{s.settings.defaultRr}</b>
                    </div>
                    <div className="stat">
                      <span>Vol</span>
                      <b>{s.settings.volumeMultiplier}</b>
                    </div>
                  </dl>
                </button>
                <ConfirmIconButton
                  className="strategy-delete"
                  icon="trash"
                  label="Delete strategy"
                  confirmLabel={`Click again to delete ${s.name}`}
                  onConfirm={() => void deleteSavedStrategy(s.id)}
                />
              </article>
            ))}
          </div>
```

with:

```tsx
          <div className="strategy-grid">
            {strategies.map((s) => (
              <article key={s.id} className="strategy-card">
                <button className="strategy-card-main" onClick={() => openStrategy(s.id)}>
                  <span className="stamp">{engineName(s.settings.strategyId)}</span>
                  <strong>{s.name}</strong>
                  <span>
                    {s.notes ||
                      STRATEGY_CATALOG.find((c) => c.id === s.settings.strategyId)?.description}
                  </span>
                  <dl>
                    <div className="stat">
                      <span>Lookback</span>
                      <b>{s.settings.lookback}</b>
                    </div>
                    <div className="stat">
                      <span>RR</span>
                      <b>{s.settings.defaultRr}</b>
                    </div>
                    <div className="stat">
                      <span>Vol</span>
                      <b>{s.settings.volumeMultiplier}</b>
                    </div>
                  </dl>
                </button>
                <ConfirmIconButton
                  className="strategy-delete"
                  icon="trash"
                  label="Delete strategy"
                  confirmLabel={`Click again to delete ${s.name}`}
                  onConfirm={() => void deleteSavedStrategy(s.id)}
                />
              </article>
            ))}
            <button type="button" className="strategy-card-add" onClick={() => setComposer(true)}>
              <Icon name="plus" />
              <span>New strategy</span>
            </button>
          </div>
```

- [ ] **Step 2: Cap the grid column growth**

In `src/renderer/src/styles/global.css`, replace:

```css
.strategy-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
```

with:

```css
.strategy-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 320px));
  justify-content: start;
  gap: 12px;
}
```

- [ ] **Step 3: Style the add-tile**

In `src/renderer/src/styles/global.css`, find this existing block (currently
~line 1240):

```css
.strategy-delete {
  position: absolute;
  top: 10px;
  right: 10px;
}
```

Add immediately after it:

```css

.strategy-card-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 210px;
  padding: 20px 18px 18px;
  border: 1px dashed var(--rule);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--muted);
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.strategy-card-add:hover {
  border-color: var(--gold-dim);
  color: var(--gold);
  background: var(--gold-soft);
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 5: Visual verification**

```bash
env -u ELECTRON_RUN_AS_NODE npm run dev
```

On the Strategy Library screen (with the app's current 2 saved
strategies):
- The 2 existing cards keep a comfortable, fixed size — they no longer
  stretch to fill the row.
- A third tile, dashed border, "+ New strategy", appears immediately after
  them in the same grid.
- Clicking the new tile opens the same "New strategy" composer modal as
  the top-right `+` icon button.
- With zero strategies (temporarily rename/delete both in the UI to check,
  then recreate them, or just read the code path): the existing centered
  "No strategies yet" empty state still shows instead of the grid — confirm
  by reading `StrategyLibrary.tsx`'s `strategies.length === 0` branch is
  unchanged (it is, this task only touched the non-empty branch), no need
  to actually delete the user's real strategies to verify this.

Stop the dev server when done.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/StrategyLibrary.tsx src/renderer/src/styles/global.css
git commit -m "$(cat <<'EOF'
Fix strategy grid overflow and add an inline add-tile

.strategy-grid used minmax(280px, 1fr), which stretches empty grid
tracks across the full row width when there are only 1-2 cards,
producing a large dead void. Caps card width instead, and adds a
persistent dashed add-tile as the last grid item so there's always an
obvious next action alongside the cards.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Market table pair-grouping becomes visible

**Files:**
- Modify: `src/renderer/src/styles/global.css`

No JSX change — `MarketDesk.tsx` already renders `rowSpan={tapes.length}`
on the pair cell and `data-group-start={i === 0}` on every row; this task
only adds the missing CSS.

- [ ] **Step 1: Reset per-row borders and re-add them only at group boundaries**

In `src/renderer/src/styles/global.css`, find this existing block (currently
~line 1151):

```css
.market-table-sub {
  color: var(--muted);
  font-family: 'Archivo', 'Helvetica Neue', Arial, sans-serif;
  font-size: 11px;
}
```

Add immediately after it:

```css

.market-table tbody tr td {
  border-top: 0;
}

.market-table tbody tr[data-group-start='true'] td {
  border-top: 1px solid var(--rule);
}
```

(This overrides the generic `.history-table td { border-top: 1px solid
var(--rule) }` rule specifically for `.market-table`, so only the first row
of each pair group gets a divider — the sub-rows underneath read as
belonging to that pair instead of being visually identical to a group
boundary.)

- [ ] **Step 2: Visual verification**

This needs at least one pair with multiple timeframes stored, which the
current dev database already has (XAUUSD has 6 timeframe rows). Switch the
theme pref to dark first since that's the priority theme (see Environment
note above for the safe sqlite steps), then:

```bash
env -u ELECTRON_RUN_AS_NODE npm run dev
```

Go to Strategy Library → Market tab. Confirm:
- Each pair (GBPUSD, XAUUSD) shows a visible divider line above its first
  row.
- The sub-rows for the same pair (e.g. XAUUSD's 1D/1D/1H/4H/5M rows) have
  **no** divider between them — they read as a contiguous block under one
  pair header.
- The `GBPUSD`/`XAUUSD` bold pair name + subtitle (left column) still spans
  the full height of its group (unaffected — this task didn't touch
  `.market-table-pair`).

Restore the theme pref backup and stop the dev server when done (see
Environment note).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/styles/global.css
git commit -m "$(cat <<'EOF'
Style the market table's pair-grouping divider

MarketDesk.tsx already rendered rowSpan + a data-group-start attribute
per pair group, but no CSS read that attribute, so multi-timeframe pairs
looked like a flat list of unrelated rows. Adds the missing divider rule.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Trade history "Skipped N" stops crowding the filter row

**Files:**
- Modify: `src/renderer/src/styles/global.css`

No JSX change — `TradeHistory.tsx`'s markup is already correct
(`<span className="muted">Skipped {skipped.length}</span>` as the last
child of `.filters`); this task only adds the missing alignment rule.

- [ ] **Step 1: Push the skipped count to the row's trailing edge**

In `src/renderer/src/styles/global.css`, find this existing block (currently
~line 748):

```css
.filters {
  display: flex;
  gap: 6px;
  margin: 8px 0;
  flex-wrap: wrap;
}
```

Add immediately after it:

```css

.filters .muted {
  margin-left: auto;
}
```

- [ ] **Step 2: Visual verification**

```bash
env -u ELECTRON_RUN_AS_NODE npm run dev
```

Open a strategy to reach the Tester workspace and look at the Trade
History panel (bottom right). Confirm "Skipped 0" (or whatever the current
count is) sits at the far right of the filter row, clearly separated from
the ALL/WIN/LOSS/BUY/SELL buttons rather than immediately adjacent to
SELL.

Stop the dev server when done.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/styles/global.css
git commit -m "$(cat <<'EOF'
Separate trade history skipped-count from the filter buttons

.filters had no rule pushing the trailing "Skipped N" readout away from
the last filter button, so it crowded against SELL. Pins it to the row's
trailing edge.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Final check (after all 5 tasks)

- [ ] Run the full existing test suite once at the end to confirm nothing
  in `src/core` broke (none of these tasks touch `src/core`, but this is
  a cheap final sanity check):

  Run: `npm test`
  Expected: all existing tests pass, same as before this plan started.

- [ ] Run `npm run typecheck` one final time on the whole tree.
  Expected: no errors.
