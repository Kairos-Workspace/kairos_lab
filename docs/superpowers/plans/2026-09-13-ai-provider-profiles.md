# AI Provider Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single enforced AI settings row with a list of named, independently manageable AI provider profiles (add/edit/delete/test), each with its own provider/model/base URL/encrypted API key.

**Architecture:** Same layered pattern as the rest of this app (SQLite table → repository → IPC constants → main-process handlers → preload namespace → renderer store → components), rippled top-to-bottom through every layer that currently assumes "exactly one config": type → schema → repository → provider adapters → IPC → preload → store → UI (a new add/edit modal reusing `ReplayRangeModal`'s pattern, and a rewritten list view in the Settings screen's AI Provider panel).

**Tech Stack:** Electron + React (renderer), SQLite via `better-sqlite3`, `safeStorage` encryption (unchanged), Zustand, plain CSS. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-13-ai-provider-profiles-design.md`

---

### Task 1: Replace the `AiSettings` type with `AiProviderProfile`

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Rename the type**

Find:

```ts
export interface AiSettings {
  provider: 'openai' | 'anthropic' | 'gemini' | 'custom'
  model: string
  baseUrl: string | null
  hasApiKey: boolean
}
```

Replace with:

```ts
export interface AiProviderProfile {
  id: string
  name: string
  provider: 'openai' | 'anthropic' | 'gemini' | 'custom'
  model: string
  baseUrl: string | null
  hasApiKey: boolean
}
```

This will break every other file that references `AiSettings` — that's expected here; the following tasks fix each one in turn. Do not fix other files in this task.

- [ ] **Step 2: Commit**

(No typecheck yet — the codebase is intentionally broken until Task 6. Typecheck resumes being a gate starting Task 2.)

```bash
git add src/shared/types.ts
git commit -m "$(cat <<'EOF'
Replace AiSettings with AiProviderProfile

The single "one active AI configuration" shape is becoming a list of
named, independently manageable profiles. This is step 1 of a
top-to-bottom rename through schema/repository/IPC/preload/store/UI —
the codebase will not typecheck again until Task 6 rewires the last
consumer (main/ipc.ts).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Replace the `ai_settings` table with `ai_providers`

**Files:**
- Modify: `src/main/database/schema.ts`

- [ ] **Step 1: Drop the old table, add the new one**

Find:

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

Replace with:

```sql
CREATE INDEX IF NOT EXISTS idx_drawings_symbol ON drawings(symbol);

DROP TABLE IF EXISTS ai_settings;

CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  base_url TEXT,
  encrypted_api_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`
```

`DROP TABLE IF EXISTS ai_settings` is a deliberate fresh start (confirmed with
the user) — no migration of the one previously-saved config. `id` is `TEXT`
here (a `crypto.randomUUID()` generated client-side), matching the exact
convention `ea_scripts` already uses, not an auto-increment integer — there's
no longer a single enforced row, so there's nothing to `CHECK (id = 1)` against.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: still fails — `src/main/ai/aiSettingsRepository.ts` still references
the now-gone `ai_settings` table/`AiSettings` type. This is expected; it gets
replaced in Task 3.

- [ ] **Step 3: Commit**

```bash
git add src/main/database/schema.ts
git commit -m "$(cat <<'EOF'
Replace ai_settings with an ai_providers table

Drops the old single-row table (fresh start, no migration — this is
a solo local desktop app, not a service with other users' data to
preserve) and adds a real multi-row table, id-keyed the same way
ea_scripts already is.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Create the AI provider profiles repository

**Files:**
- Create: `src/main/ai/aiProvidersRepository.ts`
- Delete: `src/main/ai/aiSettingsRepository.ts`

- [ ] **Step 1: Write the new repository**

Create `src/main/ai/aiProvidersRepository.ts`:

