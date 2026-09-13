# Settings Hub — restructuring AI Settings into a general Settings page

## Context

The AI Settings screen (`docs/superpowers/specs/2026-09-13-ai-settings-design.md`)
shipped as a single lone form — provider/model/API key, nothing else. It reads
as a one-off dialog, not a real "Settings" area of the app. This spec turns it
into a proper settings hub: a sidebar of categories with a content panel,
matching the pattern VS Code, Slack, and macOS System Settings use, so it
scales cleanly as more categories get added later.

Explored via the visual brainstorming companion: three structural options
(sidebar categories, top tabs, single scrolling page) were mocked up in the
app's real dark palette. Sidebar categories was chosen.

## Goals

- Replace the single AI-only form with a shell: left sidebar of setting
  categories, content panel on the right showing the selected category.
- Two real categories at launch: **Appearance** (new — the dark/light theme
  choice, currently only reachable via the topbar toggle) and **AI Provider**
  (existing — the current form, relocated unchanged).
- Rename the screen/store/component from AI-specific names (`ai-settings`,
  `AiSettings.tsx`, `enterAiSettings`) to general ones (`settings`,
  `SettingsScreen.tsx`, `enterSettings`), since it's no longer AI-only.
- Look and feel like a deliberate, professional settings page — not a
  centered form floating on its own.

## Non-goals

- No new settings categories beyond Appearance and AI Provider (no Trading
  Defaults, no General, no Data & Storage) — those stay where they are today
  (Strategy panel, etc.). This spec is the shell + the two categories that
  already have a natural home here.
- The topbar `ThemeToggle` button (EA Lab, Welcome, Workspace) is not removed.
  This spec adds Appearance as an *additional* place to change theme, inside
  Settings — it doesn't consolidate the quick-access toggle away.
- No new icons. The sidebar uses text + a small state dot (matching the
  approved mockup), not per-category icons.
- The `ai:*` IPC channels, the `aiSettingsRepository`, and `providers.ts` are
  unchanged — this spec is a renderer-side restructuring only.

## Design

### Renaming

Everything AI-specific about the *screen* (not the AI feature itself) is
renamed to be general:

| Before | After |
|---|---|
| `AppScreen` value `'ai-settings'` | `'settings'` |
| `enterAiSettings` / `leaveAiSettings` | `enterSettings` / `leaveSettings` |
| `src/renderer/src/components/AiSettings.tsx` | deleted |
| Gear button tooltip "AI settings" (EA Lab topbar) | "Settings" |

`leaveSettings` still returns to `'ea-lab'` — same reasoning as before, you
only reach Settings from inside the EA Lab.

The `ai` preload namespace, `AI_*` IPC constants, `aiSettingsRepository.ts`,
and `providers.ts` keep their AI-specific names as-is — those genuinely are
AI-only and nothing about them changes.

### Component structure

Three new files replace the one deleted file, following this app's existing
flat `components/` layout (no subfolders) and the principle that each file
should have one clear job:

- **`SettingsScreen.tsx`** — the shell only. Renders the topbar (`BrandMark
  subtitle="Settings"`, back button to `leaveSettings` — no `ThemeToggle`
  here, since Appearance is one click away inside this same screen), a
  sidebar with two nav items (`'appearance' | 'ai-provider'` local state,
  default `'appearance'`), and renders whichever panel is selected.
- **`AppearanceSettings.tsx`** (new) — reads `theme`/`setTheme` from
  `useAppStore`, renders two selectable cards ("Dark" / "Light") reflecting
  the current theme. Selecting one calls `setTheme` immediately — no
  save button, since this mirrors how the topbar toggle already behaves
  (instant, no confirmation step) and introducing a save step here would be
  inconsistent with that existing behavior.
- **`AiProviderSettings.tsx`** — the existing form from `AiSettings.tsx`,
  moved verbatim: same `useAiSettingsStore`, same fields (Provider, Model,
  Base URL, API key, Test connection, Save), same behavior. Only the outer
  `<div className="app" data-frame="ai-settings">` / `<header>` wrapper is
  removed, since `SettingsScreen.tsx` now owns the frame and header.

`App.tsx` renders `<SettingsScreen />` when `screen === 'settings'`.

### Layout & styling

`global.css` gets a new sidebar/content-split layout for the settings frame,
following the same token-based approach as the rest of the file:

- `.app[data-frame='settings']` added alongside the existing frame-variant
  selectors (60px header + fill row).
- `.settings-body` — `display: grid; grid-template-columns: 200px 1fr;`
  replacing `.ai-settings-body`'s single centered card.
- `.settings-nav` — the sidebar: a plain list, `--vault` background,
  right border in `--rule`.
- `.settings-nav-item` / `.settings-nav-item[data-active='true']` — matches
  the mockup: muted text + a small `--muted` dot by default, `--parchment`
  text + `--gold` dot + `--steel` background when active (same visual
  vocabulary as `.tab[data-active='true']` elsewhere in the app).
- `.settings-panel` — the right-hand content area, reusing the existing
  `.composer` card styling for its inner content (unchanged from how
  `AiSettings.tsx` already used it) rather than introducing a new card style.
- `.composer-hint[data-ok]` (success/failure colors) stays as-is — still used
  by the AI provider panel's Test Connection result.

### Data flow

No new IPC, no new store fields beyond what already exists. `AppearanceSettings`
reads/writes `useAppStore`'s existing `theme`; `AiProviderSettings` reads/writes
`useAiSettingsStore` exactly as `AiSettings.tsx` did. `SettingsScreen`'s
category selection is local component `useState` — it's pure navigation
within one screen, not app-wide state, so it doesn't belong in either store.

## Edge cases

- **Switching category while the AI form has unsaved input** (e.g. a typed
  API key not yet saved) — switching to Appearance and back does not
  persist or discard anything extra; `AiProviderSettings`'s local `useState`
  for the form fields is simply unmounted and remounted (same as it already
  resets to the saved values on mount today), so this matches existing
  behavior, not a regression.

## Verification

Same constraint as before: no component-test harness, no way to screenshot
the GUI from this environment. Verify manually (via the `run` skill, isolated
data directory, or a quick `npm run dev` pass): gear icon still opens the
screen (now titled "Settings"), sidebar defaults to Appearance, clicking
Dark/Light changes the theme immediately and matches the topbar toggle's
effect, clicking AI Provider shows the exact same form/behavior as before
(save, test connection, invalid key, persistence across relaunch — all
already verified for the underlying logic in the prior sub-project and
unchanged here), back button returns to EA Lab. Check both themes.
