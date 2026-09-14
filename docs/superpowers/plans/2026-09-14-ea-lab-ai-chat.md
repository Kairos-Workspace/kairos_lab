# EA Lab AI Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Cursor-style AI chat panel in the EA Lab — a third column next to the script list and Monaco editor — where the user prompts one of their saved AI provider profiles to write or modify the active EA script, with conversation history persisted per script and AI code blocks offering Copy/Apply-to-editor actions.

**Architecture:** Same layered pattern as every other feature in this app (SQLite table → repository → IPC constants → main-process handlers → preload namespace → renderer store → components). Extends `src/main/ai/providers.ts` with real chat-sending functions per provider (parallel to its existing test-connection functions), adds a `ea_chat_messages` table scoped per script, and adds a third grid column to EA Lab's existing two-column layout.

**Tech Stack:** Electron + React (renderer), SQLite via `better-sqlite3`, the global `fetch` available in Electron's main process (no new dependencies), Zustand, plain CSS.

**Spec:** `docs/superpowers/specs/2026-09-14-ea-lab-ai-chat-design.md`

---

### Task 1: Add the `EaChatMessage` shared type

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add the type**

Find:

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

export interface EaChatMessage {
  id: string
  scriptId: string
  role: 'user' | 'assistant'
  content: string
  providerId: string | null
  createdAt: number
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "$(cat <<'EOF'
Add EaChatMessage shared type

One row per chat turn (user prompt or AI reply), scoped to a script
by id. providerId records which saved profile answered an assistant
message (null for user messages) — not surfaced in the UI yet, but
worth capturing now rather than needing a migration later.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Add the `ea_chat_messages` table

**Files:**
- Modify: `src/main/database/schema.ts`

- [ ] **Step 1: Add the table and index**

Find:

```sql
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

Replace with:

```sql
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

CREATE TABLE IF NOT EXISTS ea_chat_messages (
  id TEXT PRIMARY KEY,
  script_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  provider_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (script_id) REFERENCES ea_scripts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ea_chat_messages_script ON ea_chat_messages(script_id);
`
```

`script_id` uses a real `FOREIGN KEY ... ON DELETE CASCADE` to
`ea_scripts(id)` — this schema already enforces FKs (`PRAGMA foreign_keys
= ON` in `db.ts`) and already cascades for the exact same shape of
relationship elsewhere (`trades.session_id`/`annotations.session_id` →
`sessions(id)`, `candles.dataset_id`/`data_gaps.dataset_id` →
`datasets(id)`) — a chat message has no independent meaning without its
script, same as those rows without their parent. `provider_id` has no FK:
it references a swappable config profile, not an owning parent, matching
`sessions.strategy_id`'s precedent — a dangling `provider_id` after a
profile is deleted is harmless.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/database/schema.ts
git commit -m "$(cat <<'EOF'
Add ea_chat_messages table

One row per chat turn, indexed by script_id since every query filters
on it. script_id cascades on delete from ea_scripts, matching how
trades/annotations already cascade from sessions — a chat message
has no independent meaning without its script. The script's own code
is never stored here — every chat request builds its context fresh
from whatever's currently in the editor (Task 6), so this table only
grows with the human-readable conversation, not duplicated script
content.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Create the EA chat repository

**Files:**
- Create: `src/main/ai/chatRepository.ts`

- [ ] **Step 1: Write the repository**

Create `src/main/ai/chatRepository.ts`:

```ts
import { randomUUID } from 'node:crypto'
import type { EaChatMessage } from '@shared/types'
import { getDb } from '../database/db'

interface EaChatMessageRow {
  id: string
  script_id: string
  role: string
  content: string
  provider_id: string | null
  created_at: number
}

function toMessage(row: EaChatMessageRow): EaChatMessage {
  return {
    id: row.id,
    scriptId: row.script_id,
    role: row.role as EaChatMessage['role'],
    content: row.content,
    providerId: row.provider_id,
    createdAt: row.created_at
  }
}

export function listChatMessages(scriptId: string): EaChatMessage[] {
  const rows = getDb()
    .prepare('SELECT * FROM ea_chat_messages WHERE script_id = ? ORDER BY created_at ASC')
    .all(scriptId) as EaChatMessageRow[]
  return rows.map(toMessage)
}

export function saveChatMessage(message: {
  scriptId: string
  role: EaChatMessage['role']
  content: string
  providerId: string | null
}): EaChatMessage {
  const row: EaChatMessageRow = {
    id: randomUUID(),
    script_id: message.scriptId,
    role: message.role,
    content: message.content,
    provider_id: message.providerId,
    created_at: Date.now()
  }
  getDb()
    .prepare(
      `INSERT INTO ea_chat_messages (id, script_id, role, content, provider_id, created_at)
       VALUES (@id, @script_id, @role, @content, @provider_id, @created_at)`
    )
    .run(row)
  return toMessage(row)
}

export function clearChat(scriptId: string): void {
  getDb().prepare('DELETE FROM ea_chat_messages WHERE script_id = ?').run(scriptId)
}
```

`randomUUID` from `node:crypto` matches the exact convention
`src/main/database/repositories.ts`'s `newSessionId()` already uses for
main-process id generation — not `crypto.randomUUID()` as a bare global.
`saveChatMessage` generates its own id and `created_at` and returns the
full row, so callers (Task 6) never need to construct an `EaChatMessage`
by hand.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/ai/chatRepository.ts
git commit -m "$(cat <<'EOF'
Add the EA chat repository

list/save/clear over ea_chat_messages, id generation via node:crypto's
randomUUID matching the existing newSessionId() convention in
database/repositories.ts.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Add chat-sending functions to the provider adapters

**Files:**
- Modify: `src/main/ai/providers.ts`

- [ ] **Step 1: Add the chat types and per-provider senders**

Find:

```ts
export async function testConnection(
  settings: Pick<AiProviderProfile, 'provider' | 'baseUrl'>,
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

Replace with:

```ts
export async function testConnection(
  settings: Pick<AiProviderProfile, 'provider' | 'baseUrl'>,
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

export interface ChatResult {
  ok: boolean
  reply?: string
  message?: string
}

export interface ChatHistoryEntry {
  role: 'user' | 'assistant'
  content: string
}

async function sendOpenAiCompatibleChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ChatHistoryEntry[]
): Promise<ChatResult> {
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...history]
      })
    })
    if (!res.ok) return { ok: false, message: `Request failed (${res.status})` }
    const data = await res.json()
    const reply = data.choices?.[0]?.message?.content
    if (typeof reply !== 'string') return { ok: false, message: 'No reply in response' }
    return { ok: true, reply }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Network error' }
  }
}

