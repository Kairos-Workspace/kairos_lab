# EA Lab AI Chat — Cursor-style prompt panel

## Context

This is the "chat sub-project" the original AI settings design doc explicitly
deferred: *"No chat UI, no message history, no tool-calling/file access, no
code generation — later sub-projects"* and *"the next sub-project extends
[providers.ts] with real chat-sending functions per provider, reusing this
same per-provider request-building structure."* The AI provider profiles
sub-project that followed gave users multiple named, saved provider/model/key
combinations specifically so this chat feature could let them pick which one
to use per conversation — that's the whole reason "choose the model" was part
of the original request.

Explored via the visual brainstorming companion: a mockup of the overall
three-column layout (script list · editor · chat, Cursor/VSCode-style) and
the "Apply to editor" interaction. Confirmed decisions from that session:

- **Layout:** third column in EA Lab, toggled via a topbar button — not a
  modal, not a separate screen.
- **Apply behavior:** a code block's "Apply to editor" button replaces the
  *entire* editor content with that block — not an insert-at-cursor or diff
  merge. Simplest unambiguous behavior for v1.
- **Streaming:** none for v1 — one request, one full reply, shown when it
  arrives. No per-provider streaming-format plumbing.
- **Persistence:** chat history is saved per script (a new table), not
  ephemeral — reopening a script later shows the same conversation, matching
  how the script's own code is already persisted.
- **Code context:** every message automatically includes the script's
  *current* editor content (including unsaved edits) as context — the AI
  always sees what you're actually looking at, not just the last save.

## Goals

- A chat panel in EA Lab where the user prompts an AI provider (one of their
  saved `AiProviderProfile` profiles, picked via a dropdown) to write or
  modify the active EA script.
- Conversation history persisted per script.
- AI responses containing fenced code blocks get Copy and Apply actions;
  Apply replaces the whole editor content.
- Real chat-completion calls to all four provider types (OpenAI, Anthropic,
  Gemini, Custom OpenAI-compatible), extending `providers.ts`'s existing
  per-provider structure rather than replacing it.

## Non-goals

- No streaming responses (explicitly deferred above).
- No diff view / partial-apply / insert-at-cursor — replace-whole-file only.
- No tool-calling, file access beyond the single active script, or
  multi-file awareness — the AI only ever sees one script's code.
- No conversation branching, editing past messages, or regenerating a
  specific reply — linear history only, same shape as every mainstream chat
  UI's simplest form.
- No new provider types and no changes to the existing `testConnection`
  functions — this reuses `AiProviderProfile` and the provider-adapter
  pattern exactly as they exist today.

## Design

### Data model

New table, scoped to one script (parallel to how `drawings` is scoped to a
symbol):

```sql
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
```

`role` is `'user'` or `'assistant'`. `provider_id` records which saved
profile answered an assistant message (`NULL` for user messages) — not
surfaced prominently in v1 UI, but worth capturing now rather than needing a
migration later if a multi-profile conversation view is wanted.

`script_id` **does** use a real `FOREIGN KEY ... ON DELETE CASCADE` to
`ea_scripts(id)` — this codebase already enforces FKs (`PRAGMA foreign_keys
= ON` in `db.ts`) and already uses exactly this pattern for the same shape
of relationship: `trades.session_id`/`annotations.session_id` →
`sessions(id)` and `candles.dataset_id`/`data_gaps.dataset_id` →
`datasets(id)` all cascade, because those rows have no independent meaning
without their parent — same as a chat message without its script.
`provider_id`, by contrast, deliberately has **no** FK — it's a reference
to a swappable config profile, not an owning parent, so a dangling
`provider_id` after a provider is deleted is harmless and matches the
existing `sessions.strategy_id` precedent (a reference to reusable config,
not an owned child row).

The script's *code* is never stored in this table. Every request builds a
fresh system message from whatever's currently in the Monaco editor (see
"Request construction" below) — persisting it per-message would duplicate
the entire script's content on every exchange for no benefit, since the
current code is always available live from the renderer.