```ts
import { safeStorage } from 'electron'
import type { AiProviderProfile } from '@shared/types'
import { getDb } from '../database/db'

interface AiProviderRow {
  id: string
  name: string
  provider: string
  model: string
  base_url: string | null
  encrypted_api_key: string | null
  created_at: number
  updated_at: number
}

function toProfile(row: AiProviderRow): AiProviderProfile {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider as AiProviderProfile['provider'],
    model: row.model,
    baseUrl: row.base_url,
    hasApiKey: !!row.encrypted_api_key
  }
}

export function listProviders(): AiProviderProfile[] {
  const rows = getDb()
    .prepare('SELECT * FROM ai_providers ORDER BY updated_at DESC')
    .all() as AiProviderRow[]
  return rows.map(toProfile)
}

export function saveProvider(profile: {
  id: string
  name: string
  provider: AiProviderProfile['provider']
  model: string
  baseUrl: string | null
}): AiProviderProfile[] {
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO ai_providers (id, name, provider, model, base_url, encrypted_api_key, created_at, updated_at)
       VALUES (@id, @name, @provider, @model, @baseUrl, NULL, @now, @now)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         provider = excluded.provider,
         model = excluded.model,
         base_url = excluded.base_url,
         updated_at = excluded.updated_at`
    )
    .run({
      id: profile.id,
      name: profile.name.trim() || 'Untitled profile',
      provider: profile.provider,
      model: profile.model,
      baseUrl: profile.baseUrl,
      now
    })
  return listProviders()
}

export function deleteProvider(id: string): AiProviderProfile[] {
  getDb().prepare('DELETE FROM ai_providers WHERE id = ?').run(id)
  return listProviders()
}

export function setProviderApiKey(id: string, key: string): { ok: boolean; error?: string } {
  if (!safeStorage.isEncryptionAvailable()) {
    return {
      ok: false,
      error: "Secure storage isn't available on this system, so the API key can't be saved."
    }
  }
  const encrypted = safeStorage.encryptString(key).toString('base64')
  getDb()
    .prepare('UPDATE ai_providers SET encrypted_api_key = @key, updated_at = @updated WHERE id = @id')
    .run({ id, key: encrypted, updated: Date.now() })
  return { ok: true }
}

export function clearProviderApiKey(id: string): void {
  getDb()
    .prepare('UPDATE ai_providers SET encrypted_api_key = NULL, updated_at = @updated WHERE id = @id')
    .run({ id, updated: Date.now() })
}

export function getDecryptedApiKey(id: string): string | null {
  const row = getDb().prepare('SELECT * FROM ai_providers WHERE id = ?').get(id) as
    | AiProviderRow
    | undefined
  if (!row?.encrypted_api_key) return null
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(row.encrypted_api_key, 'base64'))
  } catch {
    return null
  }
}
```

Note there's no `ensureRow()` anymore — that existed only because there was
always supposed to be exactly one row. `saveProvider` is a straightforward
upsert (matching `saveEaScript`'s exact `ON CONFLICT` shape), and a profile
simply doesn't exist until something calls `saveProvider` for its id.

`getDecryptedApiKey(id)` stays exactly as security-sensitive as before:
main-process-only, never exported through IPC directly (Task 6's
`AI_TEST_CONNECTION` handler is the only caller).

- [ ] **Step 2: Delete the old repository**

```bash
rm src/main/ai/aiSettingsRepository.ts
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: still fails — `src/main/ipc.ts` still imports the now-deleted
`aiSettingsRepository.ts` and the now-gone `AiSettings` type. Expected;
fixed in Task 6.

- [ ] **Step 4: Commit**

