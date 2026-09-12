# Replay Follow Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Playback should snap the chart to the playing candle and keep following it, but panning/zooming the chart during playback should suspend that following so the user can look around freely — resuming automatically after a short idle period, or immediately on the next explicit navigation action (Play, step, reset, jump-to-date).

**Architecture:** A new `followReplay` boolean on the Zustand store (`useAppStore.ts`) is the single source of truth for whether the chart should be auto-recentered. `ChartPanel.tsx` listens for raw pointer/wheel activity on the chart's own DOM host to detect free-form user navigation (turning `followReplay` off and arming a 4s idle timer), while every explicit "go to X" store action (`startReplay`, `jumpToDate`, `togglePlay`→`play`, and a new `manualStep` wrapping the step buttons/keyboard shortcuts) forces it back on. The chart's existing full-redraw recenter logic and the `shiftVisibleRangeOnNewBar` timeScale option both key off this one flag.

**Tech Stack:** Electron + Zustand (renderer store), `lightweight-charts` v5 (chart), Vitest (existing test suite covers `@core`/`@shared` only — no store or component test harness exists in this codebase; see Task 5's note).

**Design doc:** `docs/superpowers/specs/2026-09-12-replay-follow-mode-design.md`

---

### Task 1: `followReplay` state + actions in the store

**Files:**
- Modify: `src/renderer/src/store/useAppStore.ts`

No test file for this task — this codebase doesn't unit-test `useAppStore.ts` (no existing test imports it; it depends on Electron preload bridges that aren't mocked anywhere), matching how `tests/replay.test.ts` only tests the pure `ReplayEngine` class rather than the store actions built on top of it. `npm run typecheck` plus Task 5's manual walkthrough are this feature's verification, consistent with the existing `2026-09-11-chart-lazy-loading.md` plan's Task 3/4 precedent.

- [ ] **Step 1: Add the `followReplay` field to `AppState`**

In `src/renderer/src/store/useAppStore.ts`, find this line in the `AppState` interface:

```ts
  isPlaying: boolean
```

Replace it with:

```ts
  isPlaying: boolean
  followReplay: boolean
```

- [ ] **Step 2: Add the two new action signatures**

Find this line in the `AppState` interface's method list:

```ts
  togglePlay: () => void
```

Replace it with:

```ts
  togglePlay: () => void
  setFollowReplay: (follow: boolean) => void
  manualStep: (n: number) => void
```

- [ ] **Step 3: Add the default value**

Find this line in the store's initial state object:

```ts
  isPlaying: false,
```

Replace it with:

```ts
  isPlaying: false,
  followReplay: true,
```

- [ ] **Step 4: Force `followReplay: true` in `startReplay`**

Find this block (the `set({...})` inside `startReplay`):

```ts
    set({
      mode: 'replay',
      replayIndex: index,
      replayFromTs: fromTs ?? s.replayFromTs,
      replayToTs: toTs ?? s.replayToTs,
      hideDate: Boolean(opts?.hideDate),
      isPlaying: false,
      pendingSetup: null,
      draft: null,
      activeTrade: null,
      trades: [],
      skipped: [],
      account: createAccount(s.account.initialBalance, s.account.riskPerTrade),
      sessionId: newId(),
      selectedTradeId: null,
      status: opts?.random
        ? 'Random replay armed. Press play.'
        : `Replay ${fromLabel} → ${toLabel}`
    })
```

Replace it with:

```ts
    set({
      mode: 'replay',
      replayIndex: index,
      replayFromTs: fromTs ?? s.replayFromTs,
      replayToTs: toTs ?? s.replayToTs,
      hideDate: Boolean(opts?.hideDate),
      isPlaying: false,
      followReplay: true,
      pendingSetup: null,
      draft: null,
      activeTrade: null,
      trades: [],
      skipped: [],
      account: createAccount(s.account.initialBalance, s.account.riskPerTrade),
      sessionId: newId(),
      selectedTradeId: null,
      status: opts?.random
        ? 'Random replay armed. Press play.'
        : `Replay ${fromLabel} → ${toLabel}`
    })
```

(`resetReplay` calls `startReplay(...)` internally, so it inherits this for free — no separate change needed there.)

- [ ] **Step 5: Force `followReplay: true` in `togglePlay` when starting playback**

