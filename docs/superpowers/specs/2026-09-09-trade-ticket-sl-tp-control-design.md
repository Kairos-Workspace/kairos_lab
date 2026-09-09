# Manual + strategy trade ticket — design

## Context

The user asked for manual trades to let the trader control SL/TP "like in
the strategy trade." Investigation of the running app (not just the source)
showed the premise needs correcting: strategy setups and manual trades
already funnel through the exact same `draft` / `pendingSetup` state and the
same `ChartTradeOverlay` component, so there is no asymmetry between the two
today — both currently support **dragging** SL/TP handles on the chart and
nothing else.

Two dead components, `TradeEntryModal.tsx` and `SetupModal.tsx`, exist in
`src/renderer/src/components/` with real number inputs for Entry/SL/TP/Risk%,
but neither is imported or mounted anywhere in the app (confirmed by
grepping the whole `src` tree). They also render as
`position: fixed; inset: 0` backdrops at `z-index: 20`, above the chart
overlay's `z-index: 4` — if either were mounted as-is, it would block all
pointer events to the chart underneath, making the drag handles unusable
while it's open.

There is also a real latent bug in the current drag path: `takeSetup()`
unconditionally recomputes default SL/TP from `defaultStopTarget()` every
time it runs. `ChartTradeOverlay`'s `applyPrice()` calls `takeSetup()` as a
lazy side effect on the *first* drag movement of a still-pending strategy
setup (to materialize a `draft` for the setup). If the chart's floating
"Take" button is then clicked, `takeNow()` calls `takeSetup()` again,
silently discarding whatever the user just dragged and confirming the trade
at the recomputed defaults instead.

## Goal

Give both manual trades and strategy setups typed numeric control
(Entry/SL/TP/Risk %) *in addition to* the existing chart-drag control, via
one shared mechanism — not a manual-only patch — while fixing the
drag-value-discard bug as part of unifying the two paths.

## Non-goals

- No typed-number editing for an already-open/active trade. That stays
  drag-only, as it is today. (Confirmed with the user — scope is the
  pre-confirmation decision phase only: after a Buy/Sell click or a strategy
  signal fires, before the trade is opened.)
- No change to `autoEntry` mode (fully automatic trades skip the draft/ticket
  entirely today and will continue to).
- No redesign of position sizing/risk math (`calculatePositionSize`,
  `riskReward`) — reused as-is from `@core/trade/sizing`.
- No change to the strategy signal detection logic itself
  (`strategy.onCandle`) — only to how its result is turned into an editable
  draft.

## Design

### Unify draft creation (`useAppStore.ts`)

Today `draft` is created eagerly for manual trades (`startManualTrade`) but
lazily for strategy setups (only once the user starts dragging, via
`takeSetup()` inside `applyPrice`). Make it eager in both cases: when the
replay loop detects a signal and pauses (`pendingSetup` gets set, in the
`step()` block around line 887), compute the default SL/TP with
`defaultStopTarget()` and set `draft` in the same `set()` call.

This removes the need for `applyPrice()`'s
`if (!state.draft && state.pendingSetup) state.takeSetup()` branch entirely
— a live frame's handles can just call `updateDraft()` directly, since a
draft is guaranteed to already exist. It also fixes the discard bug: once
`takeSetup`'s job is reduced to "confirm now" (see below), it no longer
recomputes defaults over an edited draft.

`tradeModalOpen` is removed from the store. It was only ever used as an
"is there a pending decision" flag; `draft !== null` already means exactly
that, so keeping both was redundant state that could (and did) drift apart.
Every read site (`canStartManualTrade`, the `play()`/`step()` pause guards,
`resolveLiveLevels`) switches to checking `draft` (and/or `pendingSetup` for
the strategy-specific pause behavior, which is unchanged).

