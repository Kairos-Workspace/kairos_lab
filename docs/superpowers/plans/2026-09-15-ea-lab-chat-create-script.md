# EA Lab Chat — Create a Script When None Is Open — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the EA Lab chat's assistant streams a real EA script while no script is open, create one instead of doing nothing.

**Architecture:** A new synchronous `createDraftScript(name, code)` action on `useEaLabStore` creates and activates a script immediately (fire-and-forget persistence, matching the store's existing `applyCodeToScript` pattern). `EaChatPanel`'s live-apply effect calls it exactly once per exchange, the first time the streamed reply passes the existing `shouldLiveApplyBlock` bar while `writeTargetId.current` is still `null` — from then on the newly created script flows through the same apply/rename/finalize code an edit to an existing script already uses. The system prompt's "ask which script to work on" line is replaced with permission to create one.

**Tech Stack:** React (renderer), Zustand (`useEaLabStore`), Electron IPC (`ipc.ts`'s system prompt only), Vitest.

**Reference:** `docs/superpowers/specs/2026-09-15-ea-lab-chat-create-script-design.md`

---

### Task 1: Add `createDraftScript` to `useEaLabStore`

**Files:**
- Modify: `src/renderer/src/store/useEaLabStore.ts`
- Test: `tests/useEaLabStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `tests/useEaLabStore.test.ts`, right after the existing `describe('selectScript', ...)` block (before its closing `})` for the outer `describe('useEaLabStore', ...)`):

```ts
  describe('createDraftScript', () => {
    it('creates a new active script with the given name and code', () => {
      useEaLabStore.setState({
        scripts: [script('a')],
        activeScriptId: 'a',
        draftCode: '// a',
        dirty: true
      })

      const id = useEaLabStore.getState().createDraftScript('My New EA', '// generated code')

      const state = useEaLabStore.getState()
      expect(state.activeScriptId).toBe(id)
      expect(state.draftCode).toBe('// generated code')
      expect(state.dirty).toBe(false)
      expect(state.scripts.find((s) => s.id === id)).toMatchObject({
        name: 'My New EA',
        code: '// generated code'
      })
      expect(eaScripts.save).toHaveBeenCalledWith(
        expect.objectContaining({ id, name: 'My New EA', code: '// generated code' })
      )
    })

    it('falls back to "Untitled EA" when given a blank name', () => {
      const id = useEaLabStore.getState().createDraftScript('   ', '// code')

      expect(useEaLabStore.getState().scripts.find((s) => s.id === id)?.name).toBe('Untitled EA')
    })

    it('keeps the previously active script in the list alongside the new one', () => {
      useEaLabStore.setState({ scripts: [script('a')], activeScriptId: 'a' })

      const id = useEaLabStore.getState().createDraftScript('New EA', '// code')

      const ids = useEaLabStore.getState().scripts.map((s) => s.id)
      expect(ids).toContain('a')
      expect(ids).toContain(id)
    })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/useEaLabStore.test.ts`
Expected: 3 failures under `createDraftScript`, each with `TypeError: useEaLabStore.getState().createDraftScript is not a function` (or equivalent — `createDraftScript` doesn't exist yet). The pre-existing `applyCodeToScript`/`selectScript` tests must still pass.

- [ ] **Step 3: Add `createDraftScript` to the store**

In `src/renderer/src/store/useEaLabStore.ts`, add to the `EaLabState` interface, directly below `createScript: () => Promise<void>` (line 30):

```ts
  createDraftScript: (name: string, code: string) => string
```

Then add the implementation directly below the existing `createScript` action (after its closing `},` at line 74):

```ts
  createDraftScript: (name, code) => {
    const now = Date.now()
    const script: EaScript = {
      id: newId(),
      name: name.trim() || 'Untitled EA',
      code,
      createdAt: now,
      updatedAt: now
    }
    // Fire-and-forget, like applyCodeToScript: the caller runs inside a
    // requestAnimationFrame callback mid-stream and can't await an IPC
    // round-trip without stalling the live-typing effect.
    eaScriptBridge()
      ?.save(script)
      ?.catch((err) => notifyError(`Failed to create ${script.name}`, err))
    set({ scripts: [script, ...get().scripts], activeScriptId: script.id, draftCode: code, dirty: false })
    return script.id
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/useEaLabStore.test.ts`
Expected: all tests pass, including the 3 new ones and every pre-existing test in the file.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/store/useEaLabStore.ts tests/useEaLabStore.test.ts
git commit -m "Add createDraftScript to useEaLabStore"
```

---

### Task 2: Wire `createDraftScript` into `EaChatPanel`'s live-apply effect

**Files:**
- Modify: `src/renderer/src/components/EaChatPanel.tsx`

No automated test: this repo has no component-test harness (no jsdom/React Testing Library — see the `better-sqlite3-abi-mismatch` and `quantify-lab-test-project-split` project memory notes, and the equivalent effect-ordering changes made earlier in this project's chat work, all verified the same way). Verify via typecheck, production build, and the manual check in Task 4.

- [ ] **Step 1: Read the store's new action**

Find this line (around line 96):

```ts
  const applyCodeToScript = useEaLabStore((s) => s.applyCodeToScript)
```

Add directly below it:

```ts
  const createDraftScript = useEaLabStore((s) => s.createDraftScript)
```

- [ ] **Step 2: Rewrite the live-apply effect**

Find this effect (currently lines 188–212):

```ts
  useEffect(() => {
    if (!sending || !streamText) return
    const target = writeTargetId.current
    if (!target) return
    const frame = requestAnimationFrame(() => {
      // Reuses the block already parsed once per chunk in the store instead
      // of re-scanning the whole accumulated reply here, and only live-writes
      // once it's an actual EA rewrite — a short conversational snippet must
      // never overwrite the script that's open in the editor.
      const block = streamBlock
      if (block && shouldLiveApplyBlock(block.content) && useEaLabStore.getState().activeScriptId === target) {
        applyCodeToScript(target, block.content)
      }
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
  }, [sending, streamText, streamBlock, applyCodeToScript, renameScript])
```

Replace it with:

```ts
  useEffect(() => {
    if (!sending || !streamText) return
    const frame = requestAnimationFrame(() => {
      // Reuses the block already parsed once per chunk in the store instead
      // of re-scanning the whole accumulated reply here, and only live-writes
      // once it's an actual EA rewrite — a short conversational snippet must
      // never overwrite the script that's open in the editor (or spuriously
      // create a new one).
      const block = streamBlock
      if (block && shouldLiveApplyBlock(block.content)) {
        if (writeTargetId.current === null) {
          // Nothing was open when this exchange started — this is the first
          // sign the reply is a real script, so create one now instead of
          // discarding the reply the way this path always used to.
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

Note the top-level `const target = writeTargetId.current; if (!target) return` that used to run *before* `requestAnimationFrame` was scheduled is gone — it has to be, since the effect now needs to inspect `streamBlock` inside the frame callback before it can know whether there's anything to create. The rename-detection code below it is otherwise unchanged, just reading `writeTargetId.current` (via the `target` const declared after the creation branch) instead of a stale pre-frame value.

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/EaChatPanel.tsx
git commit -m "Create a new script from EA Lab chat when none is open"
```

---

### Task 3: Update the system prompt

**Files:**
- Modify: `src/main/ipc.ts`

- [ ] **Step 1: Replace the "no file attached" prompt line**

Find (around line 363–366):

```ts
        attached.length > 0
          ? 'The user attached these files. Edit the one marked currently editing unless they ask otherwise.'
          : 'No file is attached. Ask which script to work on if you need one.',
```

Replace with:

```ts
        attached.length > 0
          ? 'The user attached these files. Edit the one marked currently editing unless they ask otherwise.'
          : 'No file is attached — if the user wants a new EA, just create one; use the naming directive below with a real name up front, not Untitled EA.',
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc.ts
git commit -m "Tell the chat assistant it can create a new EA when none is attached"
```

---

### Task 4: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: every test file passes, total test count includes the 3 new `createDraftScript` tests added in Task 1.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no output (clean).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds (`✓ built in ...`).

- [ ] **Step 4: Manual smoke test**

This step needs a running Electron app with at least one configured AI provider — do it if you have that available; otherwise hand it back to the user to confirm.

1. Launch the app (`npm run dev`), open EA Lab.
2. Delete every existing script (or start from a fresh profile) so the sidebar is empty and the editor shows no active script.
3. Open the chat panel and ask for something concrete, e.g. "write an EA that closes all trades at 5pm server time."
4. Confirm: a new entry appears in the script sidebar shortly after the reply starts streaming real code (not immediately on send), the editor fills in live with the generated code, and the script's name reflects what the assistant named it (not stuck on "Untitled EA" if the assistant supplied a better name).
5. Ask a purely conversational follow-up with nothing open (delete the script again first) — e.g. "what does OnTimer do?" — and confirm no script gets created for a reply with no code in it.

- [ ] **Step 5: Report**

Summarize to the user: tests passing, typecheck clean, build succeeds, and the result of the manual smoke test (or that it still needs to be run if no Electron/provider access was available).