async function sendAnthropicChat(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ChatHistoryEntry[]
): Promise<ChatResult> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: history
      })
    })
    if (!res.ok) return { ok: false, message: `Request failed (${res.status})` }
    const data = await res.json()
    const reply = data.content?.[0]?.text
    if (typeof reply !== 'string') return { ok: false, message: 'No reply in response' }
    return { ok: true, reply }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Network error' }
  }
}

async function sendGeminiChat(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ChatHistoryEntry[]
): Promise<ChatResult> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: history.map((entry) => ({
            role: entry.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: entry.content }]
          }))
        })
      }
    )
    if (!res.ok) return { ok: false, message: `Request failed (${res.status})` }
    const data = await res.json()
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof reply !== 'string') return { ok: false, message: 'No reply in response' }
    return { ok: true, reply }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Network error' }
  }
}

export async function sendChatMessage(
  profile: Pick<AiProviderProfile, 'provider' | 'baseUrl' | 'model'>,
  apiKey: string | null,
  systemPrompt: string,
  history: ChatHistoryEntry[]
): Promise<ChatResult> {
  if (!apiKey) return { ok: false, message: 'No API key configured' }
  switch (profile.provider) {
    case 'openai':
      return sendOpenAiCompatibleChat(
        'https://api.openai.com/v1',
        apiKey,
        profile.model,
        systemPrompt,
        history
      )
    case 'anthropic':
      return sendAnthropicChat(apiKey, profile.model, systemPrompt, history)
    case 'gemini':
      return sendGeminiChat(apiKey, profile.model, systemPrompt, history)
    case 'custom':
      if (!profile.baseUrl) return { ok: false, message: 'No base URL configured' }
      return sendOpenAiCompatibleChat(
        profile.baseUrl.replace(/\/$/, ''),
        apiKey,
        profile.model,
        systemPrompt,
        history
      )
    default:
      return { ok: false, message: 'Unknown provider' }
  }
}
```

Per-provider request shapes (confirmed against each provider's current
docs during design, not assumed from memory):

- **OpenAI/Custom**: `POST {baseUrl}/chat/completions`, `messages` array
  includes the system prompt as `role: 'system'`. Reply at
  `.choices[0].message.content`.
- **Anthropic**: `system` is a *top-level* field, separate from `messages`
  — not part of the messages array like OpenAI. `max_tokens` is required.
  Reply at `.content[0].text`.
- **Gemini**: uses `system_instruction: { parts: [{ text }] }` (snake_case,
  sibling to `contents`) and `'model'` instead of `'assistant'` for its own
  turns in `contents` — the one real structural difference from the other
  three providers. Reply at `.candidates[0].content.parts[0].text`.

Each function catches network/parse errors the same way the existing
`test*` functions do, so `sendChatMessage`'s caller never needs its own
try/catch.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/ai/providers.ts
git commit -m "$(cat <<'EOF'
Add per-provider chat-sending functions

sendChatMessage + one sender per provider, parallel in structure to
the existing testOpenAiCompatible/testAnthropic/testGemini functions
this file already had. This is the "next sub-project extends this
same file with real chat-sending functions" the original AI settings
design doc anticipated.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Add IPC channel constants

**Files:**
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Add the constants**

Find:

```ts
  AI_LIST_PROVIDERS: 'ai:list-providers',
  AI_SAVE_PROVIDER: 'ai:save-provider',
  AI_SET_PROVIDER_API_KEY: 'ai:set-provider-api-key',
  AI_CLEAR_PROVIDER_API_KEY: 'ai:clear-provider-api-key',
  AI_DELETE_PROVIDER: 'ai:delete-provider',
  AI_TEST_CONNECTION: 'ai:test-connection',
  DB_PATH: 'db:path'
