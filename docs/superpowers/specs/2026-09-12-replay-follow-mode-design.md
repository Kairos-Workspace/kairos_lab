# Replay follow mode: auto-navigate to the playhead without trapping the user

## Problem

During replay, `ChartPanel.tsx`'s `paint()` effect has two repaint paths (lines
251-334):

- **Incremental** (lines 269-278): fires only when exactly one new candle was
  appended with no overlay change. It just calls `series.update()` and relies
  on lightweight-charts' built-in `shiftVisibleRangeOnNewBar` option to keep
  the latest bar in view — and that option only shifts the view if the last
  bar is *already* visible, so this path alone happens to leave the user alone
  if they've panned away.
- **Full redraw** (lines 280-309): fires for everything else — `step(±5/±10)`,
  stepping backward, `resetReplay`, `jumpToDate`, any settings/overlay change,
  or the chart remounting. This path unconditionally recenters the view on
  `[replayIndex-160, replayIndex+24]` (lines 300-305), discarding wherever the
  user had manually panned or zoomed to.

In practice, trade signals, indicator updates, and the step buttons make the
full-redraw path fire constantly during a real replay session, so the chart
keeps snapping back to the playhead and the user can never stay scrolled away
to inspect something. There is currently no "follow mode" concept anywhere in
the codebase (store or component) — nothing tracks whether the user has taken
manual control.

## Goal

- Clicking Play should snap the view to the currently-playing candle.
- While playing, the view keeps following the playhead by default.
- If the user pans or zooms the chart during playback, that suspends
  following — they can look wherever they want.
- After 4 seconds with no further interaction, following resumes
  automatically and the view snaps back to the playhead.
- The explicit navigation controls (Play, step ±1/±5/±10, Reset, Jump-to-date)
  always snap to their target and resume following, since those are direct
  "take me here" commands, not passive browsing.
- Pausing suspends none of this by force — while paused there's no moving
  target, so the user keeps whatever view they have until they press Play or
  an explicit step control again.

## Non-goals

- No visible "Following / paused" indicator badge and no manual "jump to
  live" button — not requested, and the idle-timeout is the only re-follow
  trigger per the agreed design. Easy to add later if it turns out to feel
  confusing without one.
- No changes to the pagination scroll-back mechanism (`pendingRangeShift`,
  `shouldLoadOlder`, `shiftedVisibleRange`) — that's a `mode === 'view'`-only
  concern and is left exactly as-is.
- No change to `confirmTrade`'s existing auto-resume-play-after-confirm
  behavior (`useAppStore.ts:1348`). It's unaffected by this design: the pan
  listener only ever disables follow while `isPlaying` is true, and
  `isPlaying` is false during the pending-setup pause, so panning during that
  pause never touches `followReplay` — it's simply whatever it was before the
  pause, and resuming naturally continues from there.

## Design

### Store (`useAppStore.ts`)

Add one field to `AppState`, next to `isPlaying` (line 76):

```ts
followReplay: boolean
```

Default `true` (alongside `isPlaying: false` at line 335).

Add two actions:

- `setFollowReplay: (v: boolean) => void` → `set({ followReplay: v })`. Used
  by `ChartPanel.tsx` to turn following off on user interaction and back on
  when the idle timer fires.
- `manualStep: (n: number) => void` → `set({ followReplay: true }); get().step(n)`.

