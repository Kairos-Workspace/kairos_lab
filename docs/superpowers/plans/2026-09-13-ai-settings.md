# AI Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A settings screen in the EA Lab where the user configures an AI provider (OpenAI, Anthropic/Claude, Gemini, or a Custom OpenAI-compatible endpoint), model, and API key — with the key encrypted at rest via Electron's `safeStorage` and never exposed to the renderer process — plus a "Test connection" action.

**Architecture:** Same layered pattern as every other feature in this app: SQLite table → repository functions → IPC constants → main-process handlers → preload namespace → renderer store → screen component. The one new wrinkle is a dedicated `src/main/ai/` module (not `repositories.ts`) since this involves OS-level encryption and outbound HTTPS calls to third-party APIs — a different kind of concern than plain SQLite CRUD, deserving its own boundary the same way `useEaLabStore.ts` got its own file instead of growing `useAppStore.ts`.

**Tech Stack:** Electron's `safeStorage` API (main-process only, OS keychain-backed) and the global `fetch` available in Electron's main process — no new npm dependencies needed. **Verified via a manual spike before writing this plan:** `safeStorage.isEncryptionAvailable()` returns `true` on this machine, and `encryptString`/`decryptString` round-trip correctly through base64 encoding for SQLite TEXT storage.

**Spec:** `docs/superpowers/specs/2026-09-13-ai-settings-design.md`

---

## File Structure

- **Modify** `src/shared/types.ts` — add `AiSettings` type.
- **Modify** `src/main/database/schema.ts` — add `ai_settings` table.
- **Create** `src/main/ai/aiSettingsRepository.ts` — SQLite CRUD + `safeStorage` encryption for the API key.
- **Create** `src/main/ai/providers.ts` — per-provider "test connection" calls.
- **Modify** `src/shared/ipc.ts` — add `AI_*` channel constants.
- **Modify** `src/main/ipc.ts` — add IPC handlers.
- **Modify** `src/preload/index.ts` — add `ai` namespace.
- **Modify** `src/renderer/src/store/useAppStore.ts` — add `'ai-settings'` screen, `enterAiSettings`/`leaveAiSettings`.
- **Modify** `src/renderer/src/components/Icon.tsx` — add a `settings` glyph.
- **Create** `src/renderer/src/store/useAiSettingsStore.ts` — screen state.
- **Create** `src/renderer/src/components/AiSettings.tsx` — the screen.
- **Modify** `src/renderer/src/App.tsx` — render `AiSettings` for `screen === 'ai-settings'`.
- **Modify** `src/renderer/src/components/EaLab.tsx` — add the gear icon button.
- **Modify** `src/renderer/src/styles/global.css` — frame variant + layout + status-color classes.

---

### Task 1: Add the `AiSettings` shared type

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add the type**

Find:

```ts
export interface EaScript {
  id: string
  name: string
  code: string
  createdAt: number
  updatedAt: number
}
```

Directly after it, add:

```ts

export interface AiSettings {
  provider: 'openai' | 'anthropic' | 'gemini' | 'custom'
  model: string
  baseUrl: string | null
  hasApiKey: boolean
}
```

Note this type deliberately has no key field at all — it's what the renderer is allowed to see, and the renderer must never receive the actual key, encrypted or not.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "Add AiSettings shared type"
```

---

### Task 2: Add the `ai_settings` table

**Files:**
- Modify: `src/main/database/schema.ts`

- [ ] **Step 1: Add the table**

Find the end of the `SCHEMA_SQL` string:

```sql
CREATE INDEX IF NOT EXISTS idx_drawings_symbol ON drawings(symbol);
`
```

Change to:

```sql
CREATE INDEX IF NOT EXISTS idx_drawings_symbol ON drawings(symbol);

CREATE TABLE IF NOT EXISTS ai_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  provider TEXT NOT NULL DEFAULT 'openai',
  model TEXT NOT NULL DEFAULT '',
  base_url TEXT,
  encrypted_api_key TEXT,
  updated_at INTEGER NOT NULL
);
`
```

`CHECK (id = 1)` enforces exactly one row — there's only ever one active AI configuration, not a list of saved profiles. `encrypted_api_key` holds base64-encoded encrypted bytes, never a raw key — Task 3 handles that encoding.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/database/schema.ts
git commit -m "Add ai_settings table to schema"
```

