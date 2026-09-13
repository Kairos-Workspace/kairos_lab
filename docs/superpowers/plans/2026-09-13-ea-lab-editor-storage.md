# EA Development Lab — Editor + Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the EA Development Lab screen: a Monaco-based code editor with MQL5-style syntax highlighting, backed by SQLite storage, reachable from Welcome's EA Development Lab card (which becomes a real button instead of an inert placeholder). No script execution — that's covered by two later sub-projects.

**Architecture:** New SQLite table `ea_scripts`, mirroring the existing `strategies` table's exact create/list/save/delete pattern (schema → repository → IPC → preload). A new dedicated `useEaLabStore.ts` (not an addition to the already-1300+-line `useAppStore.ts`) holds the Lab's screen state. A new `AppScreen` value `'ea-lab'` and `enterEaLab()` action wire it into the existing screen-router pattern (`goHome()` already exists and is reused for the way back).

**Tech Stack:** React + TypeScript, Zustand, `better-sqlite3` (existing), Monaco via `@monaco-editor/react` + `monaco-editor` (new dependencies). **Verified via a manual spike before writing this plan:** `@monaco-editor/react`'s default CDN loader is blocked by this app's CSP (`script-src 'self' ...`) and fails outright — it must be configured with `loader.config({ monaco })` pointing at the locally-installed `monaco-editor` package, which then bundles correctly via electron-vite (confirmed: renders, tokenizes/highlights, and accepts real keyboard input). A secondary attempt to also silence a harmless `editorWorkerService` console warning (via a `?worker` import) failed to resolve under electron-vite's build and was deliberately dropped — the warning doesn't affect editing functionality and there's no IntelliSense/language-server need at this stage to justify chasing it further.

**Spec:** `docs/superpowers/specs/2026-09-13-ea-lab-editor-storage-design.md`

---

## File Structure

- **Modify** `src/shared/types.ts` — add `EaScript` type.
- **Modify** `src/main/database/schema.ts` — add `ea_scripts` table.
- **Modify** `src/main/database/repositories.ts` — add `listEaScripts`/`saveEaScript`/`deleteEaScript`.
- **Modify** `src/shared/ipc.ts` — add `EA_SCRIPTS_*` channel constants.
- **Modify** `src/main/ipc.ts` — add IPC handlers.
- **Modify** `src/preload/index.ts` — add `eaScripts` namespace.
- **Modify** `src/renderer/src/store/useAppStore.ts` — widen `AppScreen`, add `enterEaLab`.
- **Modify** `package.json` — add `@monaco-editor/react` and `monaco-editor` dependencies.
- **Create** `src/renderer/src/lib/mql5Language.ts` — Monaco loader config + MQL5-style Monarch tokenizer.
- **Create** `src/renderer/src/store/useEaLabStore.ts` — Lab screen state.
- **Create** `src/renderer/src/components/EaLab.tsx` — the screen.
- **Modify** `src/renderer/src/App.tsx` — render `EaLab` for `screen === 'ea-lab'`.
- **Modify** `src/renderer/src/components/Welcome.tsx` — EA card becomes a real button.
- **Modify** `src/renderer/src/styles/global.css` — frame variant + Lab layout classes.

---

### Task 1: Add the `EaScript` shared type

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add the type**

Find the `SavedStrategy` interface:

```ts
export interface SavedStrategy {
  id: string
  name: string
  notes: string
  settings: StrategySettings
  createdAt: number
  updatedAt: number
}
```

Directly after it, add:

```ts

export interface EaScript {
  id: string
  name: string
  code: string
  createdAt: number
  updatedAt: number
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "Add EaScript shared type"
```

---

### Task 2: Add the `ea_scripts` table

**Files:**
- Modify: `src/main/database/schema.ts`

- [ ] **Step 1: Add the table**

Find the `strategies` table definition:

```sql
CREATE TABLE IF NOT EXISTS strategies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  settings_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

Directly after it, add:

```sql

CREATE TABLE IF NOT EXISTS ea_scripts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