Shared type in `src/shared/types.ts`:

```ts
export interface EaChatMessage {
  id: string
  scriptId: string
  role: 'user' | 'assistant'
  content: string
  providerId: string | null
  createdAt: number
}
```

### Provider chat-sending functions

`src/main/ai/providers.ts` gains one function per provider (parallel to the
existing `testOpenAiCompatible`/`testAnthropic`/`testGemini`), plus a
dispatcher:

```ts
export interface ChatResult {
  ok: boolean
  reply?: string
  message?: string // error message when !ok
}

export async function sendChatMessage(
  profile: Pick<AiProviderProfile, 'provider' | 'baseUrl' | 'model'>,
  apiKey: string,
  systemPrompt: string,
  history: { role: 'user' | 'assistant'; content: string }[]
): Promise<ChatResult>
```

Per-provider request shapes (confirmed against current provider docs, not
assumed from memory):

- **OpenAI / Custom** — `POST {baseUrl}/chat/completions`,
  `Authorization: Bearer <key>`, body
  `{ model, messages: [{role:'system',content:systemPrompt}, ...history] }`,
  reply at `.choices[0].message.content`. Custom uses the profile's own
  `baseUrl` (same `.replace(/\/$/, '')` normalization `testConnection`
  already does); OpenAI uses `https://api.openai.com/v1`.
- **Anthropic** — `POST https://api.anthropic.com/v1/messages`,
  `x-api-key: <key>`, `anthropic-version: 2023-06-01`, body
  `{ model, max_tokens: 4096, system: systemPrompt, messages: history }`,
  reply at `.content[0].text`. (`system` is a top-level field, not part of
  `messages`, unlike OpenAI.)
- **Gemini** — `POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent?key=<key>`,
  body `{ system_instruction: { parts: [{ text: systemPrompt }] }, contents: [...] }`
  where each history entry maps to `{ role: role === 'assistant' ? 'model' : 'user', parts: [{ text: content }] }`
  (Gemini uses `'model'`, not `'assistant'`, for its own turns — the one
  real structural difference from the other three). Reply at
  `.candidates[0].content.parts[0].text`.

Each function catches network/parse errors the same way the existing
`test*` functions do (`{ ok: false, message: error.message }`) rather than
throwing — `sendChatMessage`'s caller (the IPC handler) never needs a
try/catch of its own.

### Request construction (system prompt)

Built fresh per request, not stored:

```
You are helping the user write an MQL5 Expert Advisor script for MetaTrader.

Current script content:

```
<current editor content>
```

When you provide a full updated version of the script, respond with the
complete file in a single fenced code block.
```

The "respond with the complete file" instruction is deliberate, not
boilerplate — it's what makes the "Apply replaces the whole file" UI
decision actually work. If the model returned a diff or a snippet, Apply
would silently produce a broken file.

### IPC & preload

Three new channels, `ai:` prefix (this feature is AI-specific, same as the
provider-profile channels), following the existing
`domain:action`/refreshed-list convention:

- `ai:list-chat-messages` — takes `scriptId`, returns `EaChatMessage[]`.
- `ai:send-chat-message` — takes `{ scriptId, providerId, currentCode, message }`,
  returns a discriminated union:
  ```ts
  type SendChatMessageResult =
    | { ok: true; messages: EaChatMessage[] }
    | { ok: false; message: string }
  ```
  Looks up the profile and its decrypted key (same pattern
  `AI_TEST_CONNECTION` already uses), loads existing history for `scriptId`,
  builds the system prompt from `currentCode`, calls `sendChatMessage`. On
  success, persists both the new user message and the assistant reply, and
  returns `{ ok: true, messages: <refreshed list> }`. On failure, persists
  nothing (no half-written exchange) and returns `{ ok: false, message }` —
  the renderer keeps the user's typed prompt in the input box so it isn't
  lost on failure, and doesn't record a phantom message pair.
