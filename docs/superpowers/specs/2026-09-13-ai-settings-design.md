# EA Development Lab — AI Sub-project 1: Settings + Secure Config Storage

## Context

This is the first of several sub-projects toward letting users get AI help
writing EAs (a VSCode/Cursor-style chat that can read their scripts). This
spec covers only the settings screen and secure storage of the AI
provider/model/API key — no chat UI, no file access, no code generation yet.
Those are later sub-projects that depend on this one existing.

The user wants built-in presets for OpenAI, Anthropic (Claude), and Google
(Gemini) — each with their own native API — plus a "Custom" option for any
OpenAI-compatible endpoint (Azure OpenAI, OpenRouter, local model servers,
etc.).

## Goals

- A settings screen, reachable from the EA Lab, where the user picks a
  provider, enters a model name and API key (and a base URL, for Custom),
  saves it, and can test the connection.
- The API key is genuinely protected at rest (OS-level encryption), and the
  renderer process (where DevTools can inspect everything) never has access
  to the raw or encrypted key — only a "is a key configured" boolean.
- A small provider-adapter abstraction that proves connectivity now and is
  built to be extended with real chat calls in the next sub-project, without
  overbuilding beyond what "test connection" actually needs today.

## Non-goals

- No chat UI, no message history, no tool-calling/file access, no code
  generation — later sub-projects.
- No multiple saved profiles — one active AI configuration at a time, matching
  how the user described "the setting page," not a profile manager.
- No streaming responses — not needed until the chat sub-project.

## Design

### Data model & storage

New SQLite table, a single enforced row (mirrors nothing existing exactly,
since this app has no other "one global config row" table, but follows the
same all-TEXT-columns style as `strategies`/`ea_scripts`):

```sql
CREATE TABLE IF NOT EXISTS ai_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  provider TEXT NOT NULL DEFAULT 'openai',
  model TEXT NOT NULL DEFAULT '',
  base_url TEXT,
  encrypted_api_key TEXT,
  updated_at INTEGER NOT NULL
);
```

`encrypted_api_key` holds the base64-encoded output of Electron's
`safeStorage.encryptString()` (which returns a `Buffer`) — never a raw key.
`safeStorage` is a main-process-only API backed by the OS's own credential
store (Keychain on macOS, DPAPI on Windows, libsecret on Linux where
available). Encryption/decryption happens exclusively in
`src/main/database/repositories.ts` (or a new small `src/main/ai/` module —
see below); the key is decrypted only at the moment a provider call is about
to be made, held in memory briefly, and never sent to the renderer.

Shared type in `src/shared/types.ts` — deliberately has NO key field, since
this shape is what the renderer is allowed to see:

```ts
export interface AiSettings {
  provider: 'openai' | 'anthropic' | 'gemini' | 'custom'
  model: string
  baseUrl: string | null
  hasApiKey: boolean
}
```

### IPC surface

Three new channels, following the existing `domain:action` convention:

- `ai:get-settings` → returns `AiSettings` (no key).
- `ai:save-settings` → takes `{ provider, model, baseUrl }` (no key — this
  never touches the encrypted key, so changing the model doesn't require
  re-entering the API key).
- `ai:set-api-key` → takes a raw key string, encrypts it in the main process,
  stores it, returns nothing (or the refreshed `AiSettings`). A separate
  `ai:clear-api-key` channel removes it. Keeping key changes on their own
  channel (rather than folding into `save-settings`) makes "leave the key
  unchanged" the natural default in the UI — the key field just stays empty
  and untouched unless the user deliberately edits it.
- `ai:test-connection` → takes no arguments (uses the currently saved
  settings), returns `{ ok: boolean; message: string }`. Runs a lightweight
  provider-specific "list models" call — no chat completion, no token cost.

### Provider adapters

New file `src/main/ai/providers.ts` — one function per provider, all with the
same shape, all using a lightweight "list models" endpoint so testing
connectivity doesn't cost tokens:

- **OpenAI**: `GET https://api.openai.com/v1/models`, header
  `Authorization: Bearer <key>`.
- **Anthropic**: `GET https://api.anthropic.com/v1/models`, headers
  `x-api-key: <key>`, `anthropic-version: 2023-06-01`.
- **Gemini**: `GET https://generativelanguage.googleapis.com/v1beta/models?key=<key>`.
- **Custom**: `GET <baseUrl>/models`, header `Authorization: Bearer <key>`
  (the OpenAI-compatible convention most proxies/local servers implement).

Each returns `{ ok: true }` on a 2xx response or `{ ok: false, message }`
with a short human-readable reason (HTTP status, or "no API key configured",
or a network error message) otherwise. This is intentionally the minimum
needed to prove "the key and endpoint work" — the next sub-project extends
this same file with real chat-sending functions per provider, reusing the
per-provider request-building logic rather than starting over.

### UI

A new `AppScreen` value, `'ai-settings'`, reachable via a new gear icon
button in the EA Lab's topbar (added to `.session-chip`, alongside Home/
theme/new-script). Its own Home-equivalent returns to `'ea-lab'` (not
`'welcome'`) — you only reach this screen from inside the EA Lab, so the way
back should be symmetric with how you got there, unlike the Strategy Lab/EA
Lab's own Home buttons which return to Welcome.

New screen component `src/renderer/src/components/AiSettings.tsx`, a simple
form (reusing the app's existing `.field`/`.composer`-style form patterns,
not a full page-filling layout like the EA Lab):

- **Provider** — a `Dropdown` (existing component) with the four options.
- **Model** — a text input (e.g. placeholder `gpt-4o` / `claude-sonnet-4-5` /
  `gemini-2.0-flash` depending on provider, just as a hint, not validated).
- **Base URL** — a text input, shown only when provider is `custom`.
- **API key** — a password-style input (`type="password"`). If a key is
  already saved (`hasApiKey: true`), the field shows placeholder text like
  "Key saved — leave blank to keep it" rather than any real value; typing
  in it and saving replaces the stored key via `ai:set-api-key`.
- **Save** button — calls `ai:save-settings` (and `ai:set-api-key` too, if
  the key field has content).
- **Test connection** button — calls `ai:test-connection`, shows the
  result inline (success message, or the returned failure reason).

New dedicated store, `src/renderer/src/store/useAiSettingsStore.ts` — same
reasoning as `useEaLabStore`: a separate, self-contained concern that
shouldn't grow the already-large `useAppStore.ts`.

## Edge cases

- **`safeStorage.isEncryptionAvailable()` returns `false`** (can happen on
  some Linux setups without a keyring). In that case, `ai:set-api-key`
  returns an error rather than silently storing the key unencrypted — the UI
  surfaces this clearly ("Secure storage isn't available on this system, so
  the API key can't be saved") rather than degrading security silently. This
  needs to be verified for real during implementation, not just assumed —
  similar to how the Monaco bundling assumption was spike-tested before
  being written into a plan.
- **No key configured, user clicks Test Connection** — returns
  `{ ok: false, message: 'No API key configured' }` without making any
  network call.
- **Switching provider** does not clear the model/baseUrl/key fields
  automatically — the user might be switching back and forth, and losing
  their custom baseUrl on an accidental click would be worse than leaving
  stale values that just don't get used until they're relevant again.

## Verification

Same constraint as the rest of this app: no component-test harness exists.
Verify manually (via the `run` skill, isolated data directory): open AI
Settings from the EA Lab, confirm the form renders, save a provider/model
with an intentionally invalid key, confirm Test Connection reports failure
with a sensible message, save a real key for at least one provider if the
user has one available, confirm Test Connection reports success, confirm the
key is never visible in the renderer (check `AiSettings` shape has no key
field via the actual IPC response, not just by reading the code), confirm
settings persist across a relaunch, confirm the gear icon's Home-equivalent
returns to the EA Lab (not Welcome). Check both themes.