Do not modify any other table definition. This schema has no migration framework — `getDb()` just runs the whole `SCHEMA_SQL` string with `CREATE TABLE IF NOT EXISTS` on every startup, so appending a new table is the correct and only mechanism.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors (this file has no types to check beyond the exported SQL string, but run it anyway to confirm nothing else broke).

- [ ] **Step 3: Commit**

```bash
git add src/main/database/schema.ts
git commit -m "Add ea_scripts table to schema"
```

---

### Task 3: Add EA script repository functions

**Files:**
- Modify: `src/main/database/repositories.ts`

- [ ] **Step 1: Add `EaScript` to the type import**

Find:

```ts
import type {
  BacktestSession,
  Candle,
  DataGap,
  DatasetInfo,
  DeskPrefs,
  Drawing,
  SavedStrategy,
  StrategySettings,
  Timeframe,
  Trade
} from '@shared/types'
```

Change to (insert `EaScript` alphabetically):

```ts
import type {
  BacktestSession,
  Candle,
  DataGap,
  DatasetInfo,
  DeskPrefs,
  Drawing,
  EaScript,
  SavedStrategy,
  StrategySettings,
  Timeframe,
  Trade
} from '@shared/types'
```

- [ ] **Step 2: Add the repository functions**

Find the end of the file:

```ts
export function deleteStrategy(id: string): void {
  getDb().prepare('DELETE FROM strategies WHERE id = ?').run(id)
}
```

Directly after it (this is the last content in the file), add:

```ts

interface EaScriptRow {
  id: string
  name: string
  code: string
  created_at: number
  updated_at: number
}

function mapEaScript(row: EaScriptRow): EaScript {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listEaScripts(): EaScript[] {
  const rows = getDb()
    .prepare('SELECT * FROM ea_scripts ORDER BY updated_at DESC')
    .all() as EaScriptRow[]
  return rows.map(mapEaScript)
}

export function saveEaScript(script: EaScript): EaScript {
  const now = Date.now()
  const row = {
    ...script,
    updatedAt: now,
    createdAt: script.createdAt || now
  }
  getDb()
    .prepare(
      `INSERT INTO ea_scripts (id, name, code, created_at, updated_at)
       VALUES (@id, @name, @code, @created, @updated)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         code = excluded.code,
         updated_at = excluded.updated_at`
    )
    .run({
      id: row.id,
      name: row.name.trim() || 'Untitled EA',
      code: row.code,
      created: row.createdAt,
      updated: row.updatedAt
    })
  return { ...row, name: row.name.trim() || 'Untitled EA' }
}

export function deleteEaScript(id: string): void {
  getDb().prepare('DELETE FROM ea_scripts WHERE id = ?').run(id)
}
```

This mirrors `listStrategies`/`saveStrategy`/`deleteStrategy` exactly in shape (no seed-row cleanup needed here, unlike `listStrategies`, since EA scripts have no seed data).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/database/repositories.ts
git commit -m "Add EA script repository functions"
```

---

### Task 4: Add IPC channel constants

**Files:**
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Add the constants**

Find:

```ts
  STRATEGIES_LIST: 'strategies:list',
  STRATEGIES_SAVE: 'strategies:save',
  STRATEGIES_DELETE: 'strategies:delete',
