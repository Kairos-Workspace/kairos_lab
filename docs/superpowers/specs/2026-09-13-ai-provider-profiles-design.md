# AI Provider Profiles — multiple saved AI provider configs

## Context

The AI Settings sub-project (`docs/superpowers/specs/2026-09-13-ai-settings-design.md`)
deliberately shipped with "one active AI configuration at a time... not a
profile manager." That constraint is now the blocker: the user wants to save
more than one provider/model/key combination (e.g. a personal OpenAI key and
a work Anthropic key), and a future sub-project — an AI-generates-the-EA
prompt feature, not part of this spec — will need to let the user pick which
saved profile to use for a given generation. This spec covers only turning
the single config into a list of named, manageable profiles. The picker UI
inside an actual AI-generation flow is out of scope; that flow doesn't exist
yet and gets its own spec when it's built.

Explored via the visual brainstorming companion: three ways to add/edit a
profile (modal, inline-expand, nested list+detail) were mocked up. Modal —
reusing this app's existing `ReplayRangeModal` pattern — won.

## Goals

- Multiple named AI provider profiles, each with its own provider, model,
  base URL (for Custom), and encrypted API key.
- A list view in the Settings screen's "AI Provider" category: add, edit,
  delete, and test-connection per profile.
- Reuse existing patterns rather than inventing new ones: the modal form
  reuses `ReplayRangeModal`'s `.modal-backdrop`/`.composer` structure
  verbatim; delete reuses the existing `ConfirmIconButton` "click again to
  confirm" pattern already used for deleting EA scripts; ids follow the same
  `crypto.randomUUID()` + upsert convention already used for `EaScript`/
  `SavedStrategy`.

## Non-goals

- **No "default" or "active" provider concept.** There's nothing yet that
  consumes a profile to actually do something (that's the AI-generates-EA
  sub-project). Introducing a default/active flag now would be guessing at
  requirements a feature that doesn't exist yet hasn't stated. When that
  feature is built, it decides how picking works (last-used, explicit
  default, always-ask — whatever fits that UI).
- **No migration of the existing single saved config.** Per the user's own
  call: this is a solo local desktop app, not a service with other users'
  data to preserve. The old `ai_settings` table is dropped; any previously
  saved provider/key needs to be re-entered once as a new profile.
- **No cap on the number of profiles.**
- **No changes to `providers.ts`'s test-connection adapters themselves** —
  same three provider-specific functions, same "list models" approach, just
  invoked with whichever profile is currently open in the modal instead of
  "the" single settings row.

## Design

### Data model & storage

Replace the single enforced row with a real table, following the exact
shape/convention `ea_scripts` already uses (`id TEXT PRIMARY KEY`, upsert via
`ON CONFLICT`):

```sql
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
```