- `ai:clear-chat` — takes `scriptId`, deletes all its rows, returns `[]`.

Preload mirrors these three under the existing `ai` namespace (alongside
`listProviders`/`saveProvider`/etc.), typed the same way.

### Renderer

New `useEaChatStore.ts` (parallel to `useEaLabStore`/`useAiProvidersStore`):
`messages: EaChatMessage[]`, `sending: boolean`, `error: string | null`,
`selectedProviderId: string | null`, plus `loadMessages(scriptId)`,
`sendMessage(scriptId, currentCode, text)`, `clearChat(scriptId)`,
`setSelectedProviderId(id)`. `selectedProviderId` defaults to the most
recent assistant message's `providerId` for that script when messages load
(if any), else the first entry in `useAiProvidersStore`'s `providers` list.

New `EaChatPanel.tsx` — header (title + provider `Dropdown` sourced from
`useAiProvidersStore().providers` + a plain "New chat" icon button calling
`clearChat`, no confirmation needed since it doesn't touch the script's
actual code), scrollable message list (user messages right-aligned,
assistant left-aligned, matching the mockup), each assistant message's
fenced code blocks rendered as a bordered block with Copy and Apply
buttons, and a bottom input row (text input + Send). If
`useAiProvidersStore().providers` is empty, the panel shows a prompt to add
a provider in Settings instead of the input row — chatting is impossible
without one, so don't pretend otherwise with a dead input box.

`EaLab.tsx` gets a new topbar icon-button (new `chat` icon in `Icon.tsx`,
simple speech-bubble line art matching the existing set's style) that
toggles a `showChat` boolean in local state, and `.ea-lab-body` becomes a
three-column grid when `showChat` is true (`260px minmax(0,1fr) 320px`)
versus the current two-column grid when it's false — via a `data-chat-open`
attribute on the same element, same technique the Settings screen already
uses for conditional layout.

Code-block extraction: a small helper (in `EaChatPanel.tsx` or a tiny
`lib/extractCodeBlocks.ts`) splits an assistant message's `content` on
triple-backtick fences via regex, rendering fenced segments as code blocks
(with Copy/Apply) and everything else as plain text. Handles zero, one, or
multiple fenced blocks in a single reply — no assumption that the AI always
returns exactly one.

## Edge cases

- **Sending while a previous request is still in flight** — Send is
  disabled while `sending` is true, same pattern `AiProviderModal`'s Test
  Connection button already uses (`disabled={testing}`).
- **No providers saved at all** — chat input replaced with a prompt to add
  one in Settings (see above), not a silently-broken form.
- **Switching scripts while chat is open** — `EaChatPanel` reloads messages
  for the newly active script the same way the editor already reloads
  `draftCode` on `selectScript`; the two are already coupled through
  `activeScriptId`.
- **A chat request fails (bad key, network error, provider down)** — the
  error surfaces inline in the panel (a small error line, same
  `.composer-hint[data-ok='false']` styling used elsewhere in this app), the
  typed message stays in the input box for the user to retry, and nothing
  is written to `ea_chat_messages`.
- **Deleting a script that has chat history** — the `ON DELETE CASCADE` FK
  removes its `ea_chat_messages` rows automatically, the same way deleting a
  session already cascades to its `trades`/`annotations`. No manual cleanup
  needed in `deleteEaScript`.

## Verification

Same constraint as every other AI sub-project in this app: no
component-test harness, and this environment can't drive/screenshot the
actual GUI. Verify `providers.ts`'s new `sendChatMessage` functions and the
chat repository the same way the provider-profiles sub-project verified its
backend — a headless script run under the real Electron binary against a
temp SQLite DB, exercising real HTTP calls to each provider with a
deliberately invalid key (confirming graceful `{ok:false}` failures, not
crashes) and confirming persisted message ordering/round-tripping. The
panel UI itself (layout toggle, code-block Copy/Apply, provider dropdown,
empty-providers state) needs a manual `npm run dev` pass, flagged the same
way every other UI-only gap in this project has been.