```

Replace with:

```ts
  AI_LIST_PROVIDERS: 'ai:list-providers',
  AI_SAVE_PROVIDER: 'ai:save-provider',
  AI_SET_PROVIDER_API_KEY: 'ai:set-provider-api-key',
  AI_CLEAR_PROVIDER_API_KEY: 'ai:clear-provider-api-key',
  AI_DELETE_PROVIDER: 'ai:delete-provider',
  AI_TEST_CONNECTION: 'ai:test-connection',
  AI_LIST_CHAT_MESSAGES: 'ai:list-chat-messages',
  AI_SEND_CHAT_MESSAGE: 'ai:send-chat-message',
  AI_CLEAR_CHAT: 'ai:clear-chat',
  DB_PATH: 'db:path'
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc.ts
git commit -m "$(cat <<'EOF'
Add EA chat IPC channel constants

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Add the IPC handlers

**Files:**
- Modify: `src/main/ipc.ts`

- [ ] **Step 1: Update the repository import**

Find:

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
import { clearChat, listChatMessages, saveChatMessage } from './ai/chatRepository'
import { sendChatMessage, testConnection } from './ai/providers'
```

- [ ] **Step 2: Add the handlers**

Find:

````ts
  handle(IPC.AI_TEST_CONNECTION, async (_e, id: string) => {
    const profile = listProviders().find((p) => p.id === id)
    if (!profile) return { ok: false, message: 'Profile not found' }
    const apiKey = getDecryptedApiKey(id)
    return testConnection(profile, apiKey)
  })

  handle(IPC.PREFS_LOAD, () => loadDeskPrefs())
````

Replace with:

````ts
  handle(IPC.AI_TEST_CONNECTION, async (_e, id: string) => {
    const profile = listProviders().find((p) => p.id === id)
    if (!profile) return { ok: false, message: 'Profile not found' }
    const apiKey = getDecryptedApiKey(id)
    return testConnection(profile, apiKey)
  })

  handle(IPC.AI_LIST_CHAT_MESSAGES, (_e, scriptId: string) => listChatMessages(scriptId))

  handle(
    IPC.AI_SEND_CHAT_MESSAGE,
    async (
      _e,
      payload: { scriptId: string; providerId: string; currentCode: string; message: string }
    ) => {
      const profile = listProviders().find((p) => p.id === payload.providerId)
      if (!profile) return { ok: false, message: 'Profile not found' }
      const apiKey = getDecryptedApiKey(payload.providerId)
      const history = listChatMessages(payload.scriptId).map((m) => ({
        role: m.role,
        content: m.content
      }))
      const fence = '```'
      const systemPrompt = [
        'You are helping the user write an MQL5 Expert Advisor script for MetaTrader.',
        '',
        'Current script content:',
        '',
        fence,
        payload.currentCode,
        fence,
        '',
        'When you provide a full updated version of the script, respond with the',
        'complete file in a single fenced code block.'
      ].join('\n')
      const result = await sendChatMessage(profile, apiKey, systemPrompt, [
        ...history,
        { role: 'user', content: payload.message }
      ])
      if (!result.ok || !result.reply) {
        return { ok: false, message: result.message ?? 'No reply from the AI' }
      }
      try {
        saveChatMessage({
          scriptId: payload.scriptId,
          role: 'user',
          content: payload.message,
          providerId: null
        })
        saveChatMessage({
          scriptId: payload.scriptId,
          role: 'assistant',
          content: result.reply,
          providerId: payload.providerId
        })
      } catch {
        return {
          ok: false,
          message: 'This script no longer exists — the reply could not be saved.'
        }
      }
      return { ok: true, messages: listChatMessages(payload.scriptId) }
    }
  )

  handle(IPC.AI_CLEAR_CHAT, (_e, scriptId: string) => {
    clearChat(scriptId)
    return listChatMessages(scriptId)
  })

  handle(IPC.PREFS_LOAD, () => loadDeskPrefs())
