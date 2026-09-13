# Welcome Screen: Lab Picker (Strategy Lab / EA Development Lab)

## Context

The Welcome screen (`src/renderer/src/components/Welcome.tsx`) currently shows
one primary button, "Enter Strategy Lab", which calls the store's
`enterLibrary()` action to navigate to the Strategy Lab. We're adding a second
option, "EA Development Lab" (Expert Advisor / automated trading bot
development), replacing the single button with a choice between the two.

The EA Development Lab has no implementation yet — this change only adds its
placeholder entry point on the Welcome screen, marked as not yet available.

## Goals

- Welcome screen presents two options side by side: "Strategy Lab" (fully
  functional, same behavior as today's button) and "EA Development Lab"
  (visibly present, but inert — a placeholder for future work).
- The disabled option must read clearly as "not ready yet", not as a bug or a
  broken button.

## Non-goals

- No actual EA Development Lab screen, route, or store action — purely a
  placeholder entry on Welcome.
- No tooltip/toast on click for the disabled option — it isn't clickable at
  all, so there's nothing to click.

## Design

### `Welcome.tsx`

Replace the single `<button className="primary" onClick={enterLibrary}>` with
a `.welcome-labs` container holding two cards:

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

- **Strategy Lab** is a real `<button>` — keyboard-focusable, calls
  `enterLibrary()` on click, identical behavior to today's button, just
  restyled as a card.
- **EA Development Lab** is a plain `<div>`, not a button — genuinely
  non-interactive (no `onClick`, not in the tab order), rather than a
  `<button disabled>` that would still visually read as a broken clickable
  control. `aria-disabled="true"` and `data-disabled="true"` communicate its
  state for styling and assistive tech.
- No new icons, no new child components — both cards are inlined directly in
  `Welcome.tsx`'s JSX, consistent with how `StrategyLibrary.tsx` already
  inlines its own card markup rather than extracting a subcomponent.

### CSS (`global.css`)

New classes modeled on the existing `.strategy-card` visual language (bordered
box, gradient background, hover border-color shift), scoped to the welcome
screen:

```css
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

`.welcome-lab-soon` deliberately uses `--muted` rather than `--gold` (the
color `.stamp` uses elsewhere) — gold reads as active/brand emphasis
throughout this app, which would contradict "not available yet".

## Edge cases

- None beyond what's already handled: the Strategy Lab card's behavior and
  the stats above it are completely unchanged by this task.

## Verification

Same constraint as the original Welcome screen work: no component-test
harness exists in this repo. Verify manually (via the `run` skill): both
cards render side by side, Strategy Lab card navigates correctly on click and
on Enter/Space when focused via keyboard, the EA Development Lab card is
visually dimmed with a "Coming soon" label, is not in the tab order, and does
nothing when clicked. Check both light and dark themes.