Find:

```ts
  togglePlay: () => {
    if (get().isPlaying) get().pause()
    else get().play()
  },
```

Replace it with:

```ts
  togglePlay: () => {
    if (get().isPlaying) get().pause()
    else {
      set({ followReplay: true })
      get().play()
    }
  },
```

`play()` itself is deliberately left unmodified — `setSpeed` (`set({ speed }); ...; get().pause(); get().play()`) restarts the autoplay loop internally on every speed change while already playing, and that restart must not force the view back to the playhead if the user had panned away mid-session.

- [ ] **Step 6: Force `followReplay: true` in `jumpToDate`**

Find:

```ts
  jumpToDate: (timestamp) => {
    const s = get()
    const index = ReplayEngine.mapTimestampToIndex(s.displayCandles, timestamp)
    if (s.mode === 'replay') set({ replayIndex: index, isPlaying: false })
    else set({ selectedTradeId: get().selectedTradeId })
  },
```

Replace it with:

```ts
  jumpToDate: (timestamp) => {
    const s = get()
    const index = ReplayEngine.mapTimestampToIndex(s.displayCandles, timestamp)
    if (s.mode === 'replay') set({ replayIndex: index, isPlaying: false, followReplay: true })
    else set({ selectedTradeId: get().selectedTradeId })
  },
```

- [ ] **Step 7: Add `setFollowReplay` and `manualStep`**

Find the `resetReplay` action:

```ts
  resetReplay: () => {
    const s = get()
    get().startReplay({
      hideDate: s.hideDate,
      fromTs: s.replayFromTs ?? undefined,
      toTs: s.replayToTs ?? undefined
    })
  },
```

Immediately after its closing `},`, add:

```ts
  setFollowReplay: (follow) => set({ followReplay: follow }),

  manualStep: (n) => {
    set({ followReplay: true })
    get().step(n)
  },
```

`manualStep` exists because `step()` is called both by user controls (which should always snap back to following) and, once per tick, by the autoplay RAF loop inside `play()` (which must never force `followReplay` back on mid-tick, or panning away during smooth playback would be undone on the very next frame). Since both callers use the identical `step(n)` signature, the distinction has to live at the call site — `manualStep` is that distinct call site for user-facing controls, wired up in Task 2.

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: no errors (exits 0).

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/store/useAppStore.ts
git commit -m "$(cat <<'EOF'
Add followReplay flag and manualStep to the replay store

followReplay tracks whether the chart should auto-follow the replay
playhead. startReplay, jumpToDate, and togglePlay's play-transition
force it back on; manualStep is a new wrapper for user-facing step
controls so they resume following without touching the autoplay
loop's own per-tick step(1) calls. Nothing reads followReplay yet.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Wire user-facing step controls to `manualStep`

**Files:**
- Modify: `src/renderer/src/components/ReplayControls.tsx`
- Modify: `src/renderer/src/hooks/useKeyboard.ts`

- [ ] **Step 1: Switch `ReplayControls.tsx` to `manualStep`**

Find:

```ts
  const togglePlay = useAppStore((s) => s.togglePlay)
  const step = useAppStore((s) => s.step)
  const resetReplay = useAppStore((s) => s.resetReplay)
```

Replace it with:

```ts
  const togglePlay = useAppStore((s) => s.togglePlay)
  const step = useAppStore((s) => s.manualStep)
  const resetReplay = useAppStore((s) => s.resetReplay)
```