````

`fence` is a plain `const` holding three literal backtick characters,
reused for both the opening and closing fence around the current script
content in the system prompt — a single-quoted JS string doesn't need its
interior backticks escaped, and pulling it into one named constant avoids
writing the same three-backtick literal out twice inline.

The two `saveChatMessage` calls are wrapped in a `try`/`catch` because
`script_id` is a real, enforced FK to `ea_scripts(id)` (Task 2) — between
this handler's earlier read and this point, an `await sendChatMessage(...)`
network round-trip has elapsed, which is real time for the script to have
been deleted elsewhere (another window, a race). Every other failure path
in this handler already returns a friendly `{ ok: false, message }` instead
of letting an error propagate raw to the renderer; this closes the one gap
that didn't, and it's the one handler in this codebase with a meaningfully
wide async gap between an FK's implicit existence check and its write —
without this, a user could pay for a real API call whose reply then
silently vanishes if their script was deleted in the meantime.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc.ts
git commit -m "$(cat <<'EOF'
Add EA chat IPC handlers

list-chat-messages, send-chat-message (builds a system prompt from
whatever's currently in the editor, sends it plus history to the
selected provider, persists both the user message and the reply on
success, persists nothing on failure), and clear-chat. Wraps the
save step in try/catch: script_id is a real FK to ea_scripts, and a
network round-trip elapses beforehand, so a script deleted mid-flight
would otherwise throw an uncaught FK error after a real API call
already succeeded.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Add the preload chat methods

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add the type import**

Find:

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

Replace with:

```ts
import type {
  AiProviderProfile,
  BacktestSession,
  DatasetInfo,
  DeskPrefs,
  Drawing,
  EaChatMessage,
  EaScript,
  SavedStrategy,
  Timeframe,
  Trade
} from '../shared/types'
```

- [ ] **Step 2: Add the chat methods to the `ai` namespace**

Find:

```ts
    testConnection: (id: string) =>
      ipcRenderer.invoke(IPC.AI_TEST_CONNECTION, id) as Promise<{ ok: boolean; message: string }>
  },
```

Replace with:

```ts
    testConnection: (id: string) =>
      ipcRenderer.invoke(IPC.AI_TEST_CONNECTION, id) as Promise<{ ok: boolean; message: string }>,
    listChatMessages: (scriptId: string) =>
      ipcRenderer.invoke(IPC.AI_LIST_CHAT_MESSAGES, scriptId) as Promise<EaChatMessage[]>,
    sendChatMessage: (payload: {
      scriptId: string
      providerId: string
      currentCode: string
      message: string
    }) =>
      ipcRenderer.invoke(IPC.AI_SEND_CHAT_MESSAGE, payload) as Promise<
        { ok: true; messages: EaChatMessage[] } | { ok: false; message: string }
      >,
    clearChat: (scriptId: string) =>
      ipcRenderer.invoke(IPC.AI_CLEAR_CHAT, scriptId) as Promise<EaChatMessage[]>
  },
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts
git commit -m "$(cat <<'EOF'
Add EA chat methods to the ai preload namespace

listChatMessages/sendChatMessage/clearChat, matching the IPC handlers
added in the previous task. sendChatMessage's return type is a
discriminated union so the renderer can tell a real failure apart
from a successful (possibly empty) message list.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Create the EA chat store

**Files:**
- Create: `src/renderer/src/store/useEaChatStore.ts`

- [ ] **Step 1: Write the store**

Create `src/renderer/src/store/useEaChatStore.ts`:

```ts
import { create } from 'zustand'
import type { EaChatMessage } from '@shared/types'
import { desktop } from '../lib/desktop'
import { useAiProvidersStore } from './useAiProvidersStore'

function aiBridge() {
  return desktop()?.ai
}

interface EaChatState {
  messages: EaChatMessage[]
  sending: boolean
  error: string | null
  selectedProviderId: string | null
  loadMessages: (scriptId: string) => Promise<void>
  setSelectedProviderId: (id: string) => void
  sendMessage: (scriptId: string, currentCode: string, text: string) => Promise<void>
  clearChat: (scriptId: string) => Promise<void>
}