---

### Task 3: Create the AI settings repository (with encryption)

**Files:**
- Create: `src/main/ai/aiSettingsRepository.ts`

- [ ] **Step 1: Write the repository**

Create `src/main/ai/aiSettingsRepository.ts`:

```ts
import { safeStorage } from 'electron'
import type { AiSettings } from '@shared/types'
import { getDb } from '../database/db'

interface AiSettingsRow {
  id: number
  provider: string
  model: string
  base_url: string | null
  encrypted_api_key: string | null
  updated_at: number
}

function ensureRow(): AiSettingsRow {
  const existing = getDb().prepare('SELECT * FROM ai_settings WHERE id = 1').get() as
    | AiSettingsRow
    | undefined
  if (existing) return existing
  getDb()
    .prepare(
      `INSERT INTO ai_settings (id, provider, model, base_url, encrypted_api_key, updated_at)
       VALUES (1, 'openai', '', NULL, NULL, @updated)`
    )
    .run({ updated: Date.now() })
  return getDb().prepare('SELECT * FROM ai_settings WHERE id = 1').get() as AiSettingsRow
}

export function getAiSettings(): AiSettings {
  const row = ensureRow()
  return {
    provider: row.provider as AiSettings['provider'],
    model: row.model,
    baseUrl: row.base_url,
    hasApiKey: !!row.encrypted_api_key
  }
}

export function saveAiSettings(patch: {
  provider: AiSettings['provider']
  model: string
  baseUrl: string | null
}): AiSettings {
  ensureRow()
  getDb()
    .prepare(
      `UPDATE ai_settings SET provider = @provider, model = @model, base_url = @baseUrl, updated_at = @updated
       WHERE id = 1`
    )
    .run({
      provider: patch.provider,
      model: patch.model,
      baseUrl: patch.baseUrl,
      updated: Date.now()
    })
  return getAiSettings()
}

export function setAiApiKey(key: string): { ok: boolean; error?: string } {
  if (!safeStorage.isEncryptionAvailable()) {
    return {
      ok: false,
      error: "Secure storage isn't available on this system, so the API key can't be saved."
    }
  }
  ensureRow()
  const encrypted = safeStorage.encryptString(key).toString('base64')
  getDb()
    .prepare('UPDATE ai_settings SET encrypted_api_key = @key, updated_at = @updated WHERE id = 1')
    .run({ key: encrypted, updated: Date.now() })
  return { ok: true }
}

export function clearAiApiKey(): void {
  ensureRow()
  getDb()
    .prepare('UPDATE ai_settings SET encrypted_api_key = NULL, updated_at = @updated WHERE id = 1')
    .run({ updated: Date.now() })
}

export function getDecryptedApiKey(): string | null {
  const row = ensureRow()
  if (!row.encrypted_api_key) return null
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(row.encrypted_api_key, 'base64'))
  } catch {
    return null
  }
}
```

`getDecryptedApiKey()` is deliberately not exported through IPC anywhere — it's only ever called from within the main process (Task 6's `AI_TEST_CONNECTION` handler, and later the chat sub-project), never sent to the renderer.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/ai/aiSettingsRepository.ts
git commit -m "Add AI settings repository with encrypted API key storage"
```

---

### Task 4: Create the provider test-connection adapters

**Files:**
- Create: `src/main/ai/providers.ts`

- [ ] **Step 1: Write the adapters**

Create `src/main/ai/providers.ts`:

```ts
import type { AiSettings } from '@shared/types'

export interface TestConnectionResult {
  ok: boolean
  message: string
}

async function testOpenAiCompatible(baseUrl: string, apiKey: string): Promise<TestConnectionResult> {
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    if (res.ok) return { ok: true, message: 'Connected' }
    return { ok: false, message: `Request failed (${res.status})` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Network error' }
  }
}