(The buttons below already call the local `step` variable — `step(-1)`, `step(1)`, `step(5)`, `step(10)` — so rebinding what `step` points to is all that's needed; no other lines in this file change.)

- [ ] **Step 2: Switch `useKeyboard.ts`'s arrow-key shortcuts to `manualStep`**

Find:

```ts
        case 'ArrowRight':
          store.step(event.shiftKey ? 10 : 1)
          break
        case 'ArrowLeft':
          store.step(event.shiftKey ? -10 : -1)
          break
```

Replace it with:

```ts
        case 'ArrowRight':
          store.manualStep(event.shiftKey ? 10 : 1)
          break
        case 'ArrowLeft':
          store.manualStep(event.shiftKey ? -10 : -1)
          break
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ReplayControls.tsx src/renderer/src/hooks/useKeyboard.ts
git commit -m "$(cat <<'EOF'
Route step buttons and arrow-key shortcuts through manualStep

These are the user-facing "jump to a specific candle" controls, as
opposed to the autoplay loop's internal per-tick step(1) call, so
they should resume replay follow mode. Chart still doesn't read
followReplay yet — next.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Detect user chart interaction and auto-resume following after idle

**Files:**
- Modify: `src/renderer/src/components/ChartPanel.tsx`

- [ ] **Step 1: Add the idle-timeout constant**

Find:

```ts
const VIEW_BARS = 160
const LOAD_MORE_THRESHOLD = 200
```

Replace it with:

```ts
const VIEW_BARS = 160
const LOAD_MORE_THRESHOLD = 200
const FOLLOW_RESUME_MS = 4000
```

- [ ] **Step 2: Read `isPlaying` and `followReplay` from the store**

Find:

```ts
  const mode = useAppStore((s) => s.mode)
  const draft = useAppStore((s) => s.draft)
```

Replace it with:

```ts
  const mode = useAppStore((s) => s.mode)
  const isPlaying = useAppStore((s) => s.isPlaying)
  const followReplay = useAppStore((s) => s.followReplay)
  const draft = useAppStore((s) => s.draft)
```

- [ ] **Step 3: Add an idle-timer ref**

Find:

```ts
  const paintTokenRef = useRef(0)
```

Replace it with:

```ts
  const paintTokenRef = useRef(0)
  const followIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

- [ ] **Step 4: Add the pointer/wheel interaction listener**

Find this effect (the pagination scroll-back subscription added in the chart-lazy-loading work):

```ts
  useEffect(() => {
    if (!chartApi) return
    const scale = chartApi.timeScale()
    const onRangeChange = (range: { from: number; to: number } | null): void => {
      if (useAppStore.getState().mode !== 'view') return
      if (!shouldLoadOlder(range, LOAD_MORE_THRESHOLD)) return
      void useAppStore.getState().loadOlderCandles()
    }
    scale.subscribeVisibleLogicalRangeChange(onRangeChange)
    return () => scale.unsubscribeVisibleLogicalRangeChange(onRangeChange)
  }, [chartApi])
```

Immediately after its closing `}, [chartApi])`, add a new effect:

```ts

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const onInteract = (): void => {
      const s = useAppStore.getState()
      if (s.mode !== 'replay' || !s.isPlaying) return
      if (s.followReplay) s.setFollowReplay(false)
      if (followIdleTimerRef.current) clearTimeout(followIdleTimerRef.current)
      followIdleTimerRef.current = setTimeout(() => {
        if (useAppStore.getState().isPlaying) useAppStore.getState().setFollowReplay(true)
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

This reads `mode`/`isPlaying`/`followReplay` via `useAppStore.getState()` (not the component's reactive selectors) precisely so the listener never needs to be torn down and re-attached as those values change — it's registered once and always checks current state at interaction time.

- [ ] **Step 5: Clear the idle timer as soon as playback pauses**

Immediately after the effect added in Step 4, add:

```ts

  useEffect(() => {
    if (isPlaying) return
    if (followIdleTimerRef.current) {
      clearTimeout(followIdleTimerRef.current)
      followIdleTimerRef.current = null
    }
  }, [isPlaying])
```

Without this, a timer armed just before the user hits Pause could still fire a few seconds later and (harmlessly, since `paint()` isn't gated on `followReplay` yet — but wire it correctly now) flip `followReplay` back on while the user is deliberately paused and looking around.

- [ ] **Step 6: Snap the view back the instant follow resumes**

Immediately after the effect added in Step 5, add:

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

Keyed only on `[chartApi, followReplay]` (not `replayIndex`) so it fires once per false→true transition and does nothing on ordinary ticks while already following — those are handled by the existing incremental/full-redraw paint pipeline (Task 4 wires the full-redraw side of that up properly).

- [ ] **Step 7: Toggle the library's own auto-shift to match `followReplay`**

Immediately after the effect added in Step 6, add:

```ts

  useEffect(() => {
    chartApi?.timeScale().applyOptions({ shiftVisibleRangeOnNewBar: followReplay })
  }, [chartApi, followReplay])
```

This keeps the single-step incremental autoplay path (which never calls `setVisibleLogicalRange` explicitly — see Task 4's description) from drifting the view forward on its own if the user has zoomed out far enough that the last bar happens to still be technically visible while `followReplay` is false.

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/components/ChartPanel.tsx
git commit -m "$(cat <<'EOF'
Detect chart interaction during replay and auto-resume following

Any pointerdown/wheel on the chart while replay is playing suspends
followReplay and arms a 4s idle timer that turns it back on; pausing
cancels that timer so a paused, panned-away view never gets yanked
back. Follow resuming re-centers the view immediately and toggles
the chart's own shiftVisibleRangeOnNewBar to match. The full-redraw
recenter in paint() isn't gated on followReplay yet — next task.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Stop the full-redraw repaint from overriding a free-navigated view

**Files:**
- Modify: `src/renderer/src/components/ChartPanel.tsx`

- [ ] **Step 1: Gate the recenter on `followReplay`**

Find this block inside the `paint` function's full-redraw branch:

```ts
          const pendingShift = useAppStore.getState().pendingRangeShift
          const priorRange = pendingShift != null ? chart.timeScale().getVisibleLogicalRange() : null
          series.setData(visible.map(toBar))
          for (const line of strategyIndicatorLines(settings, visible)) {
            indicatorsRef.current.get(line.id)?.setData(line.points.map(toLinePoint))
          }
          if (pendingShift != null && priorRange) {
            chart.timeScale().setVisibleLogicalRange(shiftedVisibleRange(priorRange, pendingShift))
          } else {
            const from = Math.max(0, count - VIEW_BARS)
            chart.timeScale().setVisibleLogicalRange({
              from,
              to: Math.max(count - 1, from + 24)
            })
          }
          useAppStore.setState({ pendingRangeShift: null, busy: false })
```

(Note: if your checkout's "else" branch computes `to`/`from` slightly differently than shown, a concurrent change landed on this file after this plan was written — keep whatever that branch already does; only the new middle branch below matters.)

Replace it with:

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

`mode` is already in scope here — it's the `paint(displayCandles, mode, replayIndex, settings)` parameter. `pendingRangeShift` is only ever set by `loadOlderCandles`, which only runs in `mode === 'view'`, so the two preserve-branches never actually overlap; the pagination check stays first purely so that existing behavior is untouched byte-for-byte.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ChartPanel.tsx
git commit -m "$(cat <<'EOF'
Preserve the user's pan/zoom across replay's full-redraw repaint

Full redraws (step ±5/±10, backward stepping, overlay/indicator
changes, chart remounts) previously always recentered on the
playhead, undoing any manual panning within one repaint. Now they
preserve the current visible range whenever followReplay is off,
matching the shift-preserving behavior pagination already relies on.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all existing tests pass (this feature has no dedicated automated tests — see Task 1's note — so this just confirms nothing else broke).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: `electron-vite build` completes with no errors.

- [ ] **Step 4: Manual end-to-end pass**

Run: `npm run dev` and walk through, in order (matches the design doc's Testing section):

1. Start a replay, click Play — the view snaps to the playhead and scrolls forward smoothly with it.
2. While playing, drag the chart back into history — playback keeps advancing (status/candle count still updating), but the view stays put, including across any trade-signal or indicator update in the meantime.
3. Stop touching the chart for ~4 seconds — the view snaps back to the live playhead and resumes following.
4. Pan away again, then click a step button (±1/±5/±10) or Reset — the view snaps to the new target immediately, no need to wait out the idle timer.
5. Pan away, then click Pause — wait past 4 seconds — confirm the view does **not** snap back while paused. Click Play again — confirm it snaps back at that point.
6. While playing and panned away, change the playback speed — confirm the view is **not** yanked back (exercises `setSpeed`'s internal pause+play restart).
7. Zoom with the mouse wheel during playback — confirm it also suspends and resumes following the same way panning does.
8. Click a trade in the trade history to jump to it (`jumpToDate`) while panned away — confirm it snaps to that trade's candle immediately.

Stop the dev server (`Ctrl-C`) when done.

- [ ] **Step 5: Report**

No commit needed for this task (verification only) unless Step 4 surfaces a bug — if it does, fix it, re-run the relevant checks above, and commit the fix with a description of what was wrong.