export const useEaChatStore = create<EaChatState>((set, get) => ({
  messages: [],
  sending: false,
  error: null,
  selectedProviderId: null,

  loadMessages: async (scriptId) => {
    const messages = (await aiBridge()?.listChatMessages(scriptId)) ?? []
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    const fallback = useAiProvidersStore.getState().providers[0]?.id ?? null
    set({ messages, error: null, selectedProviderId: lastAssistant?.providerId ?? fallback })
  },

  setSelectedProviderId: (id) => {
    set({ selectedProviderId: id, error: null })
  },

  sendMessage: async (scriptId, currentCode, text) => {
    const providerId = get().selectedProviderId
    if (!providerId) {
      set({ error: 'Add an AI provider in Settings first' })
      return
    }
    set({ sending: true, error: null })
    const result = await aiBridge()?.sendChatMessage({
      scriptId,
      providerId,
      currentCode,
      message: text
    })
    if (!result || !result.ok) {
      const stillExists = useAiProvidersStore
        .getState()
        .providers.some((p) => p.id === providerId)
      set({
        sending: false,
        error: result?.message ?? 'Not running in Electron',
        selectedProviderId: stillExists
          ? providerId
          : (useAiProvidersStore.getState().providers[0]?.id ?? null)
      })
      return
    }
    set({ sending: false, messages: result.messages, error: null })
  },

  clearChat: async (scriptId) => {
    const messages = (await aiBridge()?.clearChat(scriptId)) ?? []
    set({ messages, error: null })
  }
}))
```

`loadMessages` picks a sensible default provider: whichever profile
answered the most recent assistant message in this script's history, or
the first saved profile if there's no history yet. `sendMessage` refuses
to run (with a clear inline error, not a silent no-op) if no provider is
selected — this can only happen if the user has zero saved profiles, since
`loadMessages` always picks one when any exist.

If the selected provider was deleted (in Settings, mid-session) between
being selected and a send attempt, `sendChatMessage`'s IPC call fails with
`{ok: false, message: 'Profile not found'}` — `sendMessage`'s failure
branch checks whether `selectedProviderId` still exists in
`useAiProvidersStore`'s current list, and if not, falls back to the first
remaining provider (or `null` if none are left) instead of leaving the
store permanently pointed at a provider that no longer exists, which would
otherwise repeat the same failure on every subsequent send with no way
back to a working state. `setSelectedProviderId` also clears `error`, so
picking a different provider after a failure doesn't leave a stale error
message on screen for a provider that's no longer selected.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/store/useEaChatStore.ts
git commit -m "$(cat <<'EOF'
Add the EA chat store

messages/sending/error/selectedProviderId over the new chat IPC
bridge. Defaults the selected provider to whichever profile answered
this script's last message, falling back to the first saved profile.
Self-heals if the selected provider is deleted mid-session (falls
back to another provider instead of repeating "Profile not found"
forever), and setSelectedProviderId clears any stale error.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Add a `chat` icon

**Files:**
- Modify: `src/renderer/src/components/Icon.tsx`

- [ ] **Step 1: Add `chat` to `IconName`**

Find:

```ts
  | 'home'
  | 'settings'
```

Replace with:

```ts
  | 'home'
  | 'settings'
  | 'chat'
```

- [ ] **Step 2: Add the path**

Find:

```ts
  settings:
    'M4 6h16M6.5 6a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M4 12h16M12.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M4 18h16M8.5 18a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0'
}
```

Replace with:

```ts
  settings:
    'M4 6h16M6.5 6a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M4 12h16M12.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M4 18h16M8.5 18a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0',
  chat: 'M4 4h16v12H8l-4 4V4z'
}
```

A simple rounded speech-bubble outline with a tail, matching the existing
icon set's plain-line-art style (one closed path, same as `save`'s icon).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/Icon.tsx
git commit -m "$(cat <<'EOF'
Add chat icon

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Create the code-block extraction helper

**Files:**
- Create: `src/renderer/src/lib/extractCodeBlocks.ts`

- [ ] **Step 1: Write the helper**

Create `src/renderer/src/lib/extractCodeBlocks.ts`:

````ts
export interface ChatContentSegment {
  type: 'text' | 'code'
  content: string
}

export function extractCodeBlocks(content: string): ChatContentSegment[] {
  const segments: ChatContentSegment[] = []
  // Requires a closing fence — an unclosed one (e.g. a reply truncated by the
  // provider's token limit) intentionally falls back to a single plain-text
  // segment (stray backticks and all) rather than guessing at the boundary.
  const fence = /```[^\n]*\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = fence.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'code', content: match[1].trimEnd() })
    lastIndex = fence.lastIndex
  }
  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) })
  }
  return segments
}
````