async function testAnthropic(apiKey: string): Promise<TestConnectionResult> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    })
    if (res.ok) return { ok: true, message: 'Connected' }
    return { ok: false, message: `Request failed (${res.status})` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Network error' }
  }
}

async function testGemini(apiKey: string): Promise<TestConnectionResult> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    )
    if (res.ok) return { ok: true, message: 'Connected' }
    return { ok: false, message: `Request failed (${res.status})` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Network error' }
  }
}

export async function testConnection(
  settings: Pick<AiSettings, 'provider' | 'baseUrl'>,
  apiKey: string | null
): Promise<TestConnectionResult> {
  if (!apiKey) return { ok: false, message: 'No API key configured' }
  switch (settings.provider) {
    case 'openai':
      return testOpenAiCompatible('https://api.openai.com/v1', apiKey)
    case 'anthropic':
      return testAnthropic(apiKey)
    case 'gemini':
      return testGemini(apiKey)
    case 'custom':
      if (!settings.baseUrl) return { ok: false, message: 'No base URL configured' }
      return testOpenAiCompatible(settings.baseUrl.replace(/\/$/, ''), apiKey)
    default:
      return { ok: false, message: 'Unknown provider' }
  }
}
```

Each adapter uses a lightweight "list models" call so testing connectivity doesn't send a chat message or cost tokens. This file is deliberately scoped to just proving connectivity — a later sub-project extends it with real chat-sending functions per provider, reusing this same per-provider request-building structure rather than starting over.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/ai/providers.ts
git commit -m "Add per-provider test-connection adapters"
```

---

### Task 5: Add IPC channel constants

**Files:**
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Add the constants**

Find:

```ts
  DRAWINGS_CLEAR: 'drawings:clear',
  DB_PATH: 'db:path'
} as const
```

Change to:

```ts
  DRAWINGS_CLEAR: 'drawings:clear',
  AI_GET_SETTINGS: 'ai:get-settings',
  AI_SAVE_SETTINGS: 'ai:save-settings',
  AI_SET_API_KEY: 'ai:set-api-key',
  AI_CLEAR_API_KEY: 'ai:clear-api-key',
  AI_TEST_CONNECTION: 'ai:test-connection',
  DB_PATH: 'db:path'
} as const
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc.ts
git commit -m "Add AI settings IPC channel constants"
```

---

### Task 6: Add IPC handlers

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
  EaScript,
  SavedStrategy,
  Timeframe,
  Trade
} from '@shared/types'
```

Change to:

```ts
import type {
  AiSettings,
  BacktestSession,
  Candle,
  DeskPrefs,
  Drawing,
  EaScript,
  SavedStrategy,
  Timeframe,
  Trade
} from '@shared/types'
```

Find:

```ts
import { latestWindow } from '@core/market/catalog'
import { csvCandles, deleteCsvTape, isCsvDataset, refreshCsvDatasets } from './data/csvTape'
import { estimateDownload, fetchMarketCandles } from './data/fetchMarket'
```

Change to:

```ts
import { latestWindow } from '@core/market/catalog'
import { csvCandles, deleteCsvTape, isCsvDataset, refreshCsvDatasets } from './data/csvTape'
import { estimateDownload, fetchMarketCandles } from './data/fetchMarket'
import {
  clearAiApiKey,
  getAiSettings,
  getDecryptedApiKey,
  saveAiSettings,
  setAiApiKey
} from './ai/aiSettingsRepository'
import { testConnection } from './ai/providers'
```

- [ ] **Step 2: Add the handlers**

Find:

```ts
  handle(IPC.EA_SCRIPTS_DELETE, (_e, id: string) => {
    deleteEaScript(id)
    return listEaScripts()
  })

  handle(IPC.PREFS_LOAD, () => loadDeskPrefs())
