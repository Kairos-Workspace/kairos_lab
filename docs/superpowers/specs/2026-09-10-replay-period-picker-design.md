# Replay period picker popup

## Problem

Clicking **Start** in the Strategy panel (`StrategyPanel.tsx`) begins a replay
immediately via `startReplay()`, which falls back to whatever `replayFromTs` /
`replayToTs` happen to be sitting in the store. Those values default to the
full bounds of the loaded dataset when a dataset is loaded (`useAppStore.ts`
`loadDataset`, lines ~719-721), but if the user has previously narrowed the
range using the inline From/To fields in `ReplayControls.tsx`, that narrowed
range silently persists and is reused the next time Start is pressed — with
no indication to the user that they're not replaying the full history.

## Goal

Clicking Start should always make the intended period explicit: a popup asks
the user to choose "Full history" (default) or a custom date range, so a
single click still plays everything, and switching to a narrower window is a
deliberate, visible choice rather than a leftover from an earlier session.

## Non-goals

- The **Random** button (`startReplay({ random: true, hideDate: true })`) is
  unchanged — it jumps to a random point in history, which is a distinct
  feature from choosing a period to play through.
- The inline From/To/Apply row in `ReplayControls.tsx` is unchanged — it
  remains available for adjusting the range of an already-running replay.
- No changes to the underlying replay engine, `startReplay`, or
  `setReplayRange` store actions — their existing signatures already support
  everything this feature needs.

## Design

### New component: `ReplayRangeModal.tsx`

Rendered conditionally from `StrategyPanel.tsx` when the user clicks Start.
Visually reuses the app's existing modal pattern (the `.modal-backdrop` +
`.composer` card already used for the "Download Data" popup in
`MarketDesk.tsx`) so it matches the rest of the app rather than introducing a
new visual language.

Props: `onClose: () => void`.

Local state:
- `mode: 'full' | 'custom'`, default `'full'`.
- `from`, `to`: datetime-local input strings, initialized from the store's
  current `replayFromTs` / `replayToTs` (falling back to the first/last
  `displayCandles` timestamps), via the shared `toInput` helper.

Layout (inside `.modal-backdrop` > `form.composer`):
- Header: `<span className="stamp">Replay</span>` + `<h2>Choose period</h2>`,
  plus a close icon button (`Icon name="close"`), matching the
  `MarketDesk` download modal header.
- Two radio rows (styled like the existing checkbox rows in
  `StrategyPanel.tsx`, e.g. "Pause on setup"):
  - `Full history` — selected by default.
  - `Custom range` — selecting it reveals the From/To datetime-local fields
    (same fields/labels as `ReplayControls.tsx`, reusing the shared
    `toInput`/`fromInput` helpers).
- Footer (`.composer-actions`): `Cancel` (`ghost`) and `Start`
  (`primary icon-label`, with `Icon name="play"`) — the same gold "primary
  action" styling already used for Start/Download buttons elsewhere in the
  app. (The blue/red `buy`/`sell` classes are reserved for trade-direction
  buttons specifically, so they don't belong on a generic confirm action.)

Submit behavior:
- `mode === 'full'`: call `setReplayRange(null, null)` then `startReplay()`.
  Explicitly clearing the range (rather than just calling `startReplay()`
  alone) is what fixes the bug — it guarantees a stale narrowed range from an
  earlier session cannot leak through.
- `mode === 'custom'`: parse `from`/`to` via `fromInput`, call
  `setReplayRange(fromTs, toTs)` then `startReplay({ fromTs, toTs })` —
  mirroring the existing `applyRange()` logic in `ReplayControls.tsx`.
- Either branch calls `onClose()` afterward.
- Clicking the backdrop (outside the card) or the close icon also calls
  `onClose()` without starting anything, matching the `MarketDesk` modal's
  `onMouseDown` backdrop-click-to-close behavior.

### `StrategyPanel.tsx` changes

- Add local state `const [showRangeModal, setShowRangeModal] = useState(false)`.
- Change the Start button's `onClick` from `() => startReplay()` to
  `() => setShowRangeModal(true)`.
- Render `{showRangeModal && <ReplayRangeModal onClose={() => setShowRangeModal(false)} />}`.
- The Random button is untouched.

### Shared helper extraction

`toInput` / `fromInput` (timestamp ↔ `datetime-local` string conversion)
currently live only inside `ReplayControls.tsx`. Extract them to
`src/renderer/src/utils/replayRange.ts` and import from both
`ReplayControls.tsx` and the new `ReplayRangeModal.tsx`, so the two date
pickers stay in sync without duplicated logic.

## Testing

- Manual: load a dataset, narrow the range via `ReplayControls`' inline
  From/To/Apply, then click Start in the Strategy panel — confirm the modal
  appears with "Full history" pre-selected, and confirming it plays the
  entire dataset (not the previously narrowed range).
- Manual: open the modal, switch to "Custom range", pick a From/To, confirm
  it starts replay bounded to that range (playback pauses at the To
  timestamp, matching existing `step()` behavior at `useAppStore.ts:875`).
- Manual: open the modal and cancel (via Cancel button and via backdrop
  click) — confirm no replay starts and no state changes.
- `npm run typecheck` passes.