Splits an assistant message's raw text on fenced code blocks (an optional
language tag after the opening `` ``` `` is matched and discarded — this
app doesn't need to know the language, code blocks always render the same
way). Handles zero, one, or multiple fenced blocks in a single message —
no assumption that the AI returns exactly one.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/lib/extractCodeBlocks.ts
git commit -m "$(cat <<'EOF'
Add extractCodeBlocks helper

Splits chat message text into text/code segments on triple-backtick
fences, for rendering code blocks with Copy/Apply actions separately
from surrounding prose.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Create the chat panel component

**Files:**
- Create: `src/renderer/src/components/EaChatPanel.tsx`

- [ ] **Step 1: Write the component**

Create `src/renderer/src/components/EaChatPanel.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'
import { extractCodeBlocks } from '../lib/extractCodeBlocks'
import { useAiProvidersStore } from '../store/useAiProvidersStore'
import { useEaChatStore } from '../store/useEaChatStore'
import { useEaLabStore } from '../store/useEaLabStore'

export function EaChatPanel(): React.JSX.Element {
  const activeScriptId = useEaLabStore((s) => s.activeScriptId)
  const draftCode = useEaLabStore((s) => s.draftCode)
  const updateDraftCode = useEaLabStore((s) => s.updateDraftCode)

  const providers = useAiProvidersStore((s) => s.providers)
  const loadProviders = useAiProvidersStore((s) => s.loadProviders)

  const messages = useEaChatStore((s) => s.messages)
  const sending = useEaChatStore((s) => s.sending)
  const error = useEaChatStore((s) => s.error)
  const selectedProviderId = useEaChatStore((s) => s.selectedProviderId)
  const loadMessages = useEaChatStore((s) => s.loadMessages)
  const setSelectedProviderId = useEaChatStore((s) => s.setSelectedProviderId)
  const sendMessage = useEaChatStore((s) => s.sendMessage)
  const clearChat = useEaChatStore((s) => s.clearChat)

  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  useEffect(() => {
    if (activeScriptId) void loadMessages(activeScriptId)
  }, [activeScriptId, loadMessages])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  async function handleSend(): Promise<void> {
    const text = input.trim()
    if (!text || !activeScriptId) return
    setInput('')
    await sendMessage(activeScriptId, draftCode, text)
  }

  const providerOptions = providers.map((p) => ({ value: p.id, label: p.name }))

  return (
    <div className="ea-chat-panel">
      <div className="ea-chat-header">
        <span className="stamp">AI Chat</span>
        {providers.length > 0 ? (
          <Dropdown
            ariaLabel="AI provider"
            value={selectedProviderId ?? providers[0].id}
            onChange={setSelectedProviderId}
            options={providerOptions}
          />
        ) : null}
        <button
          type="button"
          className="icon-btn"
          title="New chat"
          aria-label="New chat"
          onClick={() => activeScriptId && void clearChat(activeScriptId)}
        >
          <Icon name="reset" />
        </button>
      </div>

      {providers.length === 0 ? (
        <p className="ea-chat-empty">Add an AI provider in Settings to start chatting.</p>
      ) : (
        <>
          <div className="ea-chat-messages" ref={listRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={m.role === 'user' ? 'ea-chat-msg-user' : 'ea-chat-msg-assistant'}
              >
                {extractCodeBlocks(m.content).map((segment, i) =>
                  segment.type === 'code' && segment.content.trim() ? (
                    <div key={i} className="ea-chat-code-block">
                      <pre>{segment.content}</pre>
                      <div className="ea-chat-code-actions">
                        <button
                          type="button"
                          onClick={() => void navigator.clipboard.writeText(segment.content)}
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          className="ea-chat-apply-btn"
                          onClick={() => updateDraftCode(segment.content)}
                        >
                          Apply to editor
                        </button>
                      </div>
                    </div>
                  ) : segment.type === 'text' && segment.content.trim() ? (
                    <p key={i}>{segment.content}</p>
                  ) : null
                )}
              </div>
            ))}
          </div>

          {error ? (
            <p className="composer-hint" data-ok="false">
              {error}
            </p>
          ) : null}

          <form
            className="ea-chat-input-row"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSend()
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the AI to write or edit this EA…"
              disabled={sending || !activeScriptId}
            />
            <button
              type="submit"
              className="primary"
              disabled={sending || !activeScriptId || !input.trim()}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}
```

"Apply to editor" calls `updateDraftCode`, the same action typing in the
Monaco editor itself already calls — this marks the script `dirty` and
updates the controlled `Editor`'s `value` prop, but does **not** save it.
The user still clicks the existing Save button to persist it, same as any
other edit — AI-generated code doesn't get a silent bypass around the
normal save step. "New chat" (the reset icon) clears immediately, no
confirmation — it only clears the conversation, not the script's actual
code, so it doesn't need the same "click twice" safeguard `ConfirmIconButton`
gives destructive script/profile deletion elsewhere in this app.

The `segment.content.trim()` guard applies to **both** branches, not just
the text one — an empty code segment (e.g. an AI reply with `` ``` ``
immediately followed by `` ``` ``, nothing between) would otherwise render
a live "Apply to editor" button that calls `updateDraftCode('')`, silently
blanking the user's script. Guarding it out entirely (rather than, say,
disabling the button) means a genuinely empty code block just doesn't
render anything, which is also correct — there's nothing useful to show.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/EaChatPanel.tsx
git commit -m "$(cat <<'EOF'
Add the EaChatPanel component

Provider dropdown, message list with Copy/Apply on code blocks,
input row. Not wired into EaLab yet — that's the next task. Apply
updates draftCode (same action typing does) rather than saving
directly, so AI-generated code goes through the normal Save step
like any other edit. Empty code segments are skipped entirely (not
just empty text ones) so a blank fenced block can't render a live
Apply button that would blank out the script.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Wire the chat panel into EA Lab

**Files:**
- Modify: `src/renderer/src/components/EaLab.tsx`

- [ ] **Step 1: Import `EaChatPanel`**

Find:

```tsx
import { useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'
import { BrandMark } from './BrandMark'
import { ConfirmIconButton } from './ConfirmIconButton'
import { Icon } from './Icon'
```

Replace with:

```tsx
import { useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'
import { BrandMark } from './BrandMark'
import { ConfirmIconButton } from './ConfirmIconButton'
import { EaChatPanel } from './EaChatPanel'
import { Icon } from './Icon'
```

- [ ] **Step 2: Add the `showChat` state**

Find:

```tsx
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
```

Replace with:

```tsx
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showChat, setShowChat] = useState(false)
```

- [ ] **Step 3: Add the topbar toggle button**

Find:

```tsx
          <button
            type="button"
            className="icon-btn"
            onClick={enterSettings}
            title="Settings"
            aria-label="Settings"
          >
            <Icon name="settings" />
          </button>
        </div>
      </header>
```

Replace with:

```tsx
          <button
            type="button"
            className="icon-btn"
            data-active={showChat}
            onClick={() => setShowChat((v) => !v)}
            title="AI chat"
            aria-label="AI chat"
          >
            <Icon name="chat" />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={enterSettings}
            title="Settings"
            aria-label="Settings"
          >
            <Icon name="settings" />
          </button>
        </div>
      </header>
```

- [ ] **Step 4: Mark the body grid and render the panel**

Find:

```tsx
      <section className="ea-lab-body">
```

Replace with:

```tsx
      <section className="ea-lab-body" data-chat-open={showChat}>
```

Then find:

```tsx
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

Replace with:

```tsx
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

        {showChat ? <EaChatPanel /> : null}
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/EaLab.tsx
git commit -m "$(cat <<'EOF'
Wire the AI chat panel into EA Lab

New topbar toggle (chat icon, active-state highlighted like other
toggles). ea-lab-body gets a third grid column via data-chat-open
when the panel is showing — CSS in the next task.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Style the chat panel

**Files:**
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Add the third grid column**

Find:

```css
.ea-lab-body {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 10px;
  min-height: 0;
}
```

Replace with:

```css
.ea-lab-body {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 10px;
  min-height: 0;
}

.ea-lab-body[data-chat-open='true'] {
  grid-template-columns: 260px minmax(0, 1fr) 320px;
}
```

- [ ] **Step 2: Add the chat panel styles**

Find:

```css
.composer-hint[data-ok='true'] {
  color: var(--bull);
}

.composer-hint[data-ok='false'] {
  color: var(--bear);
}
```

Replace with:

```css
.composer-hint[data-ok='true'] {
  color: var(--bull);
}

.composer-hint[data-ok='false'] {
  color: var(--bear);
}

.ea-chat-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--vault);
}

