# EA Development Lab — Sub-project A: Editor + Storage

## Context

This is the first of three sub-projects building toward a full "EA Development
Lab" where users write Expert Advisors and run/test them directly in the app:

- **A (this spec):** the Lab screen itself — an editor and storage for EA
  scripts. No execution.
- **B (later):** an MQL5-inspired DSL and interpreter, since real MQL5 only
  compiles/runs inside MetaTrader 5 (Windows-native, proprietary, no public
  compiler) — confirmed infeasible to embed. The user chose to build our own
  MQL5-*inspired* language that runs on our own engine instead of shelling out
  to a real MT5 install or building an editor-only, export-to-MT5 tool.
- **C (later):** wiring a parsed EA into the app's existing replay/trade
  simulation engine so "run and test" actually produces results.

This spec covers **A only**. It replaces the inert "EA Development Lab" card
on the Welcome screen (added in a prior change, `data-disabled="true"`, no
click handler) with a real, navigable screen.

## Goals

- A fourth top-level screen, `'ea-lab'`, reachable from Welcome's EA
  Development Lab card, with its own way back to Welcome.
- Users can create, rename, edit, save, and delete named EA scripts (plain
  text for now — no execution).
- A real code-editor feel (Monaco) with MQL5-style syntax highlighting.
- Scripts persist in the same SQLite database the rest of the app already
  uses, following the exact pattern already established for saved strategies.

## Non-goals

- No parsing, compilation, or execution of the script content — it's just
  named text at this stage (sub-project B/C).
- No "Run backtest" button or any execution-shaped UI — adding a
  visibly-disabled action for a feature two sub-projects away would be
  confusing clutter, not a helpful preview.
- No IntelliSense/autocomplete/language server — just Monarch-based syntax
  highlighting (keywords, types, strings, comments). Real semantic features
  need the language definition from sub-project B first.

## Design

### Data model & persistence

New SQLite table, mirroring the existing `strategies` table exactly
(`src/main/database/schema.ts`):

```sql
CREATE TABLE IF NOT EXISTS ea_scripts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

Repository functions in `src/main/database/repositories.ts`, mirroring
`listStrategies`/`saveStrategy`/`deleteStrategy` (lines 364-410) exactly in
shape: `listEaScripts()` (no seed-row cleanup needed, unlike strategies),
`saveEaScript()` (upsert via `ON CONFLICT(id) DO UPDATE`), `deleteEaScript()`.

Shared type in `src/shared/types.ts`, mirroring `SavedStrategy` (lines
167-174):

```ts
export interface EaScript {
  id: string
  name: string
  code: string
  createdAt: number
  updatedAt: number
}
```

### IPC

New channel constants in `src/shared/ipc.ts`, alongside the existing
`STRATEGIES_*` block:

```ts
EA_SCRIPTS_LIST: 'ea-scripts:list',
EA_SCRIPTS_SAVE: 'ea-scripts:save',
EA_SCRIPTS_DELETE: 'ea-scripts:delete',
```

Handlers in `src/main/ipc.ts`, mirroring the `STRATEGIES_*` handlers
(lines 218-228) exactly:

```ts
handle(IPC.EA_SCRIPTS_LIST, () => listEaScripts())

handle(IPC.EA_SCRIPTS_SAVE, (_e, script: EaScript) => {
  saveEaScript(script)
  return listEaScripts()
})