```

Change to:

```ts
  STRATEGIES_LIST: 'strategies:list',
  STRATEGIES_SAVE: 'strategies:save',
  STRATEGIES_DELETE: 'strategies:delete',
  EA_SCRIPTS_LIST: 'ea-scripts:list',
  EA_SCRIPTS_SAVE: 'ea-scripts:save',
  EA_SCRIPTS_DELETE: 'ea-scripts:delete',
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc.ts
git commit -m "Add EA script IPC channel constants"
```

---

### Task 5: Add IPC handlers

**Files:**
- Modify: `src/main/ipc.ts`

- [ ] **Step 1: Add imports**

Find:

```ts
import type {
  BacktestSession,
  Candle,
  DeskPrefs,
  Drawing,
  SavedStrategy,
  Timeframe,
  Trade
} from '@shared/types'
import { dbPath, getDb } from './database/db'
import {
  clearDrawings,
  deleteDataset,
  deleteDrawing,
  deleteSession,
  deleteStrategy,
  getCandles,
  getGaps,
  getRecentCandles,
  insertDataset,
  listDatasets,
  listDrawings,
  listStrategies,
  loadDeskPrefs,
  loadSession,
  replaceTape,
  saveDeskPrefs,
  saveDrawing,
  saveSession,
  saveStrategy
} from './database/repositories'
```

Change to:

```ts
import type {
  BacktestSession,
  Candle,
  DeskPrefs,
  Drawing,
  EaScript,
  SavedStrategy,
  Timeframe,
  Trade
} from '@shared/types'
import { dbPath, getDb } from './database/db'
import {
  clearDrawings,
  deleteDataset,
  deleteDrawing,
  deleteEaScript,
  deleteSession,
  deleteStrategy,
  getCandles,
  getGaps,
  getRecentCandles,
  insertDataset,
  listDatasets,
  listDrawings,
  listEaScripts,
  listStrategies,
  loadDeskPrefs,
  loadSession,
  replaceTape,
  saveDeskPrefs,
  saveDrawing,
  saveEaScript,
  saveSession,
  saveStrategy
} from './database/repositories'
```

- [ ] **Step 2: Add the handlers**

Find:

```ts
  handle(IPC.STRATEGIES_LIST, () => listStrategies())

  handle(IPC.STRATEGIES_SAVE, (_e, strategy: SavedStrategy) => {
    saveStrategy(strategy)
    return listStrategies()
  })

  handle(IPC.STRATEGIES_DELETE, (_e, id: string) => {
    deleteStrategy(id)
    return listStrategies()
  })
```

Change to:

```ts
  handle(IPC.STRATEGIES_LIST, () => listStrategies())

  handle(IPC.STRATEGIES_SAVE, (_e, strategy: SavedStrategy) => {
    saveStrategy(strategy)
    return listStrategies()
  })

  handle(IPC.STRATEGIES_DELETE, (_e, id: string) => {
    deleteStrategy(id)
    return listStrategies()
  })

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

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc.ts
git commit -m "Add EA script IPC handlers"
```

---

### Task 6: Add the preload `eaScripts` namespace

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add `EaScript` to the type import**

Find:

```ts
import type {
  BacktestSession,
  DatasetInfo,
  DeskPrefs,
  Drawing,
  SavedStrategy,
  Timeframe,
  Trade
} from '../shared/types'
```

Change to:

```ts
import type {
  BacktestSession,
  DatasetInfo,
  DeskPrefs,
  Drawing,
  EaScript,
  SavedStrategy,
  Timeframe,
  Trade
} from '../shared/types'
```

- [ ] **Step 2: Add the namespace**

Find:

```ts
  strategies: {
    list: () => ipcRenderer.invoke(IPC.STRATEGIES_LIST) as Promise<SavedStrategy[]>,
    save: (strategy: SavedStrategy) =>
      ipcRenderer.invoke(IPC.STRATEGIES_SAVE, strategy) as Promise<SavedStrategy[]>,
    delete: (id: string) =>
      ipcRenderer.invoke(IPC.STRATEGIES_DELETE, id) as Promise<SavedStrategy[]>
  },
```

Change to:

```ts
  strategies: {
    list: () => ipcRenderer.invoke(IPC.STRATEGIES_LIST) as Promise<SavedStrategy[]>,
    save: (strategy: SavedStrategy) =>
      ipcRenderer.invoke(IPC.STRATEGIES_SAVE, strategy) as Promise<SavedStrategy[]>,
    delete: (id: string) =>
      ipcRenderer.invoke(IPC.STRATEGIES_DELETE, id) as Promise<SavedStrategy[]>
  },
  eaScripts: {
    list: () => ipcRenderer.invoke(IPC.EA_SCRIPTS_LIST) as Promise<EaScript[]>,
    save: (script: EaScript) =>
      ipcRenderer.invoke(IPC.EA_SCRIPTS_SAVE, script) as Promise<EaScript[]>,
    delete: (id: string) =>
      ipcRenderer.invoke(IPC.EA_SCRIPTS_DELETE, id) as Promise<EaScript[]>
  },