.ea-chat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--rule);
}

.ea-chat-header .stamp {
  flex: 1;
}

.ea-chat-empty {
  color: var(--muted);
  font-size: 12px;
  text-align: center;
  padding: 24px 12px;
}

.ea-chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ea-chat-msg-user {
  align-self: flex-end;
  max-width: 88%;
  background: var(--gold-soft);
  color: var(--gold);
  border-radius: 10px 10px 2px 10px;
  padding: 8px 10px;
  font-size: 12.5px;
}

.ea-chat-msg-assistant {
  align-self: flex-start;
  max-width: 92%;
  background: var(--steel);
  border-radius: 10px 10px 10px 2px;
  padding: 8px 10px;
  font-size: 12.5px;
}

.ea-chat-msg-assistant p {
  margin: 0 0 6px;
}

.ea-chat-msg-assistant p:last-child {
  margin-bottom: 0;
}

.ea-chat-code-block {
  background: var(--ink);
  border: 1px solid var(--rule);
  border-radius: 6px;
  margin: 6px 0;
  overflow: hidden;
}

.ea-chat-code-block pre {
  margin: 0;
  padding: 8px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11.5px;
  white-space: pre-wrap;
  word-break: break-word;
}

.ea-chat-code-actions {
  display: flex;
  gap: 6px;
  padding: 6px 8px;
  border-top: 1px solid var(--rule);
}

