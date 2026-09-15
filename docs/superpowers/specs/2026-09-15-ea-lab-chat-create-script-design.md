# EA Lab AI Chat — create a script when none is open

## Context

The EA Lab chat (`docs/superpowers/specs/2026-09-14-ea-lab-ai-chat-design.md`)
can only ever write into whichever script is already the *active* one in the
editor. The write target is captured once, client-side, when a message starts
sending:

```ts
// EaChatPanel.tsx
if (sending && writeTargetId.current === null && activeScriptId) {
  writeTargetId.current = activeScriptId
}
```

`activeScriptId` is only ever `null` when the user has zero scripts — every
other code path (`loadScripts`, `createScript`, `selectScript`) keeps it
pointed at a real script the moment one exists. When it's `null`, the guard
above never fires, `writeTargetId.current` stays `null` for the whole
exchange, and the live-apply / rename / finalize effects all bail out via
their own `if (!target) return` checks. The system prompt reflects this
today: *"No file is attached. Ask which script to work on if you need one."*
So a brand-new EA Lab session (or one where every script was deleted) can chat
but never gets a script out of it — the user has to click "+" and create a
blank one manually first.

This closes that gap: when nothing is open and the assistant's reply turns
into a real EA script, EA Lab creates the script itself instead of asking.

## Goals

- If `activeScriptId` is `null` when the assistant's streamed reply becomes a
  genuine EA script (the same `shouldLiveApplyBlock` bar used for editing
  today), create a new script and adopt it as the write target — from that
  point on it streams in exactly like an edit to an existing script.
- The system prompt stops telling the model to ask which file to work on;
  it's told it can just create one.
- No user-visible difference for every case that already works today (a
  script is open, one or more files are attached) — this only fills the
  previously-dead "nothing open" path.

## Non-goals

- Multiple new files from one reply (e.g. an EA plus a separate include
  file). Explicitly out of scope for this pass — `streamBlock` tracks a
  single latest code block today, and that doesn't change here.
- Any new directive syntax. The existing `<!--ql-file:-->` marker (already
  used for renaming) is reused as-is for naming a freshly created script;
  nothing new is added for the model to learn.
- Changing how the *editing* path works when a script already is open —
  untouched.

## Design

### Trigger condition

`writeTargetId.current === null` at the moment `shouldLiveApplyBlock` first
passes for the current reply. This is checked inside the existing live-apply
effect, so it's evaluated on the same per-frame cadence as everything else
that effect already does.

### Store: `createDraftScript`

New synchronous action on `useEaLabStore`, next to `createScript`:

```ts
createDraftScript: (name: string, code: string) => string {
  const now = Date.now()
  const script: EaScript = {
    id: newId(),
    name: name.trim() || 'Untitled EA',
    code,
    createdAt: now,
    updatedAt: now
  }
  eaScriptBridge()
    ?.save(script)
    ?.catch((err) => notifyError(`Failed to create ${script.name}`, err))
  set({ scripts: [script, ...get().scripts], activeScriptId: script.id, draftCode: code, dirty: false })
  return script.id
}
```