```

`Window.quantify`'s type updates automatically (`QuantifyApi = typeof api`) — no edit needed to `src/preload/index.d.ts`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts
git commit -m "Add eaScripts preload namespace"
```

---

### Task 7: Add the `ea-lab` screen and navigation action

**Files:**
- Modify: `src/renderer/src/store/useAppStore.ts`

- [ ] **Step 1: Widen `AppScreen`**

Find:

```ts
export type AppScreen = 'welcome' | 'library' | 'workspace'
```

Change to:

```ts
export type AppScreen = 'welcome' | 'library' | 'workspace' | 'ea-lab'
```

- [ ] **Step 2: Declare the action on the interface**

Find:

```ts
  enterLibrary: () => void
  goHome: () => void
```

Change to:

```ts
  enterLibrary: () => void
  enterEaLab: () => void
  goHome: () => void
```

- [ ] **Step 3: Implement the action**

Find:

```ts
  enterLibrary: () => {
    set({ screen: 'library' })
  },

  goHome: () => {
    set({ screen: 'welcome' })
  },
```

Change to:

```ts
  enterLibrary: () => {
    set({ screen: 'library' })
  },

  enterEaLab: () => {
    set({ screen: 'ea-lab' })
  },

  goHome: () => {
    set({ screen: 'welcome' })
  },
```

`goHome()` already exists and needs no changes — it's reused as-is for the EA Lab's way back to Welcome, exactly like the Strategy Lab.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/useAppStore.ts
git commit -m "Add ea-lab screen and enterEaLab navigation action"
```

---

### Task 8: Install Monaco and add the MQL5 language module

**Files:**
- Modify: `package.json` (dependency install)
- Create: `src/renderer/src/lib/mql5Language.ts`

- [ ] **Step 1: Install the dependencies**

```bash
npm install @monaco-editor/react monaco-editor
```

(A real, saved install this time — not `--no-save`. This adds both packages to `package.json`'s `dependencies` and updates `package-lock.json`.)

- [ ] **Step 2: Write the language module**

Create `src/renderer/src/lib/mql5Language.ts`:

```ts
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import type { Monaco } from '@monaco-editor/react'

// @monaco-editor/react defaults to fetching Monaco from a CDN at runtime,
// which this app's CSP blocks outright. Pointing it at the locally
// installed package is required for the editor to load at all.
loader.config({ monaco })

const KEYWORDS = [
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'default',
  'break',
  'continue',
  'return',
  'true',
  'false',
  'const',
  'static',
  'struct',
  'class',
  'enum',
  'input',
  'extern'
]

const TYPE_KEYWORDS = [
  'void',
  'int',
  'uint',
  'long',
  'ulong',
  'short',
  'ushort',
  'char',
  'uchar',
  'double',
  'float',
  'bool',
  'string',
  'datetime',
  'color'
]

const LIFECYCLE_FUNCTIONS = ['OnInit', 'OnTick', 'OnDeinit', 'OnTimer']

let registered = false

export function registerMql5Language(monacoInstance: Monaco): void {
  if (registered) return
  registered = true

  monacoInstance.languages.register({ id: 'mql5' })

  monacoInstance.languages.setMonarchTokensProvider('mql5', {
    keywords: KEYWORDS,
    typeKeywords: TYPE_KEYWORDS,
    lifecycle: LIFECYCLE_FUNCTIONS,
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/\b\d+\.\d+\b/, 'number.float'],
        [/\b\d+\b/, 'number'],
        [
          /[a-zA-Z_]\w*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@typeKeywords': 'type',
              '@lifecycle': 'keyword.control',
              '@default': 'identifier'
            }
          }
        ]
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment']
      ]
    }
  })
}
```

This is presentation-only syntax highlighting (a Monarch tokenizer) — it doesn't parse or validate the code, just colors keywords/types/strings/comments. No autocomplete or language server; that needs the real language semantics from a later sub-project.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/renderer/src/lib/mql5Language.ts
git commit -m "Add Monaco editor dependency and MQL5-style syntax highlighting"
```