.ea-chat-code-actions button {
  font-size: 11px;
  padding: 4px 9px;
  border-radius: 5px;
  border: 1px solid var(--rule);
  background: var(--steel);
  color: var(--parchment);
  cursor: pointer;
}

.ea-chat-apply-btn {
  background: var(--gold);
  color: var(--on-brand);
  border-color: var(--gold);
  font-weight: 600;
}

.ea-chat-input-row {
  display: flex;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--rule);
}

.ea-chat-input-row input {
  flex: 1;
}
```

`.ea-chat-code-actions button`/`.ea-chat-apply-btn` are dedicated, small
button styles — deliberately **not** reusing the app's global `.primary`/
`.ghost` classes, which are sized for full toolbar buttons (`min-height:
36px`) and would look oversized inside a compact code-block action row.
The Send button in `.ea-chat-input-row`, by contrast, *does* use the
global `.primary` class — full-size fits fine there, matching the
existing Save button in the editor toolbar right above it.

(No typecheck applies — CSS isn't typechecked. Verified visually in
Task 14.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/styles/global.css
git commit -m "$(cat <<'EOF'
Style the EA chat panel

Third grid column when open, message bubbles, code blocks with
compact dedicated button styles (not the global .primary/.ghost,
which are sized for full toolbar buttons).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all existing tests pass (this plan touches no `@core`/`@shared`
domain logic covered by the test suite).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: `electron-vite build` completes with no errors.

- [ ] **Step 4: Headless backend verification**

Same constraint and same technique as the prior AI sub-projects in this
app: no component-test harness, and this environment can't drive or
screenshot the actual GUI. Write a throwaway script (in a scratch
directory, not committed) that runs under the real Electron binary (no
`ELECTRON_RUN_AS_NODE`, no window created) against a temp SQLite DB,
importing `chatRepository.ts`, `providers.ts`, and `saveEaScript`/
`deleteEaScript` from `database/repositories.ts` directly. Because
`ea_chat_messages.script_id` is now a real, enforced FK (`PRAGMA
foreign_keys = ON`, Task 2), the test must first create real `ea_scripts`
rows via `saveEaScript` before inserting chat messages against their ids —
inserting a chat message for a script id with no matching row will fail
the FK constraint, which is itself worth confirming (see below). Confirm:

- `saveChatMessage` + `listChatMessages` round-trip correctly and stay
  ordered by `created_at`, for two real scripts created via `saveEaScript`.
- `clearChat` removes only the target script's messages, leaving a second
  script's messages untouched.
- Deleting one script via `deleteEaScript` cascades and removes exactly
  that script's `ea_chat_messages` rows, leaving a second script's
  messages fully intact — confirms the `ON DELETE CASCADE` FK actually
  fires, not just that the SQL parses.
- `sendChatMessage` called with a deliberately invalid key against at
  least the OpenAI and Anthropic adapters returns `{ ok: false }` with a
  real error message (not a crash) — mirroring how `testConnection` was
  verified for the AI provider profiles sub-project.

Delete the scratch script and its temp DB directory when done.

- [ ] **Step 5: Manual UI pass**

Flagged as a gap, not something to attempt in this environment: run
`npm run dev`, open EA Lab, click the new chat icon — confirm the third
column opens/closes, the provider dropdown lists saved profiles (or shows
the "add a provider" prompt if none exist), sending a message shows both
the prompt and the reply, a reply containing a fenced code block renders
with working Copy and Apply buttons (Apply should visibly update the
Monaco editor's content and mark it dirty), "New chat" clears the visible
history, and reopening the same script later still shows the saved
conversation. Check both themes.

- [ ] **Step 6: Report**

No commit needed for this task (verification only) unless Step 4 or 5
surfaces a bug — if either does, fix the relevant file, re-run the
relevant checks above, and commit the fix with a description of what was
wrong.
