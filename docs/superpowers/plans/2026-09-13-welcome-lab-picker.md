# Welcome Lab Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Welcome screen's single "Enter Strategy Lab" button with two side-by-side option cards — "Strategy Lab" (functional) and "EA Development Lab" (inert, coming-soon placeholder).

**Architecture:** Pure presentation change in one component (`Welcome.tsx`) plus supporting CSS. No store changes, no new routes — the Strategy Lab card keeps calling the existing `enterLibrary()` action; the EA Development Lab card is a non-interactive `<div>` with no click handler at all.

**Tech Stack:** React + TypeScript (renderer), plain CSS. Same testing constraint as the rest of this app: no component-test harness exists (vitest is Node-only, no jsdom/testing-library) — verified manually via the `run` skill instead.

**Spec:** `docs/superpowers/specs/2026-09-13-welcome-lab-picker-design.md`

---

## File Structure

- **Modify** `src/renderer/src/components/Welcome.tsx` — replace the single CTA button with the two-card picker.
- **Modify** `src/renderer/src/styles/global.css` — add `.welcome-labs`, `.welcome-lab-card`, and `.welcome-lab-soon` rules.

---

### Task 1: Replace the single CTA with the two-card picker

**Files:**
- Modify: `src/renderer/src/components/Welcome.tsx`

- [ ] **Step 1: Update the JSX**

In `src/renderer/src/components/Welcome.tsx`, change:

```tsx
        <button type="button" className="primary" onClick={enterLibrary}>
          Enter Strategy Lab
        </button>
```

to:

```tsx
        <div className="welcome-labs">
          <button type="button" className="welcome-lab-card" onClick={enterLibrary}>
            <strong>Strategy Lab</strong>
            <span>Backtest and manage strategies</span>
          </button>
          <div className="welcome-lab-card" data-disabled="true" aria-disabled="true">
            <strong>EA Development Lab</strong>
            <span>Build automated trading bots</span>
            <span className="welcome-lab-soon">Coming soon</span>
          </div>
        </div>
```

Nothing else in the file changes — `enterLibrary` is already selected from the store above this JSX, and every other line stays as-is.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Welcome.tsx
git commit -m "Replace Welcome's single CTA with a Strategy Lab / EA Development Lab picker"
```

---

### Task 2: Style the two cards

**Files:**
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Add the new rules**

Find this existing rule:

```css
.welcome-stats {
  display: flex;
  gap: 10px;
}
```

Change it to (keep the original rule, add the new ones directly after it):

```css
.welcome-stats {
  display: flex;
  gap: 10px;
}

.welcome-labs {
  display: flex;
  gap: 12px;
}

.welcome-lab-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  width: 220px;
  padding: 16px 18px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, var(--bar-from) 0%, var(--bar-to) 100%);
  text-align: left;
  color: inherit;
  font: inherit;
}

.welcome-lab-card strong {
  font-family: 'Archivo', 'Helvetica Neue', Arial, sans-serif;
  font-size: 16px;
  font-weight: 700;
  color: var(--parchment);
}

.welcome-lab-card > span {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}

.welcome-lab-card:not([data-disabled='true']):hover {
  border-color: var(--gold-dim);
  cursor: pointer;
}

.welcome-lab-card[data-disabled='true'] {
  opacity: 0.55;
  cursor: not-allowed;
}

.welcome-lab-soon {
  margin-top: 2px;
  color: var(--muted);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
```

`.welcome-lab-soon` deliberately uses `--muted` rather than `--gold` (the color `.stamp` uses elsewhere) — gold reads as active/brand emphasis throughout this app, which would contradict "not available yet". Do not add any rule that changes `.strategy-card` or any other existing class — this is purely additive.

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/styles/global.css
git commit -m "Style the Strategy Lab / EA Development Lab cards"
```

(No typecheck applies — CSS isn't typechecked. Verified visually in Task 3.)

---

### Task 3: Manual verification

**REQUIRED SUB-SKILL:** Use the `run` skill to launch the app for this task.

- [ ] **Step 1: Launch the app**

Use the `run` skill to start the Electron app.

- [ ] **Step 2: Verify layout**

On the Welcome screen, confirm both cards render side by side: "Strategy Lab" (with subtitle "Backtest and manage strategies") and "EA Development Lab" (with subtitle "Build automated trading bots" and a "Coming soon" label), below the stat chips.

- [ ] **Step 3: Verify Strategy Lab card works**

Click the Strategy Lab card — confirm it navigates to the Strategy Lab, identical to the old button's behavior. Also confirm it's reachable via keyboard (Tab to it, press Enter/Space) since it's a real `<button>`.

- [ ] **Step 4: Verify EA Development Lab card is inert**

Confirm clicking it does nothing (no navigation, no error). Confirm it is dimmed/muted compared to the Strategy Lab card. Confirm it is NOT reachable via Tab (since it's a plain `<div>`, not a button, it shouldn't be in the tab order).

- [ ] **Step 5: Check both themes**

Toggle light/dark mode — confirm both cards render legibly and the "Coming soon" label and dimmed styling are visible in both themes.

If any step fails, fix the relevant file, re-run `npm run typecheck`, and re-verify before finishing. No commit is needed for this task unless a fix was required, in which case commit the fix with a message describing what was wrong.