```bash
git add src/main/ai/aiProvidersRepository.ts
git rm src/main/ai/aiSettingsRepository.ts
git commit -m "$(cat <<'EOF'
Replace aiSettingsRepository with aiProvidersRepository

List/save/delete/test-key operations over the new ai_providers
table, upserting by id the same way saveEaScript already does.
main/ipc.ts still points at the deleted file — fixed in the next
couple of tasks once IPC channels are renamed too.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Update the provider test-connection adapters' type reference

**Files:**
- Modify: `src/main/ai/providers.ts`

- [ ] **Step 1: Swap the type import and usage**

Find:

```ts
import type { AiSettings } from '@shared/types'
```

Replace with:

```ts
import type { AiProviderProfile } from '@shared/types'
```

Then find:

```ts
export async function testConnection(
  settings: Pick<AiSettings, 'provider' | 'baseUrl'>,
  apiKey: string | null
): Promise<TestConnectionResult> {
```

Replace with:

```ts
export async function testConnection(
  settings: Pick<AiProviderProfile, 'provider' | 'baseUrl'>,
  apiKey: string | null
): Promise<TestConnectionResult> {
```

Nothing else in this file changes — the three provider-specific adapter
functions and the switch statement's bodies are identical; only the type
being picked from is renamed.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: still fails — same remaining `main/ipc.ts` breakage as Task 3.
Expected; fixed in Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/main/ai/providers.ts
git commit -m "$(cat <<'EOF'
Point providers.ts at AiProviderProfile

Pure type-reference rename — testConnection's logic is unchanged,
it now picks 'provider'/'baseUrl' off AiProviderProfile instead of
the deleted AiSettings type.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Rename the IPC channel constants

**Files:**
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Rename the constants**

Find:

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

Replace with:

```ts
  DRAWINGS_CLEAR: 'drawings:clear',
  AI_LIST_PROVIDERS: 'ai:list-providers',
  AI_SAVE_PROVIDER: 'ai:save-provider',
  AI_SET_PROVIDER_API_KEY: 'ai:set-provider-api-key',
  AI_CLEAR_PROVIDER_API_KEY: 'ai:clear-provider-api-key',
  AI_DELETE_PROVIDER: 'ai:delete-provider',
  AI_TEST_CONNECTION: 'ai:test-connection',
  DB_PATH: 'db:path'
} as const
```

(`AI_TEST_CONNECTION`'s constant name and channel string stay the same —
only what argument it's called with changes, in Task 6.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: still fails — `main/ipc.ts` and `preload/index.ts` reference the
now-renamed-away constants (`IPC.AI_GET_SETTINGS` etc. no longer exist).
Expected; fixed in Tasks 6-7.

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc.ts
git commit -m "$(cat <<'EOF'
Rename AI settings IPC channels to the provider-list shape

get/save-settings -> list/save-provider, set/clear-api-key ->
set/clear-provider-api-key (now id-scoped), plus a new
delete-provider channel. test-connection keeps its name; only its
argument changes (Task 6).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Rewrite the IPC handlers

**Files:**
- Modify: `src/main/ipc.ts`

- [ ] **Step 1: Update the type import**

Find:

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

Replace with:

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

(`AiSettings` is gone; the handlers below don't need to name the profile
type directly, since `saveProvider`'s parameter type is inferred from
`aiProvidersRepository.ts`.)

- [ ] **Step 2: Update the repository import**

Find:

```ts
import {
  clearAiApiKey,
  getAiSettings,
  getDecryptedApiKey,
  saveAiSettings,
  setAiApiKey
} from './ai/aiSettingsRepository'
import { testConnection } from './ai/providers'
```

Replace with:

```ts
import {
  clearProviderApiKey,
  deleteProvider,
  getDecryptedApiKey,
  listProviders,
  saveProvider,
  setProviderApiKey
} from './ai/aiProvidersRepository'
import { testConnection } from './ai/providers'
```

- [ ] **Step 3: Rewrite the handlers**

Find:

```ts
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
```

Replace with:

```ts
  handle(IPC.AI_LIST_PROVIDERS, () => listProviders())

  handle(
    IPC.AI_SAVE_PROVIDER,
    (
      _e,
      profile: {
        id: string
        name: string
        provider: 'openai' | 'anthropic' | 'gemini' | 'custom'
        model: string
        baseUrl: string | null
      }
    ) => saveProvider(profile)
  )

  handle(IPC.AI_SET_PROVIDER_API_KEY, (_e, id: string, key: string) => setProviderApiKey(id, key))

  handle(IPC.AI_CLEAR_PROVIDER_API_KEY, (_e, id: string) => {
    clearProviderApiKey(id)
  })

  handle(IPC.AI_DELETE_PROVIDER, (_e, id: string) => deleteProvider(id))

  handle(IPC.AI_TEST_CONNECTION, async (_e, id: string) => {
    const profile = listProviders().find((p) => p.id === id)
    if (!profile) return { ok: false, message: 'Profile not found' }
    const apiKey = getDecryptedApiKey(id)
    return testConnection(profile, apiKey)
  })
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: still fails — `src/preload/index.ts` still references the old
`AiSettings` type and old `AI_*` constants. Expected; fixed in Task 7.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts
git commit -m "$(cat <<'EOF'
Rewrite AI IPC handlers for the provider-list shape

list/save/delete-provider mirror the ea_scripts handlers' shape
exactly (save/delete return the refreshed list). test-connection now
takes an id and looks up that specific profile instead of reading
"the" single settings row.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Update the preload `ai` namespace

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Update the type import**

Find:

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

Replace with:

```ts
import type {
  AiProviderProfile,
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

- [ ] **Step 2: Rewrite the `ai` namespace**

Find:

```ts
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
```

Replace with:

```ts
  ai: {
    listProviders: () => ipcRenderer.invoke(IPC.AI_LIST_PROVIDERS) as Promise<AiProviderProfile[]>,
    saveProvider: (profile: {
      id: string
      name: string
      provider: AiProviderProfile['provider']
      model: string
      baseUrl: string | null
    }) => ipcRenderer.invoke(IPC.AI_SAVE_PROVIDER, profile) as Promise<AiProviderProfile[]>,
    setProviderApiKey: (id: string, key: string) =>
      ipcRenderer.invoke(IPC.AI_SET_PROVIDER_API_KEY, id, key) as Promise<{
        ok: boolean
        error?: string
      }>,
    clearProviderApiKey: (id: string) =>
      ipcRenderer.invoke(IPC.AI_CLEAR_PROVIDER_API_KEY, id) as Promise<void>,
    deleteProvider: (id: string) =>
      ipcRenderer.invoke(IPC.AI_DELETE_PROVIDER, id) as Promise<AiProviderProfile[]>,
    testConnection: (id: string) =>
      ipcRenderer.invoke(IPC.AI_TEST_CONNECTION, id) as Promise<{ ok: boolean; message: string }>
  },
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: still fails — `src/renderer/src/store/useAiSettingsStore.ts` and
`src/renderer/src/components/AiProviderSettings.tsx` still call the old
`getSettings`/`saveSettings`/`setApiKey`/`clearApiKey` bridge methods, which
no longer exist. Expected; fixed in Tasks 8 and 10.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts
git commit -m "$(cat <<'EOF'
Rewrite the ai preload namespace for the provider-list shape

listProviders/saveProvider/deleteProvider return the refreshed list,
matching eaScripts' bridge shape. setProviderApiKey/
clearProviderApiKey/testConnection all now take an id.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Create the AI providers store

**Files:**
- Create: `src/renderer/src/store/useAiProvidersStore.ts`
- Delete: `src/renderer/src/store/useAiSettingsStore.ts`

- [ ] **Step 1: Write the new store**

Create `src/renderer/src/store/useAiProvidersStore.ts`:

```ts
import { create } from 'zustand'
import type { AiProviderProfile } from '@shared/types'
import { desktop } from '../lib/desktop'

function aiBridge() {
  return desktop()?.ai
}

interface TestResult {
  ok: boolean
  message: string
}

interface AiProvidersState {
  providers: AiProviderProfile[]
  testing: boolean
  testResult: TestResult | null
  loadProviders: () => Promise<void>
  saveProvider: (
    profile: {
      id: string
      name: string
      provider: AiProviderProfile['provider']
      model: string
      baseUrl: string | null
    },
    apiKey: string
  ) => Promise<void>
  deleteProvider: (id: string) => Promise<void>
  testConnection: (id: string) => Promise<void>
  clearTestResult: () => void
}

export const useAiProvidersStore = create<AiProvidersState>((set, get) => ({
  providers: [],
  testing: false,
  testResult: null,

  loadProviders: async () => {
    const providers = (await aiBridge()?.listProviders()) ?? []
    set({ providers })
  },

  saveProvider: async (profile, apiKey) => {
    await aiBridge()?.saveProvider(profile)
    let keyError: string | null = null
    if (apiKey.trim()) {
      const result = await aiBridge()?.setProviderApiKey(profile.id, apiKey.trim())
      if (result && !result.ok) keyError = result.error ?? 'Failed to save the API key'
    }
    const providers = (await aiBridge()?.listProviders()) ?? get().providers
    set({
      providers,
      testResult: keyError ? { ok: false, message: keyError } : null
    })
  },

  deleteProvider: async (id) => {
    const providers = (await aiBridge()?.deleteProvider(id)) ?? get().providers.filter((p) => p.id !== id)
    set({ providers })
  },

  testConnection: async (id) => {
    set({ testing: true, testResult: null })
    const result = (await aiBridge()?.testConnection(id)) ?? {
      ok: false,
      message: 'Not running in Electron'
    }
    set({ testing: false, testResult: result })
  },

  clearTestResult: () => {
    set({ testResult: null })
  }
}))
```

`saveProvider` surfaces a failed `setProviderApiKey` call (e.g. `safeStorage`
unavailable) through `testResult`, reusing the exact same
`.composer-hint[data-ok]` display the modal already has for test-connection
results — the design spec's edge case calls for the key-storage error to be
visible, not silently dropped.

`deleteProvider` and `loadProviders`/`saveProvider` all fall back to a
client-computed list if the Electron bridge is unavailable, matching
`useEaLabStore.ts`'s exact fallback pattern (`?? get().providers.filter(...)`).

`testResult` is a single shared field, not keyed per profile — without
`clearTestResult`, a stale result from testing Profile A would still be
showing when the modal opens for Profile B (or for a brand-new profile),
which the design spec explicitly says must not happen. Task 9's modal calls
`clearTestResult()` on mount so every modal open starts from a clean slate.

- [ ] **Step 2: Delete the old store**

```bash
rm src/renderer/src/store/useAiSettingsStore.ts
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: still fails — `src/renderer/src/components/AiProviderSettings.tsx`
still imports the just-deleted `useAiSettingsStore`. Expected; fixed in
Task 10.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/store/useAiProvidersStore.ts
git rm src/renderer/src/store/useAiSettingsStore.ts
git commit -m "$(cat <<'EOF'
Replace useAiSettingsStore with useAiProvidersStore

List-shaped state instead of a single settings object. Surfaces a
failed key-save (e.g. safeStorage unavailable) through testResult
instead of silently discarding it, per the design spec's edge case.
Also adds clearTestResult, since testResult is a single shared field
and Task 9's modal needs to reset it per profile to avoid showing a
stale result from a different profile. AiProviderSettings.tsx still
imports the deleted store — fixed next.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Create the AI provider add/edit modal

**Files:**
- Create: `src/renderer/src/components/AiProviderModal.tsx`

- [ ] **Step 1: Write the component**

Create `src/renderer/src/components/AiProviderModal.tsx`:

```tsx
import { useLayoutEffect, useState } from 'react'
import type { AiProviderProfile } from '@shared/types'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'
import { useAiProvidersStore } from '../store/useAiProvidersStore'

const PROVIDER_OPTIONS: { value: AiProviderProfile['provider']; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Claude (Anthropic)' },
  { value: 'gemini', label: 'Gemini (Google)' },
  { value: 'custom', label: 'Custom (OpenAI-compatible)' }
]

export function AiProviderModal({
  profile,
  onClose
}: {
  profile: AiProviderProfile | null
  onClose: () => void
}): React.JSX.Element {
  const saveProvider = useAiProvidersStore((s) => s.saveProvider)
  const testConnection = useAiProvidersStore((s) => s.testConnection)
  const testResult = useAiProvidersStore((s) => s.testResult)
  const testing = useAiProvidersStore((s) => s.testing)
  const clearTestResult = useAiProvidersStore((s) => s.clearTestResult)

  useLayoutEffect(() => {
    clearTestResult()
  }, [clearTestResult])

  const [id] = useState(() => profile?.id ?? crypto.randomUUID())
  const [name, setName] = useState(profile?.name ?? '')
  const [provider, setProvider] = useState<AiProviderProfile['provider']>(
    profile?.provider ?? 'openai'
  )
  const [model, setModel] = useState(profile?.model ?? '')
  const [baseUrl, setBaseUrl] = useState(profile?.baseUrl ?? '')
  const [apiKey, setApiKey] = useState('')

  async function handleSave(): Promise<void> {
    await saveProvider(
      { id, name, provider, model, baseUrl: provider === 'custom' ? baseUrl : null },
      apiKey
    )
    if (!useAiProvidersStore.getState().testResult) {
      onClose()
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-provider-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
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
            <h2 id="ai-provider-modal-title">{profile ? 'Edit profile' : 'Add profile'}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close">
            <Icon name="close" />
          </button>
        </header>

        <label className="field">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Work OpenAI"
            autoFocus
          />
        </label>

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
            placeholder={profile?.hasApiKey ? 'Key saved — leave blank to keep it' : 'sk-...'}
          />
        </label>

        {testResult ? (
          <p className="composer-hint" data-ok={testResult.ok}>
            {testResult.message}
          </p>
        ) : null}

        <div className="composer-actions">
          <button
            type="button"
            className="ghost"
            disabled={testing || !profile}
            title={profile ? undefined : 'Save this profile first, then test it'}
            onClick={() => void testConnection(id)}
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <button className="primary icon-label" type="submit">
            <Icon name="save" />
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
```

`id` is generated once via `useState(() => ...)` so it's stable across
re-renders but freshly random per mount — for an existing `profile` it reuses
that profile's real id (so Save updates the same row); for a new one
(`profile === null`) it's a brand-new id that `saveProvider` will insert on
first Save.

Test Connection is disabled until the profile has actually been saved once
(`!profile` — true for a brand-new, not-yet-saved profile) because
`ai:test-connection` looks a profile up by id in the database; there's
nothing to test until a row exists. This matches the previous single-form
screen's actual behavior, which also only ever tested the last *saved*
config, not unsaved in-progress edits — not a new limitation introduced here.

The `useLayoutEffect(() => { clearTestResult() }, [clearTestResult])` on
mount exists because `testResult` in `useAiProvidersStore` is a single
shared field, not keyed per profile — without this, testing Profile A,
closing the modal, then opening Profile B's modal would show A's stale
result until B is tested. This must be `useLayoutEffect`, not `useEffect`:
`useEffect` only guarantees running *after paint*, so the very first render
of a fresh mount would still read and briefly show Profile A's leftover
`testResult` before the effect clears it — a one-frame flash of the wrong
profile's message. `useLayoutEffect` runs synchronously before the browser
paints, so the clear (and the re-render it triggers) resolves before
anything is shown. Since this modal remounts fresh every time it opens
(it's only ever rendered while `modalTarget` is non-null in
`AiProviderSettings.tsx`, Task 10, which fully unmounts the modal before a
different profile's modal can open), clearing on mount is sufficient — no
need to clear on unmount too.

`handleSave` only calls `onClose()` when `useAiProvidersStore.getState().testResult`
is still `null` after the save resolves. `saveProvider` sets `testResult` to
a `{ok: false, message}` value specifically when `setProviderApiKey` fails
(e.g. `safeStorage.isEncryptionAvailable()` is `false`) — closing
unconditionally would unmount the modal (and the `.composer-hint` showing
that error) in the same tick it appears, so the user would never see it.
Reading `.getState()` directly (rather than the `testResult` variable
already destructured above) is deliberate: that variable is the value from
*this render*, captured before `saveProvider` ran, so it can't reflect a
result the save just produced — `.getState()` reads the store's true
current value at the moment `handleSave` checks it.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: still fails — the same pre-existing `AiProviderSettings.tsx`
breakage as Task 8 (not caused by this file, which isn't imported by
anything yet). Expected; fixed in Task 10.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/AiProviderModal.tsx
git commit -m "$(cat <<'EOF'
Add the AI provider add/edit modal

Reuses ReplayRangeModal's exact .modal-backdrop/.composer pattern.
Same fields as the old single form (Name is new), Test Connection
gated on the profile already being saved once — matching how testing
only ever reflected the last saved config, not unsaved edits, even
before this change. Clears testResult on mount (via useLayoutEffect,
not useEffect, to close the pre-paint gap) so a stale result from a
previously-tested profile can't flash into a different profile's
modal (testResult is a single shared field in the store). Only
closes on save if the save didn't produce a key-storage error, so a
failed safeStorage save stays visible instead of being unmounted
before the user can see it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Rewrite `AiProviderSettings` into a profile list

**Files:**
- Modify: `src/renderer/src/components/AiProviderSettings.tsx`

- [ ] **Step 1: Replace the whole file**

Replace the entire contents of `src/renderer/src/components/AiProviderSettings.tsx` with:

```tsx
import { useEffect, useState } from 'react'
import type { AiProviderProfile } from '@shared/types'
import { AiProviderModal } from './AiProviderModal'
import { ConfirmIconButton } from './ConfirmIconButton'
import { Icon } from './Icon'
import { useAiProvidersStore } from '../store/useAiProvidersStore'

const PROVIDER_BADGE_LABELS: Record<AiProviderProfile['provider'], string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  custom: 'Custom'
}

export function AiProviderSettings(): React.JSX.Element {
  const providers = useAiProvidersStore((s) => s.providers)
  const loadProviders = useAiProvidersStore((s) => s.loadProviders)
  const deleteProvider = useAiProvidersStore((s) => s.deleteProvider)

  const [modalTarget, setModalTarget] = useState<AiProviderProfile | 'new' | null>(null)

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  return (
    <div className="composer">
      <header>
        <div>
          <span className="stamp">AI</span>
          <h2>AI provider profiles</h2>
        </div>
        <button type="button" className="ghost icon-label" onClick={() => setModalTarget('new')}>
          <Icon name="plus" />
          Add profile
        </button>
      </header>

      {providers.length === 0 ? (
        <p className="provider-empty">No AI providers configured yet.</p>
      ) : (
        <ul className="provider-list">
          {providers.map((p) => (
            <li key={p.id} className="provider-row">
              <div className="provider-row-info">
                <div className="provider-row-title">
                  <strong>{p.name}</strong>
                  <span className="provider-badge">{PROVIDER_BADGE_LABELS[p.provider]}</span>
                </div>
                <span>{p.model}</span>
              </div>
              <div className="provider-row-actions">
                <button
                  type="button"
                  className="icon-btn"
                  title="Edit"
                  aria-label={`Edit ${p.name}`}
                  onClick={() => setModalTarget(p)}
                >
                  <Icon name="edit" />
                </button>
                <ConfirmIconButton
                  icon="trash"
                  label="Delete profile"
                  confirmLabel={`Click again to delete ${p.name}`}
                  onConfirm={() => void deleteProvider(p.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {modalTarget ? (
        <AiProviderModal
          profile={modalTarget === 'new' ? null : modalTarget}
          onClose={() => setModalTarget(null)}
        />
      ) : null}
    </div>
  )
}
```

This is a full rewrite, not a patch — the old file's single-form content
(Provider/Model/Base URL/API key fields, Test Connection/Save buttons) is
gone from this file entirely; that same form now lives in
`AiProviderModal.tsx` (Task 9), and this file is just the list + modal
trigger.

The badge lives in its own `.provider-row-title` wrapper alongside `<strong>`,
not inside it — if the badge were nested inside `<strong>` (which Task 11's
CSS truncates with `text-overflow: ellipsis`), a long profile name plus the
badge could overflow the row's width and the ellipsis would clip into or
hide the badge instead of just shortening the name. Keeping them as
siblings inside a flex row lets only the name truncate while the badge
(`flex-shrink: 0` in Task 11's CSS) always stays fully visible.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors. This is the task that finally makes the whole codebase
consistent again — every file touched since Task 1 should now resolve.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/AiProviderSettings.tsx
git commit -m "$(cat <<'EOF'
Rewrite AiProviderSettings as a profile list

Replaces the single form with a list of profile rows (name,
provider badge, model) plus edit/delete per row and an "Add profile"
button, using ConfirmIconButton for delete the same way EaLab already
does for scripts. The actual add/edit form now lives in the new
AiProviderModal. Name and badge sit in their own row-title wrapper
rather than nesting the badge inside the truncated <strong>, so a
long name's ellipsis can't clip into the badge. This is the last
file in the chain — the whole codebase typechecks again as of this
commit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Style the provider list

**Files:**
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Add the new CSS rules**

Find:

```css
.appearance-swatch[data-theme='light'] {
  background: linear-gradient(135deg, #f4f5f7 0%, #ffffff 100%);
}
```

Replace with:

```css
.appearance-swatch[data-theme='light'] {
  background: linear-gradient(135deg, #f4f5f7 0%, #ffffff 100%);
}

.provider-empty {
  color: var(--muted);
  font-size: 12px;
  text-align: center;
  padding: 24px 8px;
}

.provider-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.provider-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, var(--bar-from) 0%, var(--bar-to) 100%);
}

.provider-row-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.provider-row-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.provider-row-title strong {
  font-size: 13px;
  color: var(--parchment);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.provider-row-info span {
  font-size: 11.5px;
  color: var(--muted);
}

.provider-badge {
  display: inline-block;
  flex-shrink: 0;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 7px;
  border-radius: 10px;
  background: var(--gold-soft);
  color: var(--gold);
}

.provider-row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
```

`.provider-badge` moved from `.provider-row-info strong` to its own
`.provider-row-title strong` (name only) + sibling `.provider-badge`
(`flex-shrink: 0`) — this matches Task 10's markup, which wraps the name
and badge in a `.provider-row-title` flex row instead of nesting the badge
inside the truncated `<strong>`. Without this, a long profile name's
ellipsis could clip into or hide the badge instead of just shortening the
name.

(No typecheck applies — CSS isn't typechecked. Verified visually in Task 12.)

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/styles/global.css
git commit -m "$(cat <<'EOF'
Style the AI provider list

Row/badge/empty-state CSS for AiProviderSettings' new list view,
following the same token-based card formula as .appearance-card and
.pair-card (border/gradient/radius), placed right after the
Appearance category's CSS it now sits alongside in the same panel.
The badge is a flex-shrink:0 sibling of the name, not nested inside
its truncated <strong>, so a long name's ellipsis can't clip the
badge.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all 104 existing tests pass (this plan touches no `@core`/`@shared`
domain logic covered by the test suite).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: `electron-vite build` completes with no errors.

- [ ] **Step 4: Headless backend verification**

No component-test harness exists in this codebase, and this environment
cannot drive or screenshot the actual GUI (documented limitation from the
prior AI settings sub-project's own verification). Verify the same way that
sub-project's backend logic was verified: write a throwaway script (in a
scratch directory, not committed) that runs under the real Electron binary
(no `ELECTRON_RUN_AS_NODE`, no window created) against a temp SQLite dir,
importing `aiProvidersRepository.ts` and `providers.ts` directly. Confirm:

- Two different profiles (`saveProvider` with two different ids) both list
  correctly via `listProviders()`.
- Each has an independent encrypted key (`setProviderApiKey`) that
  round-trips through `getDecryptedApiKey` correctly and independently —
  setting/clearing one profile's key must not affect the other's.
- Both survive a simulated relaunch (close and reopen the DB connection).
- `deleteProvider` on one profile leaves the other fully intact.
- `testConnection` (via `providers.ts`, called with a specific profile's
  `provider`/`baseUrl` and that profile's own decrypted key) actually
  targets the right profile — e.g. give the two profiles different (bogus)
  keys and confirm the failure message/behavior corresponds to the one
  being tested, not the other.

Delete the scratch script and its temp DB directory when done.

- [ ] **Step 5: Manual UI pass**

Flagged as a gap, not something to attempt in this environment: run
`npm run dev`, open Settings → AI Provider, and confirm — the empty state
renders with "No AI providers configured yet" and an "Add profile" button;
adding a profile opens the modal, saving it closes the modal and shows it in
the list with the right provider badge and model; clicking a row's edit icon
reopens the modal prefilled with that profile's saved values (API key field
shows the "Key saved" placeholder, not the real key); the delete button
requires a second click to confirm before removing a row; Test Connection
inside the modal works for an already-saved profile and is disabled for a
brand-new unsaved one. Check both themes.

- [ ] **Step 6: Report**

No commit needed for this task (verification only) unless Step 4 or 5
surfaces a bug — if either does, fix the relevant file, re-run the relevant
checks above, and commit the fix with a description of what was wrong.