Shared type in `src/shared/types.ts` replaces `AiSettings` (same "no key
field, ever" principle, now with a name):

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

`src/main/ai/aiSettingsRepository.ts` is replaced by
`src/main/ai/aiProvidersRepository.ts`:

- `listProviders(): AiProviderProfile[]` — `SELECT * FROM ai_providers ORDER BY updated_at DESC` (newest-edited first, same ordering `listEaScripts()` uses).
- `saveProvider(profile: { id, name, provider, model, baseUrl }): AiProviderProfile[]` — upsert by `id`, same `INSERT ... ON CONFLICT(id) DO UPDATE` shape as `saveEaScript`, returns the refreshed list (matching the `EA_SCRIPTS_SAVE` IPC handler's "save then return the whole list" convention).
- `deleteProvider(id: string): AiProviderProfile[]` — delete by id, returns the refreshed list.
- `setProviderApiKey(id: string, key: string): { ok: boolean; error?: string }` — same `safeStorage` encryption as before, scoped to one row by id.
- `clearProviderApiKey(id: string): void`.
- `getDecryptedApiKey(id: string): string | null` — main-process-only, never exposed through IPC, exactly as before.

### IPC surface

Renamed to reflect the list shape (`domain:action` convention, same as before):

- `ai:list-providers` → `AiProviderProfile[]`.
- `ai:save-provider` → takes `{ id, name, provider, model, baseUrl }`, returns the refreshed list.
- `ai:set-provider-api-key` → takes `{ id, key }`, encrypts and stores, returns `{ ok, error? }`.
- `ai:clear-provider-api-key` → takes `id`.
- `ai:delete-provider` → takes `id`, returns the refreshed list.
- `ai:test-connection` → takes `id` (was: no arguments, since there was only ever one config) — looks up that profile, decrypts its key, runs the same provider-adapter check as before, returns `{ ok, message }`.

### UI

`AiProviderSettings.tsx` (the panel inside the Settings hub's sidebar,
built in the prior sub-project) is rewritten from a single form into:

- A list of profile rows (`.provider-list`/`.provider-row`, new CSS styled
  like the existing `.appearance-card`/`.pair-card` token-based card
  formula): name, a small provider-type badge, the model name, an edit
  icon-button, and a `ConfirmIconButton` (icon `trash`, confirm label
  `` `Click again to delete ${profile.name}` `` — identical usage to how
  `EaLab.tsx` already deletes scripts).
- An empty state ("No AI providers configured yet" + the same "Add profile"
  button) when the list is empty.
- An "Add profile" button in the panel header, always visible.

New `AiProviderModal.tsx` — the add/edit form, opened by either "Add
profile" (blank) or a row's edit button (prefilled). Structurally identical
to `ReplayRangeModal.tsx`: a `.modal-backdrop` containing a `.composer`
`<form>`, closes on backdrop click or its own close button. Fields: **Name**
(new — a plain text input), **Provider** (the existing `Dropdown`, same 4
options), **Model**, **Base URL** (shown only for Custom, as before), **API
key** (same "Key saved — leave blank to keep it" placeholder behavior for an
existing profile being edited), **Test connection** + **Save** buttons —
functionally identical to the old single form, just working against one
profile's id instead of "the" settings.

New dedicated store `useAiProvidersStore.ts` replaces `useAiSettingsStore.ts`:

```ts
interface AiProvidersState {
  providers: AiProviderProfile[]
  testing: boolean
  testResult: { ok: boolean; message: string } | null
  loadProviders: () => Promise<void>
  saveProvider: (
    profile: { id: string; name: string; provider: AiProviderProfile['provider']; model: string; baseUrl: string | null },
    apiKey: string
  ) => Promise<void>
  deleteProvider: (id: string) => Promise<void>
  testConnection: (id: string) => Promise<void>
}
```

`testing`/`testResult` are scoped to whichever profile's modal is currently
open (only one modal is open at a time, same as the old screen only ever had
one form) — cleared whenever the modal opens for a different profile or a
new blank one, so a stale result from a previously-tested profile can't leak
into a different profile's modal.

## Edge cases

- **Deleting a profile while its modal is open** — can't happen by
  construction: the delete button lives on the list row, which is covered
  by the modal backdrop while a modal is open. You'd have to close the
  modal first, at which point deleting is just deleting.
- **Two profiles with the same name** — allowed. Names are a label for the
  human, not a unique key; `id` is what everything actually keys off. No
  uniqueness validation.
- **Empty name** — same fallback pattern `saveEaScript` uses for empty
  script names (`row.name.trim() || 'Untitled EA'`): an empty/whitespace-only
  name falls back to `'Untitled profile'` rather than being rejected.
- **`safeStorage.isEncryptionAvailable()` is `false`** — same behavior as
  before: `setProviderApiKey` returns an error rather than storing the key
  unencrypted; the modal surfaces it the same way the old form did.

## Verification

Same constraint as prior AI sub-projects: no component-test harness, and
this environment can't drive/screenshot the actual GUI — verified via a
headless script (as done for the original AI settings sub-project) that
exercises `aiProvidersRepository.ts` and `providers.ts` directly against a
temp SQLite DB under the real Electron runtime: create two profiles, confirm
both list correctly, confirm each has an independent encrypted key that
round-trips and survives a simulated relaunch, confirm deleting one doesn't
affect the other, confirm `testConnection(id)` targets the right profile.
The list/modal UI itself (row rendering, modal open/close, edit prefill)
needs a manual `npm run dev` pass, flagged the same way prior UI-only gaps
in this project have been.