Differences from `createScript()` (the existing "+" button action) are
deliberate: it takes the name and starting code as arguments instead of
always using `STARTER_TEMPLATE` and `'Untitled EA'`, and it persists
fire-and-forget (matching `applyCodeToScript`'s existing pattern) instead of
awaiting the save — the caller is inside a `requestAnimationFrame` callback
mid-stream and shouldn't stall on an IPC round-trip. `dirty: false` because
the code just passed to it is the code that's about to be saved; any further
streamed content lands through the normal `applyCodeToScript` path on the
next frame, which sets `dirty: true` and follows the existing autosave/
finalize-save rules exactly as it does for an edit.

### `EaChatPanel`'s live-apply effect

The effect currently bails out *before scheduling its animation frame* when
there's no target yet:

```ts
useEffect(() => {
  if (!sending || !streamText) return
  const target = writeTargetId.current
  if (!target) return                          // <-- runs every frame while nothing's open
  const frame = requestAnimationFrame(() => {
    const block = streamBlock
    if (block && shouldLiveApplyBlock(block.content) && useEaLabStore.getState().activeScriptId === target) {
      applyCodeToScript(target, block.content)
    }
    const nextName = extractScriptName(streamText, block)
    // ...rename detection using `target`...
  })
  return () => cancelAnimationFrame(frame)
}, [sending, streamText, streamBlock, applyCodeToScript, renameScript])
```

That early return has to move: creation only has anything to decide once a
frame actually runs and inspects `streamBlock`. New shape:

```ts
useEffect(() => {
  if (!sending || !streamText) return
  const frame = requestAnimationFrame(() => {
    const block = streamBlock
    if (block && shouldLiveApplyBlock(block.content)) {
      if (writeTargetId.current === null) {
        const name = extractScriptName(streamText, block) ?? 'Untitled EA'
        writeTargetId.current = createDraftScript(name, block.content)
        lastRenamed.current = name === 'Untitled EA' ? null : name
      } else if (useEaLabStore.getState().activeScriptId === writeTargetId.current) {
        applyCodeToScript(writeTargetId.current, block.content)
      }
    }
    const target = writeTargetId.current
    if (!target) return
    const nextName = extractScriptName(streamText, block)
    if (!nextName || lastRenamed.current === nextName) return
    const currentName = useEaLabStore.getState().scripts.find((s) => s.id === target)?.name
    if (currentName === nextName) {
      lastRenamed.current = nextName
      return
    }
    lastRenamed.current = nextName
    void renameScript(target, nextName)
  })
  return () => cancelAnimationFrame(frame)
}, [sending, streamText, streamBlock, applyCodeToScript, renameScript, createDraftScript])
```

The rename-detection logic (previously reading the outer `target` const) now
reads `writeTargetId.current` fresh, *after* the creation branch may have set
it — that's the only reason it moves inside the callback instead of staying
where it was. The end-of-stream finalize effect is untouched: it already
just reads `writeTargetId.current` whenever streaming ends, whatever value
that turns out to be.

`lastRenamed.current` is seeded to the parsed name (when there is one) so the
rename-detection code doesn't immediately fire a redundant `renameScript`
call for the name the script was just created with.

One behavior change from moving the guard: while nothing is open, this
effect now schedules an animation frame on every chunk instead of bailing
out synchronously before scheduling one. Negligible in practice — it's a
few frames at most, only until the first script gets created — but worth
naming since it's a real (if tiny) change to when work happens, not just
what.

### System prompt

Replace:

> No file is attached. Ask which script to work on if you need one.

with:

> No file is attached — if the user wants a new EA, just create one; use the
> naming directive below with a real name up front, not "Untitled EA".

The rest of the naming instructions (the `<!--ql-file:-->` line, Title Case,
no path/extension) are already provider-agnostic and apply unchanged.

## Edge cases

- **Purely conversational reply, nothing open.** `shouldLiveApplyBlock` never
  passes, so `createDraftScript` never runs. No script is created for a
  reply that never contains real code — this is the reason creation is
  lazy rather than immediate-on-send.
- **Assistant never emits the naming directive.** Falls back to `'Untitled
  EA'`, identical to what the "+" button already produces; the existing
  rename-detection effect fixes the name the moment the directive does show
  up, same as it already does for edits.
- **User deletes the script mid-stream, after it was created.** Already
  handled by existing code: `applyCodeToScript`'s "target no longer exists"
  branch no-ops (fixed earlier this project), and `cancelPendingWrite` /
  the thread-navigation guards are unrelated to this path.
- **Two scripts somehow both get created from one reply.** Can't happen —
  after the first `createDraftScript` call, `writeTargetId.current` is no
  longer `null`, so every subsequent frame takes the `applyCodeToScript`
  branch instead.

## Verification

- `createDraftScript` is a pure store action (mocked `eaScriptBridge`, no
  Electron/DB dependency) — unit tested the same way `applyCodeToScript` and
  `selectScript` already are in `tests/useEaLabStore.test.ts`.
- The `EaChatPanel` wiring has no test harness in this repo (no jsdom/React
  Testing Library — see the `better-sqlite3-abi-mismatch` and
  `quantify-lab-test-project-split` project notes for why the main-process
  side is similarly untested); verified via `tsc -b`, `npm run build`, and
  manual reasoning about effect ordering, consistent with how the other
  `EaChatPanel` effect changes this project were verified.
- Manual smoke test once implemented: delete every script, ask the chat for
  an EA, confirm a new entry appears in the sidebar and fills in live.