---

### Task 9: Create the EA Lab store

**Files:**
- Create: `src/renderer/src/store/useEaLabStore.ts`

- [ ] **Step 1: Write the store**

Create `src/renderer/src/store/useEaLabStore.ts`:

```ts
import { create } from 'zustand'
import { notifyInfo, notifySuccess } from '@/lib/notify'
import type { EaScript } from '@shared/types'
import { desktop } from '../lib/desktop'

function eaScriptBridge() {
  return desktop()?.eaScripts
}

function newId(): string {
  return crypto.randomUUID()
}

const STARTER_TEMPLATE = `void OnInit()
{
}

void OnTick()
{
}
`

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

export const useEaLabStore = create<EaLabState>((set, get) => ({
  scripts: [],
  activeScriptId: null,
  draftCode: '',
  dirty: false,

  loadScripts: async () => {
    const scripts = (await eaScriptBridge()?.list()) ?? []
    set({ scripts })
    if (!get().activeScriptId && scripts.length > 0) {
      get().selectScript(scripts[0].id)
    }
  },

  createScript: async () => {
    const now = Date.now()
    const script: EaScript = {
      id: newId(),
      name: 'Untitled EA',
      code: STARTER_TEMPLATE,
      createdAt: now,
      updatedAt: now
    }
    const scripts = (await eaScriptBridge()?.save(script)) ?? [script, ...get().scripts]
    set({ scripts, activeScriptId: script.id, draftCode: script.code, dirty: false })
  },

  selectScript: (id) => {
    const script = get().scripts.find((s) => s.id === id)
    if (!script) return
    set({ activeScriptId: id, draftCode: script.code, dirty: false })
  },

  updateDraftCode: (code) => {
    set({ draftCode: code, dirty: true })
  },

  saveActiveScript: async () => {
    const { activeScriptId, scripts, draftCode } = get()
    const existing = scripts.find((s) => s.id === activeScriptId)
    if (!existing) return
    const next = { ...existing, code: draftCode, updatedAt: Date.now() }
    const updated = (await eaScriptBridge()?.save(next)) ?? [
      next,
      ...scripts.filter((s) => s.id !== next.id)
    ]
    set({ scripts: updated, dirty: false })
    notifySuccess(`${next.name} saved`)
  },

  renameScript: async (id, name) => {
    const existing = get().scripts.find((s) => s.id === id)
    if (!existing) return
    const next = { ...existing, name: name.trim() || 'Untitled EA', updatedAt: Date.now() }
    const scripts = (await eaScriptBridge()?.save(next)) ?? [
      next,
      ...get().scripts.filter((s) => s.id !== id)
    ]
    set({ scripts })
  },

  deleteScript: async (id) => {
    const scripts = (await eaScriptBridge()?.delete(id)) ?? get().scripts.filter((s) => s.id !== id)
    const { activeScriptId } = get()
    if (activeScriptId === id) {
      const next = scripts[0]
      set({
        scripts,
        activeScriptId: next?.id ?? null,
        draftCode: next?.code ?? '',
        dirty: false
      })
    } else {
      set({ scripts })
    }
    notifyInfo('EA script removed')
  }
}))
```