```

Change to:

```ts
  handle(IPC.EA_SCRIPTS_DELETE, (_e, id: string) => {
    deleteEaScript(id)
    return listEaScripts()
  })

  handle(IPC.AI_GET_SETTINGS, () => getAiSettings())

  handle(
    IPC.AI_SAVE_SETTINGS,
    (_e, patch: { provider: AiSettings['provider']; model: string; baseUrl: string | null }) =>
      saveAiSettings(patch)
  )

  handle(IPC.AI_SET_API_KEY, (_e, key: string) => setAiApiKey(key))

  handle(IPC.AI_CLEAR_API_KEY, () => {
    clearAiApiKey()
  })

  handle(IPC.AI_TEST_CONNECTION, async () => {
    const settings = getAiSettings()
    const apiKey = getDecryptedApiKey()
    return testConnection(settings, apiKey)
  })

  handle(IPC.PREFS_LOAD, () => loadDeskPrefs())
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc.ts
git commit -m "Add AI settings IPC handlers"
```

---

### Task 7: Add the preload `ai` namespace

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add `AiSettings` to the type import**

Find:

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

Change to:

```ts
import type {
  AiSettings,
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
  eaScripts: {
    list: () => ipcRenderer.invoke(IPC.EA_SCRIPTS_LIST) as Promise<EaScript[]>,
    save: (script: EaScript) =>
      ipcRenderer.invoke(IPC.EA_SCRIPTS_SAVE, script) as Promise<EaScript[]>,
    delete: (id: string) =>
      ipcRenderer.invoke(IPC.EA_SCRIPTS_DELETE, id) as Promise<EaScript[]>
  },
  prefs: {
```

Change to:

```ts
  eaScripts: {
    list: () => ipcRenderer.invoke(IPC.EA_SCRIPTS_LIST) as Promise<EaScript[]>,
    save: (script: EaScript) =>
      ipcRenderer.invoke(IPC.EA_SCRIPTS_SAVE, script) as Promise<EaScript[]>,
    delete: (id: string) =>
      ipcRenderer.invoke(IPC.EA_SCRIPTS_DELETE, id) as Promise<EaScript[]>
  },
  ai: {
    getSettings: () => ipcRenderer.invoke(IPC.AI_GET_SETTINGS) as Promise<AiSettings>,
    saveSettings: (patch: { provider: AiSettings['provider']; model: string; baseUrl: string | null }) =>
      ipcRenderer.invoke(IPC.AI_SAVE_SETTINGS, patch) as Promise<AiSettings>,
    setApiKey: (key: string) =>
      ipcRenderer.invoke(IPC.AI_SET_API_KEY, key) as Promise<{ ok: boolean; error?: string }>,
    clearApiKey: () => ipcRenderer.invoke(IPC.AI_CLEAR_API_KEY) as Promise<void>,
    testConnection: () =>
      ipcRenderer.invoke(IPC.AI_TEST_CONNECTION) as Promise<{ ok: boolean; message: string }>
  },
  prefs: {
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts
git commit -m "Add ai preload namespace"
```

---

### Task 8: Add the `ai-settings` screen navigation

**Files:**
- Modify: `src/renderer/src/store/useAppStore.ts`

- [ ] **Step 1: Widen `AppScreen`**

Find:

```ts
export type AppScreen = 'welcome' | 'library' | 'workspace' | 'ea-lab'
```

Change to:

```ts
export type AppScreen = 'welcome' | 'library' | 'workspace' | 'ea-lab' | 'ai-settings'
```

- [ ] **Step 2: Declare the actions on the interface**

Find:

```ts
  enterEaLab: () => void
  goHome: () => void
```

Change to:

```ts
  enterEaLab: () => void
  enterAiSettings: () => void
  leaveAiSettings: () => void
  goHome: () => void
```

- [ ] **Step 3: Implement the actions**

Find:

```ts
  enterEaLab: () => {
    set({ screen: 'ea-lab' })
  },

  goHome: () => {
    set({ screen: 'welcome' })
  },
```

Change to:

```ts
  enterEaLab: () => {
    set({ screen: 'ea-lab' })
  },

  enterAiSettings: () => {
    set({ screen: 'ai-settings' })
  },

  leaveAiSettings: () => {
    set({ screen: 'ea-lab' })
  },

  goHome: () => {
    set({ screen: 'welcome' })
  },
```

`leaveAiSettings` returns to `'ea-lab'`, not `'welcome'` — you only ever reach AI Settings from inside the EA Lab, so the way back should be symmetric with how you got there (same reasoning as `leaveWorkspace` returning to `'library'` rather than `'welcome'`).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/useAppStore.ts
git commit -m "Add ai-settings screen and navigation actions"
```

---

### Task 9: Add a `settings` icon

**Files:**
- Modify: `src/renderer/src/components/Icon.tsx`

- [ ] **Step 1: Add `settings` to `IconName`**

Find:

```ts
  | 'undo'
  | 'redo'
  | 'edit'
  | 'home'
```

Change to:

```ts
  | 'undo'
  | 'redo'
  | 'edit'
  | 'home'
  | 'settings'
```

- [ ] **Step 2: Add the path**

Find:

```ts
  home: 'M4 11l8-7 8 7M6 10v10h5v-6h2v6h5V10'
}
```

Change to:

```ts
  home: 'M4 11l8-7 8 7M6 10v10h5v-6h2v6h5V10',
  settings:
    'M4 6h16M6.5 6a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M4 12h16M12.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M4 18h16M8.5 18a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0'
}
```

This draws three horizontal sliders (a common, easily-recognizable "settings" glyph) rather than literal gear teeth, matching the simple line-art style of the rest of this icon set.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/Icon.tsx
git commit -m "Add settings icon"
```

---

### Task 10: Create the AI settings store

**Files:**
- Create: `src/renderer/src/store/useAiSettingsStore.ts`

- [ ] **Step 1: Write the store**

Create `src/renderer/src/store/useAiSettingsStore.ts`:

```ts
import { create } from 'zustand'
import type { AiSettings } from '@shared/types'
import { desktop } from '../lib/desktop'

function aiBridge() {
  return desktop()?.ai
}

interface TestResult {
  ok: boolean
  message: string
}

interface AiSettingsState {
  settings: AiSettings | null
  testing: boolean
  testResult: TestResult | null
  loadSettings: () => Promise<void>
  saveSettings: (
    patch: { provider: AiSettings['provider']; model: string; baseUrl: string | null },
    apiKey: string
  ) => Promise<void>
  testConnection: () => Promise<void>
}

export const useAiSettingsStore = create<AiSettingsState>((set) => ({
  settings: null,
  testing: false,
  testResult: null,

  loadSettings: async () => {
    const settings = (await aiBridge()?.getSettings()) ?? null
    set({ settings })
  },

  saveSettings: async (patch, apiKey) => {
    await aiBridge()?.saveSettings(patch)
    if (apiKey.trim()) {
      await aiBridge()?.setApiKey(apiKey.trim())
    }
    const settings = (await aiBridge()?.getSettings()) ?? null
    set({ settings, testResult: null })
  },

  testConnection: async () => {
    set({ testing: true, testResult: null })
    const result = (await aiBridge()?.testConnection()) ?? {
      ok: false,
      message: 'Not running in Electron'
    }
    set({ testing: false, testResult: result })
  }
}))
```

This is a dedicated store for the same reason `useEaLabStore.ts` is — a self-contained concern, not folded into `useAppStore.ts`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/store/useAiSettingsStore.ts
git commit -m "Add AI settings store"
```

---

### Task 11: Create the `AiSettings` screen

**Files:**
- Create: `src/renderer/src/components/AiSettings.tsx`

- [ ] **Step 1: Write the component**

Create `src/renderer/src/components/AiSettings.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { AiSettings as AiSettingsType } from '@shared/types'
import { BrandMark } from './BrandMark'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'
import { ThemeToggle } from './ThemeToggle'
import { useAiSettingsStore } from '../store/useAiSettingsStore'
import { useAppStore } from '../store/useAppStore'

const PROVIDER_OPTIONS: { value: AiSettingsType['provider']; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Claude (Anthropic)' },
  { value: 'gemini', label: 'Gemini (Google)' },
  { value: 'custom', label: 'Custom (OpenAI-compatible)' }
]

export function AiSettings(): React.JSX.Element {
  const leaveAiSettings = useAppStore((s) => s.leaveAiSettings)
  const settings = useAiSettingsStore((s) => s.settings)
  const loadSettings = useAiSettingsStore((s) => s.loadSettings)
  const saveSettings = useAiSettingsStore((s) => s.saveSettings)
  const testConnection = useAiSettingsStore((s) => s.testConnection)
  const testResult = useAiSettingsStore((s) => s.testResult)
  const testing = useAiSettingsStore((s) => s.testing)

  const [provider, setProvider] = useState<AiSettingsType['provider']>('openai')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    if (!settings) return
    setProvider(settings.provider)
    setModel(settings.model)
    setBaseUrl(settings.baseUrl ?? '')
  }, [settings])

  async function handleSave(): Promise<void> {
    await saveSettings({ provider, model, baseUrl: provider === 'custom' ? baseUrl : null }, apiKey)
    setApiKey('')
  }

  return (
    <div className="app" data-frame="ai-settings">
      <header className="topbar">
        <div className="brand">
          <BrandMark subtitle="AI settings" />
        </div>
        <div className="top-controls" />
        <div className="session-chip">
          <button
            type="button"
            className="icon-btn"
            onClick={leaveAiSettings}
            title="Back to EA Lab"
            aria-label="Back to EA Lab"
          >
            <Icon name="back" />
          </button>
          <ThemeToggle />
        </div>
      </header>

      <section className="ai-settings-body">
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSave()
          }}
        >
          <header>
            <div>
              <span className="stamp">AI</span>
              <h2>AI provider settings</h2>
            </div>
          </header>

          <label className="field">
            Provider
            <Dropdown ariaLabel="Provider" value={provider} onChange={setProvider} options={PROVIDER_OPTIONS} />
          </label>

          <label className="field">
            Model
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o" />
          </label>

          {provider === 'custom' ? (
            <label className="field">
              Base URL
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://your-endpoint/v1"
              />
            </label>
          ) : null}

          <label className="field">
            API key
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={settings?.hasApiKey ? 'Key saved — leave blank to keep it' : 'sk-...'}
            />
          </label>

          {testResult ? (
            <p className="composer-hint" data-ok={testResult.ok}>
              {testResult.message}
            </p>
          ) : null}

          <div className="composer-actions">
            <button type="button" className="ghost" disabled={testing} onClick={() => void testConnection()}>
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            <button className="primary icon-label" type="submit">
              <Icon name="save" />
              Save
            </button>
          </div>
        </form>
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
git add src/renderer/src/components/AiSettings.tsx
git commit -m "Add AiSettings screen"
```

---

### Task 12: Wire `AiSettings` into the app

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Import and render `AiSettings`**

Find:

```tsx
import { useEffect } from 'react'
import { applyDeskTheme } from '@core/desk/theme'
import { EaLab } from './components/EaLab'
import { LoadingOverlay } from './components/LoadingOverlay'
```

Change to:

```tsx
import { useEffect } from 'react'
import { applyDeskTheme } from '@core/desk/theme'
import { AiSettings } from './components/AiSettings'
import { EaLab } from './components/EaLab'
import { LoadingOverlay } from './components/LoadingOverlay'
```

Then find:

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
      ) : screen === 'ai-settings' ? (
        <AiSettings />
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
git commit -m "Render AiSettings for the ai-settings screen"
```

---

### Task 13: Add the gear icon button to the EA Lab

**Files:**
- Modify: `src/renderer/src/components/EaLab.tsx`

- [ ] **Step 1: Select `enterAiSettings`**

Find:

```tsx
  const goHome = useAppStore((s) => s.goHome)
  const theme = useAppStore((s) => s.theme)
```

Change to:

```tsx
  const goHome = useAppStore((s) => s.goHome)
  const enterAiSettings = useAppStore((s) => s.enterAiSettings)
  const theme = useAppStore((s) => s.theme)
```

- [ ] **Step 2: Add the button**

Find:

```tsx
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
```

Change to:

```tsx
          <button
            type="button"
            className="icon-btn"
            onClick={() => void createScript()}
            title="New script"
            aria-label="New script"
          >
            <Icon name="plus" />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={enterAiSettings}
            title="AI settings"
            aria-label="AI settings"
          >
            <Icon name="settings" />
          </button>
        </div>
      </header>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/EaLab.tsx
git commit -m "Add AI settings button to the EA Lab topbar"
```

---

### Task 14: Style the AI settings screen

**Files:**
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Add `ai-settings` to the shared frame variant**

Find:

```css
.app[data-frame='full'],
.app[data-frame='library'],
.app[data-frame='ea-lab'] {
  grid-template-rows: 60px minmax(0, 1fr);
}
```

Change to:

```css
.app[data-frame='full'],
.app[data-frame='library'],
.app[data-frame='ea-lab'],
.app[data-frame='ai-settings'] {
  grid-template-rows: 60px minmax(0, 1fr);
}
```

- [ ] **Step 2: Add the layout and status-color classes**

Find:

```css
.composer-hint {
  margin: -6px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}
```

Directly after it, add:

```css

.composer-hint[data-ok='true'] {
  color: var(--bull);
}

.composer-hint[data-ok='false'] {
  color: var(--bear);
}

.ai-settings-body {
  display: grid;
  place-items: center;
  padding: 24px;
  min-height: 0;
}
```

`.composer-hint[data-ok='...']` is scoped by attribute so it only affects the connection-test message, not the pre-existing generic hint text elsewhere (e.g. the strategy composer's engine description) that also uses `.composer-hint` without that attribute. `.ai-settings-body` reuses the `.composer` card styling as-is (already self-contained: border, radius, gradient background, shadow) — it just needs somewhere to be centered outside of `.modal-backdrop`, which is what this provides.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/styles/global.css
git commit -m "Style the AI settings screen"
```

(No typecheck applies — CSS isn't typechecked. Verified visually in Task 15.)

---

### Task 15: Manual verification

**REQUIRED SUB-SKILL:** Use the `run` skill to launch the app for this task, in an isolated data directory so this never touches real saved data.

- [ ] **Step 1: Launch the app**

Build (`npm run build`) and launch the app in an isolated environment.

- [ ] **Step 2: Reach the screen**

From the EA Lab, click the new gear icon — confirm it navigates to AI Settings, and the form renders (Provider dropdown, Model field, API key field; Base URL field hidden unless Custom is selected).

- [ ] **Step 3: Verify the key stays server-side**

After saving a test key, use DevTools (or an IPC call from the console) to confirm `window.quantify.ai.getSettings()` returns `hasApiKey: true` but no key value anywhere in the response — the raw/encrypted key must never appear in anything the renderer receives.

- [ ] **Step 4: Verify save + test connection, invalid key**

Pick a provider, enter an obviously invalid API key (e.g. `invalid-key-123`), save, click "Test connection" — confirm it reports failure with a sensible message (not a crash, not a silent no-op).

- [ ] **Step 5: Verify test connection, real key (if available)**

If a real API key for at least one provider is available, save it and confirm "Test connection" reports success.

- [ ] **Step 6: Verify persistence**

Relaunch the app (same isolated data directory) — confirm the saved provider/model/baseUrl persist, and the API key field shows the "Key saved" placeholder rather than being empty (i.e. `hasApiKey` is still `true` after relaunch, proving the encrypted key survived on disk and decrypts correctly).

- [ ] **Step 7: Verify "leave key unchanged" behavior**

With a key already saved, change only the Model field (leave API key blank) and save — confirm the key is still there afterward (`hasApiKey: true`), not cleared.

- [ ] **Step 8: Verify navigation**

Confirm the back button returns to the EA Lab (not Welcome). Confirm the EA Lab and Strategy Lab flows are otherwise unaffected.

- [ ] **Step 9: Check both themes**

Toggle light/dark mode — confirm the form, dropdown, and connection-test status colors (success green / failure red) all read correctly in both.

If any step fails, fix the relevant file, re-run `npm run typecheck`, and re-verify before finishing. No commit is needed for this task unless a fix was required, in which case commit the fix with a message describing what was wrong.