`takeSetup()` becomes a thin wrapper that just calls `confirmTrade()` — it
no longer recomputes or resets anything, since `draft` already holds either
the computed defaults or whatever the user dragged/typed. `skipSetup()`
additionally clears `draft: null` (previously only needed to clear
`pendingSetup` since `draft` may not have existed yet).

### New component: `TradeTicket.tsx`

Replaces `TradeEntryModal.tsx` and `SetupModal.tsx` (both deleted — dead
code, superseded). Key difference from the old design: **docked, not a
blocking backdrop.** It's an absolutely-positioned card anchored to a corner
of the chart panel (reusing the existing `.ticket`/`.field` styling from
`global.css`, minus the `.modal-backdrop` wrapper), so it never intercepts
pointer events meant for the chart's drag handles. Dragging and typing stay
simultaneously usable — typing a value updates the chart's price lines/box
immediately (existing `draft` → `ChartTradeOverlay` wiring already does
this), and dragging updates the ticket's number inputs immediately (same
`updateDraft()` call already used by drag).

Rendered whenever `draft !== null` and there's no `activeTrade` yet — i.e.
exactly the pre-confirmation phase, for both manual and strategy origins,
with no special-casing between them.

Fields: direction toggle (Buy/Sell), Entry, Stop loss, Take profit, Risk %
— all editable numbers, bound to `draft` via the existing `updateDraft()`
action. Below the fields: computed Position size / Risk USD / R:R preview
(reusing `calculatePositionSize`/`riskReward`, same as the old dead modal).
Actions: "Confirm" (calls `confirmTrade()`) and "Cancel" (calls
`skipSetup()` if `pendingSetup` is set, else just clears `draft`).

### `ChartTradeOverlay.tsx` cleanup

The floating "Take"/"Skip" buttons drawn on the chart (`pos-card-actions`)
are removed — they'd otherwise duplicate the ticket's Confirm/Cancel and
invite the same confusion the drag-discard bug came from (two different
places to finalize the same draft). The position box, zones, price lines,
and drag handles are unchanged. `resolveLiveLevels`/`listPositionFrames`
drop the now-unused `tradeOpen` parameter.

### Keyboard shortcuts (`useKeyboard.ts`)

No changes needed. `t`/`T` → `takeSetup()` and `s`/`S` → `skipSetup()`
keep working, now operating on a draft that's always already populated by
the time a signal is pending.

## Files touched

- `src/renderer/src/store/useAppStore.ts` — remove `tradeModalOpen`; create
  `draft` alongside `pendingSetup` in `step()`; simplify `takeSetup()`;
  update `skipSetup()`, `startManualTrade()`, `canStartManualTrade`-adjacent
  reads.
- `src/renderer/src/components/ChartTradeOverlay.tsx` — drop `tradeOpen`
  param, simplify `applyPrice()`, remove floating action buttons.
- `src/renderer/src/components/ChartPanel.tsx` — drop `tradeModalOpen`
  reads, mount `<TradeTicket />`.
- `src/renderer/src/components/TradeTicket.tsx` — new.
- `src/renderer/src/components/TradeEntryModal.tsx`,
  `src/renderer/src/components/SetupModal.tsx` — deleted.
- `src/renderer/src/styles/global.css` — add docked-card positioning styles
  (reuse existing `.ticket`/`.field` visuals).

## Testing

Manual verification via the `run` skill (this is an Electron desktop app;
no automated UI test harness exists in `tests/`):

1. Click Buy/Sell on a loaded chart → ticket appears docked in a chart
   corner, drag handles appear on the chart, both editable.
2. Type a new Stop loss value → chart price line/handle moves to match.
3. Drag the Take profit handle → ticket's Take profit field updates to
   match.
4. Click Confirm → trade opens with the last-edited values (not defaults).
5. Repeat 1-4 for a strategy-detected setup (`pauseOnSetup` on) to confirm
   parity.
6. Click Cancel on a strategy setup → confirm it's logged to the skipped
   list as before.