This mirrors `useAppStore.ts`'s existing `strategyBridge()`/`createStrategy`/`deleteSavedStrategy` conventions exactly (the `?? [fallback]` pattern so the UI still works with in-memory-only state outside Electron, same as strategies).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/store/useEaLabStore.ts
git commit -m "Add EA Lab store"
```

---

### Task 10: Create the `EaLab` screen

**Files:**
- Create: `src/renderer/src/components/EaLab.tsx`

- [ ] **Step 1: Write the component**

Create `src/renderer/src/components/EaLab.tsx`:

```tsx
import { useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'
import { BrandMark } from './BrandMark'
import { ConfirmIconButton } from './ConfirmIconButton'
import { Icon } from './Icon'
import { ThemeToggle } from './ThemeToggle'
import { registerMql5Language } from '../lib/mql5Language'
import { useAppStore } from '../store/useAppStore'
import { useEaLabStore } from '../store/useEaLabStore'

export function EaLab(): React.JSX.Element {
  const goHome = useAppStore((s) => s.goHome)
  const theme = useAppStore((s) => s.theme)
  const scripts = useEaLabStore((s) => s.scripts)
  const activeScriptId = useEaLabStore((s) => s.activeScriptId)
  const draftCode = useEaLabStore((s) => s.draftCode)
  const dirty = useEaLabStore((s) => s.dirty)
  const loadScripts = useEaLabStore((s) => s.loadScripts)
  const createScript = useEaLabStore((s) => s.createScript)
  const selectScript = useEaLabStore((s) => s.selectScript)
  const updateDraftCode = useEaLabStore((s) => s.updateDraftCode)
  const saveActiveScript = useEaLabStore((s) => s.saveActiveScript)
  const renameScript = useEaLabStore((s) => s.renameScript)
  const deleteScript = useEaLabStore((s) => s.deleteScript)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    void loadScripts()
  }, [loadScripts])

  function startRename(id: string, name: string): void {
    setRenamingId(id)
    setRenameValue(name)
  }

  function commitRename(id: string): void {
    void renameScript(id, renameValue)
    setRenamingId(null)
  }

  const activeScript = scripts.find((s) => s.id === activeScriptId)

  return (
    <div className="app" data-frame="ea-lab">
      <header className="topbar">
        <div className="brand">
          <BrandMark subtitle="EA development" />
        </div>
        <div className="top-controls">
          <span className="chip">{scripts.length} scripts</span>
        </div>
        <div className="session-chip">
          <button type="button" className="icon-btn" onClick={goHome} title="Home" aria-label="Home">
            <Icon name="home" />
          </button>
          <ThemeToggle />
          <button
            type="button"
            className="icon-btn"
            onClick={() => void createScript()}
            title="New script"
            aria-label="New script"
          >
            <Icon name="plus" />
          </button>
        </div>
      </header>

      <section className="ea-lab-body">
        <aside className="ea-lab-sidebar">
          {scripts.length === 0 ? (
            <p className="ea-lab-empty">No EA scripts yet. Create one to get started.</p>
          ) : (
            <ul className="ea-lab-script-list">
              {scripts.map((s) => (
                <li key={s.id} className="ea-lab-script-item" data-active={s.id === activeScriptId}>
                  {renamingId === s.id ? (
                    <input
                      autoFocus
                      className="ea-lab-rename-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => commitRename(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(s.id)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="ea-lab-script-button"
                      onClick={() => selectScript(s.id)}
                    >
                      <strong>{s.name}</strong>
                      <span>{new Date(s.updatedAt).toLocaleString()}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-btn"
                    title="Rename"
                    aria-label={`Rename ${s.name}`}
                    onClick={() => startRename(s.id, s.name)}
                  >
                    <Icon name="edit" />
                  </button>
                  <ConfirmIconButton
                    icon="trash"
                    label="Delete script"
                    confirmLabel={`Click again to delete ${s.name}`}
                    onConfirm={() => void deleteScript(s.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="ea-lab-editor">
          <div className="ea-lab-editor-toolbar">
            <span className="stamp">{activeScript?.name ?? 'No script selected'}</span>
            <button
              type="button"
              className="primary icon-label"
              disabled={!activeScriptId || !dirty}
              onClick={() => void saveActiveScript()}
            >
              <Icon name="save" />
              Save
            </button>
          </div>
          <div className="ea-lab-editor-body">
            {activeScriptId ? (
              <Editor
                height="100%"
                language="mql5"
                theme={theme === 'dark' ? 'vs-dark' : 'vs'}
                value={draftCode}
                onChange={(value) => updateDraftCode(value ?? '')}
                beforeMount={registerMql5Language}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  automaticLayout: true,
                  scrollBeyondLastLine: false
                }}
              />
            ) : (
              <p className="ea-lab-empty">Create a script to start editing.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/EaLab.tsx
git commit -m "Add EaLab screen"
```

---

### Task 11: Wire `EaLab` into the app

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Import and render `EaLab`**

Find:

```tsx
import { useEffect } from 'react'
import { applyDeskTheme } from '@core/desk/theme'
import { LoadingOverlay } from './components/LoadingOverlay'
import { StrategyLibrary } from './components/StrategyLibrary'
import { ToastHost } from './components/ToastHost'
import { Welcome } from './components/Welcome'
import { Workspace } from './components/Workspace'
import { useKeyboard } from './hooks/useKeyboard'
import { useAppStore } from './store/useAppStore'
```

Change to:

```tsx
import { useEffect } from 'react'
import { applyDeskTheme } from '@core/desk/theme'
import { EaLab } from './components/EaLab'
import { LoadingOverlay } from './components/LoadingOverlay'
import { StrategyLibrary } from './components/StrategyLibrary'
import { ToastHost } from './components/ToastHost'
import { Welcome } from './components/Welcome'
import { Workspace } from './components/Workspace'
import { useKeyboard } from './hooks/useKeyboard'
import { useAppStore } from './store/useAppStore'
```

Then find:

```tsx
  return (
    <>
      {screen === 'workspace' ? (
        <Workspace />
      ) : screen === 'welcome' ? (
        <Welcome />
      ) : (
        <StrategyLibrary />
      )}
      <LoadingOverlay />
      <ToastHost />
    </>
  )
```

Change to:

```tsx
  return (
    <>
      {screen === 'workspace' ? (
        <Workspace />
      ) : screen === 'welcome' ? (
        <Welcome />
      ) : screen === 'ea-lab' ? (
        <EaLab />
      ) : (
        <StrategyLibrary />
      )}
      <LoadingOverlay />
      <ToastHost />
    </>
  )
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "Render EaLab for the ea-lab screen"
```

---

### Task 12: Make the Welcome EA card a real button

**Files:**
- Modify: `src/renderer/src/components/Welcome.tsx`

- [ ] **Step 1: Select `enterEaLab`**

Find:

```tsx
export function Welcome(): React.JSX.Element {
  const enterLibrary = useAppStore((s) => s.enterLibrary)
```

Change to:

```tsx
export function Welcome(): React.JSX.Element {
  const enterLibrary = useAppStore((s) => s.enterLibrary)
  const enterEaLab = useAppStore((s) => s.enterEaLab)
```

- [ ] **Step 2: Turn the card into a real button**

Find:

```tsx
          <div className="welcome-lab-card" data-disabled="true">
            <strong>EA Development Lab</strong>
            <span>Build automated trading bots</span>
            <span className="welcome-lab-soon">Coming soon</span>
          </div>
```

Change to:

```tsx
          <button type="button" className="welcome-lab-card" onClick={enterEaLab}>
            <strong>EA Development Lab</strong>
            <span>Build automated trading bots</span>
          </button>
```

(The `data-disabled`/`[data-disabled='true']` CSS rule and the `.welcome-lab-soon` "Coming soon" label remain in `global.css` unused by this element now — leave them in place; nothing else references them, but they're small, harmless, and reflect real design decisions that a future placeholder card might reuse. Removing unused CSS is not part of this task's scope.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/Welcome.tsx
git commit -m "Make the EA Development Lab card a real button"
```

---

### Task 13: Style the EA Lab screen

**Files:**
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Add `ea-lab` to the shared frame variant**

Find:

```css
.app[data-frame='full'],
.app[data-frame='library'] {
  grid-template-rows: 60px minmax(0, 1fr);
}
```

Change to:

```css
.app[data-frame='full'],
.app[data-frame='library'],
.app[data-frame='ea-lab'] {
  grid-template-rows: 60px minmax(0, 1fr);
}
```

- [ ] **Step 2: Add the Lab layout classes**

Find the `.welcome-lab-soon` rule (the last rule before `.welcome-labs`... check the file — it should be near the other `.welcome-*` rules added in prior work):

```css
.welcome-lab-soon {
  margin-top: 2px;
  color: var(--muted);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
```

Directly after it, add:

```css

.ea-lab-body {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 10px;
  min-height: 0;
}

.ea-lab-sidebar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: var(--vault);
  overflow-y: auto;
}

.ea-lab-empty {
  color: var(--muted);
  font-size: 12px;
  text-align: center;
  padding: 24px 8px;
}

.ea-lab-script-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ea-lab-script-item {
  display: flex;
  align-items: center;
  gap: 4px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
}

.ea-lab-script-item[data-active='true'] {
  border-color: var(--gold-dim);
  background: var(--gold-soft);
}

.ea-lab-script-button {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  text-align: left;
}

.ea-lab-script-button strong {
  font-size: 13px;
  color: var(--parchment);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.ea-lab-script-button span {
  font-size: 10px;
  color: var(--muted);
}

.ea-lab-rename-input {
  flex: 1;
  min-width: 0;
  margin: 4px 6px;
}

.ea-lab-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--vault);
}

.ea-lab-editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--rule);
}

.ea-lab-editor-body {
  flex: 1;
  min-height: 0;
}
```

Do not modify any other rule in the file.

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/styles/global.css
git commit -m "Style the EA Lab screen"
```

(No typecheck applies — CSS isn't typechecked. Verified visually in Task 14.)

---

### Task 14: Manual verification

**REQUIRED SUB-SKILL:** Use the `run` skill to launch the app for this task, in an isolated data directory (a separate `STRATEGY_DB_DIR` and, if launching via a Playwright/Electron driver, a separate `--user-data-dir`) so this never touches real saved data — this app stores state in both a SQLite file and the Chromium profile's `localStorage`.

- [ ] **Step 1: Launch the app**

Build (`npm run build`) and launch the app in an isolated environment.

- [ ] **Step 2: Navigate to the Lab**

From Welcome, confirm the "EA Development Lab" card is now a real, clickable button (no "Coming soon" label, not dimmed) and clicking it navigates to the EA Lab screen.

- [ ] **Step 3: Create and edit a script**

Click "New script" — confirm a script appears in the sidebar named "Untitled EA" with the `OnInit`/`OnTick` starter template loaded in the editor, and that the code is syntax-highlighted (keywords/types colored distinctly from plain text). Type additional code — confirm the "Save" button becomes enabled only once the content changes.

- [ ] **Step 4: Save and confirm persistence**

Click Save — confirm a success toast appears and the Save button becomes disabled again. Relaunch the app (same isolated data directory) — confirm the script and its edited content are still there.

- [ ] **Step 5: Rename and delete**

Rename the script via the edit icon (inline input, Enter to commit) — confirm the sidebar updates. Create a second script, then delete one via the trash icon's confirm-click pattern — confirm the remaining script is still selectable and its content still loads correctly.

- [ ] **Step 6: Verify Home navigation**

Click Home — confirm it returns to Welcome (not the Strategy Lab).

- [ ] **Step 7: Check both themes**

Toggle light/dark mode — confirm the editor's own theme switches with it (`vs-dark` / `vs`) and the rest of the screen (sidebar, toolbar) reads correctly in both.

- [ ] **Step 8: Confirm no unrelated regressions**

Confirm the Strategy Lab and Workspace flows are unaffected (open an existing/new strategy, backtest as before).

If any step fails, fix the relevant file, re-run `npm run typecheck`, and re-verify before finishing. No commit is needed for this task unless a fix was required, in which case commit the fix with a message describing what was wrong.