handle(IPC.EA_SCRIPTS_DELETE, (_e, id: string) => {
  deleteEaScript(id)
  return listEaScripts()
})
```

Preload namespace in `src/preload/index.ts`, mirroring `strategies`
(lines 66-72):

```ts
eaScripts: {
  list: () => ipcRenderer.invoke(IPC.EA_SCRIPTS_LIST) as Promise<EaScript[]>,
  save: (script: EaScript) =>
    ipcRenderer.invoke(IPC.EA_SCRIPTS_SAVE, script) as Promise<EaScript[]>,
  delete: (id: string) =>
    ipcRenderer.invoke(IPC.EA_SCRIPTS_DELETE, id) as Promise<EaScript[]>
}
```

`Window.quantify`'s type updates automatically (`QuantifyApi = typeof api`
in preload — no separate `.d.ts` edit needed).

### State: a new dedicated store

A new `src/renderer/src/store/useEaLabStore.ts` (Zustand), **not** an
addition to `useAppStore.ts`. `useAppStore.ts` is already 1300+ lines
covering every other screen's state; the EA Lab is a genuinely separate
concern (its own screen, its own data domain) with no cross-dependencies on
the rest of the app's state, so it gets its own store rather than growing the
existing one further. This mirrors the file-size judgment call already made
for `Welcome.tsx`/`WelcomeChartBackdrop.tsx` earlier in this project.

```ts
interface EaLabState {
  scripts: EaScript[]
  activeScriptId: string | null
  draftCode: string
  dirty: boolean
  loadScripts: () => Promise<void>
  createScript: () => Promise<void>
  selectScript: (id: string) => void
  updateDraftCode: (code: string) => void
  saveActiveScript: () => Promise<void>
  renameScript: (id: string, name: string) => Promise<void>
  deleteScript: (id: string) => Promise<void>
}
```

`draftCode`/`dirty` track in-progress edits to the currently open script
separately from the persisted `scripts` list, so Monaco's `onChange` doesn't
trigger a save on every keystroke — saving is an explicit action.

### Navigation

- `src/renderer/src/store/useAppStore.ts`: `AppScreen` widens to
  `'welcome' | 'library' | 'workspace' | 'ea-lab'`. Two new actions,
  matching the existing `enterLibrary`/`goHome` pattern exactly (pure screen
  flips, no side effects): `enterEaLab: () => set({ screen: 'ea-lab' })`.
  (`goHome` already exists and is reused as-is for the way back.)
- `src/renderer/src/App.tsx`: the screen switch gains a fourth branch for
  `'ea-lab'`, rendering a new `EaLab` component.
- `src/renderer/src/components/Welcome.tsx`: the EA Development Lab card
  changes from a non-interactive `<div>` to a real `<button>`, calling
  `enterEaLab()`, styled identically to the Strategy Lab card (drop
  `data-disabled`/the "Coming soon" label — it's not a placeholder anymore).

### The `EaLab` screen

New file `src/renderer/src/components/EaLab.tsx`, structured like
`StrategyLibrary.tsx`'s topbar (brand + Home button + theme toggle) but with
a two-pane body instead of a card grid:

- **Sidebar** (left): list of saved scripts (name + relative last-modified
  time), a "New script" button, and per-item rename/delete affordances
  (reusing `ConfirmIconButton` for delete, same pattern as strategy cards).
- **Editor** (right): Monaco (`@monaco-editor/react`), bound to `draftCode`,
  filling the remaining space. A "Save" button (disabled when `!dirty`).

New script starter template (matches real MQL5 EA structure, even though
nothing interprets it yet — sets up sub-project B for zero rework):

```
void OnInit()
{
}

void OnTick()
{
}
```

### Syntax highlighting

A custom Monaco language registration (`monaco.languages.register` +
`setMonarchTokensProvider`) for a subset of MQL5-like tokens: keywords
(`if`, `else`, `for`, `while`, `return`, `void`, `true`, `false`, etc.),
built-in types (`int`, `double`, `string`, `bool`, `datetime`, `bool`,
`color`), the lifecycle function names (`OnInit`, `OnTick`, `OnDeinit`),
strings, numbers, and comments (`//`, `/* */`). This is presentation only —
it doesn't validate or understand the code, just colors it. Lives in its own
small file, `src/renderer/src/lib/mql5Language.ts`, so `EaLab.tsx` stays
focused on layout/composition.

### CSS

`.app[data-frame='ea-lab']` joins the existing shared 2-row grid variant
(`.app[data-frame='full'], .app[data-frame='library']` →
`.app[data-frame='full'], .app[data-frame='library'], .app[data-frame='ea-lab']`)
since this screen has a topbar and content, no bottom panel — no new grid
rule needed beyond adding the selector.

New layout classes for the two-pane body (`.ea-lab-body`,
`.ea-lab-sidebar`, `.ea-lab-editor`), styled consistently with existing
tokens (`--rule`, `--vault`, `--radius-lg`, etc.) — no new color tokens.

## Edge cases

- **Empty state:** no scripts yet → sidebar shows an empty-state message +
  the "New script" button, same pattern as `StrategyLibrary`'s
  "No strategies yet" state.
- **Unsaved changes:** switching to a different script in the sidebar while
  `dirty` is true — for this sub-project, switching just discards the
  unsaved draft (matches the simplicity of the rest of the app's editing
  patterns, e.g. the strategy composer modal has no unsaved-changes guard
  either). No auto-save, no confirmation dialog — kept simple deliberately;
  can be revisited later if it proves annoying in practice.
- **Deleting the active script:** falls back to selecting the next script in
  the list, or a blank/no-selection state if none remain.

## Risks / things to watch during implementation

- **Monaco + electron-vite bundling.** Monaco typically needs its web
  workers bundled correctly; `electron-vite`'s Vite-based renderer build may
  need extra configuration (e.g. `vite-plugin-monaco-editor`) for this to
  actually work at runtime, not just typecheck. This must be verified with a
  real running build (via the `run` skill), not just `npm run typecheck` —
  a broken worker setup can look fine in source but fail silently or show a
  blank editor at runtime.

## Verification

Same constraint as the rest of this app: no component-test harness exists.
Verify manually (via the `run` skill, in an isolated data directory so this
never touches real user data): navigate to EA Lab from Welcome, create a
script, confirm the template loads, edit it, save, confirm it persists
across a re-launch (relaunch the isolated instance and confirm the script
and its content survive), rename it, delete it, confirm Home returns to
Welcome. Check both themes.