`manualStep` exists because `step()` itself is called both by user-facing
controls (ReplayControls' back/next/+5/+10 buttons, arrow-key shortcuts) *and*
internally by the autoplay RAF loop (`useAppStore.ts:1068`,
`get().step(1)` once per tick). Those two callers need opposite behavior —
a user clicking "+5" should snap back to following, but the autoplay loop's
own per-tick `step(1)` must never force `followReplay` back on, or panning
away during smooth playback would be undone on the very next tick. Since the
call signature is identical either way, the only reliable place to
distinguish them is at the call site, not inside `step()`. So:

- `ReplayControls.tsx` (lines 34, 46, 49, 52) switches its four step buttons
  from `step(...)` to `manualStep(...)`.
- `useKeyboard.ts` (lines 23, 26) switches `ArrowRight`/`ArrowLeft` from
  `store.step(...)` to `store.manualStep(...)`.
- The RAF loop in `play()` (`useAppStore.ts:1068`) keeps calling `get().step(1)`
  unchanged.

Three existing actions get one field added to their `set(...)` calls, since
none of them are ever called from the autoplay loop — every caller is
already a genuine "go to this point" action:

- `startReplay` (`useAppStore.ts:1016-1034`): add `followReplay: true`. Covers
  starting a fresh replay, the Random button, and `applyRange`/`Apply` — a
  brand new session should obviously start out following.
- `resetReplay` (`useAppStore.ts:1238-1245`): calls `startReplay(...)`
  internally, so it already inherits `followReplay: true` — no separate change
  needed.
- `jumpToDate` (`useAppStore.ts:1247-1252`): add `followReplay: true` to the
  `mode === 'replay'` branch's `set({...})`.

`togglePlay` (`useAppStore.ts:1081-1084`) changes to force follow back on only
when transitioning from paused to playing (not on every `play()` call —
`setSpeed`, `useAppStore.ts:620-627`, calls `pause()` then `play()` internally
to restart the RAF loop at a new tick rate, and that restart must *not*
override wherever the user had panned to):

```ts
togglePlay: () => {
  if (get().isPlaying) get().pause()
  else {
    set({ followReplay: true })
    get().play()
  }
},
```

`play()` itself is left unmodified.

### `ChartPanel.tsx`: detecting user interaction

Attach `pointerdown` and `wheel` listeners directly to `hostRef.current` (the
chart's own host element, passed to `createChart()` at line 134) in a new
effect. Native DOM listeners are used rather than lightweight-charts' own
`subscribeVisibleLogicalRangeChange` because that callback fires for *any*
range change — including our own `setVisibleLogicalRange()` calls and the
library's implicit `shiftVisibleRangeOnNewBar` shifts — with no way to tell
who caused it. Raw pointer/wheel events unambiguously mean "the user touched
the chart," which is what we actually want to detect. A bare `pointerdown`
(not requiring drag distance) is enough — TradingView-style charts treat any
chart interaction as "user took control," and that's a fine simplification
here too (e.g. a click that only moves the crosshair briefly suspends
following, which is harmless).

```ts
const FOLLOW_RESUME_MS = 4000
const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

useEffect(() => {
  const el = hostRef.current
  if (!el) return
  const onInteract = () => {
    const s = useAppStore.getState()
    if (s.mode !== 'replay' || !s.isPlaying) return
    if (s.followReplay) s.setFollowReplay(false)
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => {
      if (useAppStore.getState().isPlaying) {
        useAppStore.getState().setFollowReplay(true)
      }
    }, FOLLOW_RESUME_MS)
  }
  el.addEventListener('pointerdown', onInteract, { passive: true })
  el.addEventListener('wheel', onInteract, { passive: true })
  return () => {
    el.removeEventListener('pointerdown', onInteract)
    el.removeEventListener('wheel', onInteract)
  }
}, [])
```

A second small effect clears any pending idle timer as soon as playback
pauses, so a stray timer can't fire and yank the view during what should be a
free-navigation pause:

```ts
useEffect(() => {
  if (!isPlaying && idleTimerRef.current) {
    clearTimeout(idleTimerRef.current)
    idleTimerRef.current = null
  }
}, [isPlaying])
```

(`isPlaying` needs to be read via a component-level selector for this effect's
dependency array, alongside the existing `mode` selector at line 113.)

### `ChartPanel.tsx`: snapping back when follow resumes

`followReplay` flipping from `false` to `true` (idle timeout firing, or one of
the store actions above) needs an *immediate* recenter — it can't just wait
for the next paint, because the incremental path never calls
`setVisibleLogicalRange` at all, and if the user is currently far from the
playhead, `shiftVisibleRangeOnNewBar` won't catch it up (it only shifts by one
bar-width from wherever the view already is, and only if the last bar is
already visible). New effect, keyed only on the `followReplay` transition
(not `replayIndex`, so it does nothing on every ordinary tick while already
following — the existing paint pipeline already handles that case):

```ts
useEffect(() => {
  if (!chartApi || !followReplay) return
  const s = useAppStore.getState()
  if (s.mode !== 'replay') return
  const count = s.replayIndex + 1
  const from = Math.max(0, count - VIEW_BARS)
  chartApi.timeScale().setVisibleLogicalRange({ from, to: Math.max(count - 1, from + 24) })
}, [chartApi, followReplay])
```

This is the same window math already used in `paint()`'s full-redraw branch
(lines 301-305), reused here rather than duplicated conceptually — it's the
"what does the default replay view look like" calculation.

### `ChartPanel.tsx`: gating the two repaint paths on `followReplay`

**Full redraw** (lines 292-306) — extend the existing `pendingShift`
preserve-range pattern to also cover "user has taken control":

```ts
const pendingShift = useAppStore.getState().pendingRangeShift
const followReplay = useAppStore.getState().followReplay
const preserveRange = pendingShift != null || (mode === 'replay' && !followReplay)
const priorRange = preserveRange ? chart.timeScale().getVisibleLogicalRange() : null
series.setData(visible.map(toBar))
for (const line of strategyIndicatorLines(settings, visible)) {
  indicatorsRef.current.get(line.id)?.setData(line.points.map(toLinePoint))
}
if (pendingShift != null && priorRange) {
  chart.timeScale().setVisibleLogicalRange(shiftedVisibleRange(priorRange, pendingShift))
} else if (mode === 'replay' && !followReplay && priorRange) {
  chart.timeScale().setVisibleLogicalRange(priorRange)
} else {
  const from = Math.max(0, count - VIEW_BARS)
  chart.timeScale().setVisibleLogicalRange({
    from,
    to: Math.max(count - 1, from + 24)
  })
}
useAppStore.setState({ pendingRangeShift: null, busy: false })
```

`pendingRangeShift` is only ever set by `loadOlderCandles` (`useAppStore.ts`
lines ~903-935), itself only triggered in `mode === 'view'`, so the two
preserve-branches never actually overlap in practice — the ordering above
just keeps the existing pagination behavior byte-for-byte unchanged as the
first-checked case.

**Incremental path** (lines 269-278) and the library default — toggle
`shiftVisibleRangeOnNewBar` to track `followReplay`, so the one case that
currently "just works" by accident keeps working under explicit control
instead of by coincidence (e.g. if the user has zoomed out far enough that
the last bar is technically still in view, we still don't want the library
auto-shifting it while `followReplay` is false):

```ts
useEffect(() => {
  chartApi?.timeScale().applyOptions({ shiftVisibleRangeOnNewBar: followReplay })
}, [chartApi, followReplay])
```

### Reading `followReplay` and `isPlaying` in `ChartPanel`

Add alongside the existing store selectors (line 113 area):

```ts
const isPlaying = useAppStore((s) => s.isPlaying)
const followReplay = useAppStore((s) => s.followReplay)
```

## Testing

- Manual: start a replay, click Play, confirm the view snaps to the playhead
  and smoothly scrolls forward with it.
- Manual: while playing, drag the chart back into history — confirm playback
  keeps advancing in the background (candles still updating when you scroll
  back to the playhead) but the view stays wherever you panned it, including
  across trade-signal/indicator updates (which trigger the full-redraw path).
- Manual: pan away, then wait ~4s without touching the chart — confirm the
  view snaps back to the live playhead and resumes following.
- Manual: pan away, then click a step button (±1/±5/±10), Reset, or a
  trade-history row (jump-to-date) — confirm each snaps immediately to its
  target and resumes following (no need to wait out the idle timer).
- Manual: pan away, then pause — confirm the view does *not* snap back while
  paused, even after waiting past the idle timeout. Resume with Play and
  confirm it snaps back at that point.
- Manual: while playing and panned away, change the playback speed — confirm
  the view is *not* yanked back (this exercises `setSpeed`'s internal
  `pause()`+`play()` restart, which must not force `followReplay` back on).
- Manual: zoom out/in (wheel) during playback — confirm it also suspends and
  resumes following the same way panning does.
- `npm run typecheck` passes.
