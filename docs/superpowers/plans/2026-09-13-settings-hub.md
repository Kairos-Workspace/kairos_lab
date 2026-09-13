# Settings Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single AI-only settings form with a proper Settings hub: a sidebar of categories (Appearance, AI Provider) and a content panel, renaming the screen/store/component from AI-specific names to general ones.

**Architecture:** Pure renderer-side restructuring — `useAppStore.ts` (screen id + actions rename), three component files replacing one (`SettingsScreen.tsx` shell + `AppearanceSettings.tsx` + `AiProviderSettings.tsx`), and new sidebar/panel CSS. No IPC, main-process, or `ai:*` changes — those stay exactly as they are.

**Tech Stack:** Electron + React (renderer), plain CSS (one shared `global.css`), Zustand stores. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-13-settings-hub-design.md`

---

### Task 1: Rename the screen and navigation actions

**Files:**
- Modify: `src/renderer/src/store/useAppStore.ts`
- Modify: `src/renderer/src/components/EaLab.tsx`
- Modify: `src/renderer/src/components/App.tsx` (screen check only — still renders the old `AiSettings` component for now)
- Modify: `src/renderer/src/components/AiSettings.tsx` (call-site only — its content is restructured in later tasks)

No test file — pure rename, no testable logic, consistent with how this app's other plans handle pure JSX/store renames (typecheck + manual verification only).

- [ ] **Step 1: Rename the `AppScreen` value**

In `src/renderer/src/store/useAppStore.ts`, find:

```ts
export type AppScreen = 'welcome' | 'library' | 'workspace' | 'ea-lab' | 'ai-settings'
```

Replace with:

```ts
export type AppScreen = 'welcome' | 'library' | 'workspace' | 'ea-lab' | 'settings'
```

- [ ] **Step 2: Rename the action declarations**

Find:

```ts
  enterEaLab: () => void
  enterAiSettings: () => void
  leaveAiSettings: () => void
  goHome: () => void
```

Replace with:

```ts
  enterEaLab: () => void
  enterSettings: () => void
  leaveSettings: () => void
  goHome: () => void
```

- [ ] **Step 3: Rename the action implementations**

Find:

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

Replace with:

```ts
  enterEaLab: () => {
    set({ screen: 'ea-lab' })
  },

  enterSettings: () => {
    set({ screen: 'settings' })
  },

  leaveSettings: () => {
    set({ screen: 'ea-lab' })
  },

  goHome: () => {
    set({ screen: 'welcome' })
  },
```

- [ ] **Step 4: Update the EA Lab's gear button**

In `src/renderer/src/components/EaLab.tsx`, find:

```tsx
  const enterAiSettings = useAppStore((s) => s.enterAiSettings)
```

Replace with:

```tsx
  const enterSettings = useAppStore((s) => s.enterSettings)
```

Then find:

```tsx
          <button
            type="button"
            className="icon-btn"
            onClick={enterAiSettings}
            title="AI settings"
            aria-label="AI settings"
          >
            <Icon name="settings" />
          </button>
```

Replace with:

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
```

- [ ] **Step 5: Update the screen check in `App.tsx`**

In `src/renderer/src/App.tsx`, find:

```tsx
      ) : screen === 'ai-settings' ? (
        <AiSettings />
```

Replace with:

```tsx
      ) : screen === 'settings' ? (
        <AiSettings />
```

(The component itself is still called `AiSettings` at this point — it gets replaced by `SettingsScreen` in Task 5. This step only fixes the screen-id check so it matches Step 1's rename.)

- [ ] **Step 6: Update the call site inside `AiSettings.tsx`**

In `src/renderer/src/components/AiSettings.tsx`, find:

```tsx
  const leaveAiSettings = useAppStore((s) => s.leaveAiSettings)
```

Replace with:

```tsx
  const leaveSettings = useAppStore((s) => s.leaveSettings)
```

Then find:

```tsx
            onClick={leaveAiSettings}
```

Replace with:

```tsx
            onClick={leaveSettings}
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/store/useAppStore.ts src/renderer/src/components/EaLab.tsx src/renderer/src/App.tsx src/renderer/src/components/AiSettings.tsx
git commit -m "$(cat <<'EOF'
Rename the ai-settings screen and actions to settings

This screen is becoming a general Settings hub (Appearance + AI
Provider), not an AI-only form, so the screen id and navigation
actions are renamed ahead of the actual restructuring in the
following tasks. The ai:* IPC channels, aiSettingsRepository, and
providers.ts are untouched — those genuinely are AI-specific.
EOF
)"
```

---

### Task 2: Create the `AppearanceSettings` panel

**Files:**
- Create: `src/renderer/src/components/AppearanceSettings.tsx`

- [ ] **Step 1: Write the component**

Create `src/renderer/src/components/AppearanceSettings.tsx`:

```tsx
import type { DeskTheme } from '@shared/types'
import { useAppStore } from '../store/useAppStore'

const THEME_OPTIONS: { value: DeskTheme; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' }
]

export function AppearanceSettings(): React.JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)

  return (
    <div className="composer">
      <header>
        <div>
          <span className="stamp">UI</span>
          <h2>Appearance</h2>
        </div>
      </header>

      <p className="composer-hint">Choose how Quantify looks. Applies immediately, everywhere.</p>

      <div className="appearance-options">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="appearance-card"
            data-active={theme === option.value}
            onClick={() => setTheme(option.value)}
          >
            <span className="appearance-swatch" data-theme={option.value} />
            <b>{option.label}</b>
          </button>
        ))}
      </div>
    </div>
  )
}
```

This reuses the `.composer`/`.composer-hint` card styling already used by the AI provider form (added in Task 6 below to also cover the new `.appearance-options`/`.appearance-card`/`.appearance-swatch` classes), and the existing `theme`/`setTheme` state from `useAppStore` — the same state the topbar `ThemeToggle` already reads and writes, so this stays in sync with it automatically. Selecting a card applies the theme immediately, matching how the topbar toggle already behaves (no separate save step).

This file isn't imported anywhere yet — that happens in Task 4.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/AppearanceSettings.tsx
git commit -m "$(cat <<'EOF'
Add the Appearance settings panel

A dark/light picker reusing the app's existing theme state — the
first non-AI category in the new Settings hub. Not wired into the
app yet; that happens once the shell exists.
EOF
)"
```

---

### Task 3: Create the `AiProviderSettings` panel

**Files:**
- Create: `src/renderer/src/components/AiProviderSettings.tsx`

- [ ] **Step 1: Write the component**

Create `src/renderer/src/components/AiProviderSettings.tsx` — this is the existing form from `AiSettings.tsx`, moved as-is (same store, same fields, same behavior), minus the outer `<div className="app">`/`<header>` frame, which the new `SettingsScreen` shell now owns:

```tsx
import { useEffect, useState } from 'react'
import type { AiSettings as AiSettingsType } from '@shared/types'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'
import { useAiSettingsStore } from '../store/useAiSettingsStore'

const PROVIDER_OPTIONS: { value: AiSettingsType['provider']; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Claude (Anthropic)' },
  { value: 'gemini', label: 'Gemini (Google)' },
  { value: 'custom', label: 'Custom (OpenAI-compatible)' }
]

export function AiProviderSettings(): React.JSX.Element {
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
  )
}
```

This file isn't imported anywhere yet — that happens in Task 4. `AiSettings.tsx` still exists with its own (now-duplicate) copy of this form; it gets deleted in Task 5 once nothing points at it anymore.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/AiProviderSettings.tsx
git commit -m "$(cat <<'EOF'
Add the AI Provider settings panel

The existing AI settings form, moved into its own file so it can be
one of two categories in the new Settings hub shell, instead of a
whole screen to itself. Same store, same fields, same behavior —
only the outer screen frame is gone (the new shell owns that).
EOF
)"
```

---

### Task 4: Create the `SettingsScreen` shell

**Files:**
- Create: `src/renderer/src/components/SettingsScreen.tsx`

- [ ] **Step 1: Write the component**

Create `src/renderer/src/components/SettingsScreen.tsx`:

```tsx
import { useState } from 'react'
import { AiProviderSettings } from './AiProviderSettings'
import { AppearanceSettings } from './AppearanceSettings'
import { BrandMark } from './BrandMark'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'

type SettingsCategory = 'appearance' | 'ai-provider'

const CATEGORIES: { id: SettingsCategory; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'ai-provider', label: 'AI Provider' }
]

export function SettingsScreen(): React.JSX.Element {
  const leaveSettings = useAppStore((s) => s.leaveSettings)
  const [category, setCategory] = useState<SettingsCategory>('appearance')

  return (
    <div className="app" data-frame="settings">
      <header className="topbar">
        <div className="brand">
          <BrandMark subtitle="Settings" />
        </div>
        <div className="top-controls" />
        <div className="session-chip">
          <button
            type="button"
            className="icon-btn"
            onClick={leaveSettings}
            title="Back to EA Lab"
            aria-label="Back to EA Lab"
          >
            <Icon name="back" />
          </button>
        </div>
      </header>

      <section className="settings-body">
        <nav className="settings-nav">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className="settings-nav-item"
              data-active={category === c.id}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </nav>
        <div className="settings-panel">
          {category === 'appearance' ? <AppearanceSettings /> : <AiProviderSettings />}
        </div>
      </section>
    </div>
  )
}
```

No `ThemeToggle` in this header, unlike every other screen — Appearance is one sidebar click away inside this same screen, so a second theme control right next to it would be redundant. `category` is local `useState`, not app-wide state: it's pure navigation within this one screen, so it doesn't belong in `useAppStore` or a dedicated store.

This file isn't imported anywhere yet — that happens in Task 5.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/SettingsScreen.tsx
git commit -m "$(cat <<'EOF'
Add the SettingsScreen shell

Sidebar of categories (Appearance, AI Provider) + a content panel
that swaps between them. Not wired into App.tsx yet — that's the
next task, once this exists to replace AiSettings with.
EOF
)"
```

---

### Task 5: Wire `SettingsScreen` into the app and delete `AiSettings`

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Delete: `src/renderer/src/components/AiSettings.tsx`

- [ ] **Step 1: Swap the import and the rendered component**

In `src/renderer/src/App.tsx`, find:

```tsx
import { useEffect } from 'react'
import { applyDeskTheme } from '@core/desk/theme'
import { AiSettings } from './components/AiSettings'
import { EaLab } from './components/EaLab'
import { LoadingOverlay } from './components/LoadingOverlay'
```

Replace with:

```tsx
import { useEffect } from 'react'
import { applyDeskTheme } from '@core/desk/theme'
import { EaLab } from './components/EaLab'
import { LoadingOverlay } from './components/LoadingOverlay'
```

Then find:

```tsx
      ) : screen === 'settings' ? (
        <AiSettings />
```

Replace with:

```tsx
      ) : screen === 'settings' ? (
        <SettingsScreen />
```

Then find:

```tsx
import { StrategyLibrary } from './components/StrategyLibrary'
```

Replace with:

```tsx
import { SettingsScreen } from './components/SettingsScreen'
import { StrategyLibrary } from './components/StrategyLibrary'
```

(Inserting here keeps the import list alphabetically ordered, matching the existing convention in this file.)

- [ ] **Step 2: Delete the old component**

```bash
rm src/renderer/src/components/AiSettings.tsx
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (Confirms nothing else still imports the deleted `AiSettings.tsx`.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.tsx
git rm src/renderer/src/components/AiSettings.tsx
git commit -m "$(cat <<'EOF'
Render SettingsScreen for the settings screen

AiSettings.tsx is now fully superseded by SettingsScreen +
AppearanceSettings + AiProviderSettings — deleting it rather than
leaving a dead file around.
EOF
)"
```

---

### Task 6: Style the Settings hub

**Files:**
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Rename the frame variant selector**

Find:

```css
.app[data-frame='full'],
.app[data-frame='library'],
.app[data-frame='ea-lab'],
.app[data-frame='ai-settings'] {
  grid-template-rows: 60px minmax(0, 1fr);
}
```

Replace with:

```css
.app[data-frame='full'],
.app[data-frame='library'],
.app[data-frame='ea-lab'],
.app[data-frame='settings'] {
  grid-template-rows: 60px minmax(0, 1fr);
}
```

- [ ] **Step 2: Replace the old single-card layout with the sidebar/panel layout**

Find:

```css
.ai-settings-body {
  display: grid;
  place-items: center;
  padding: 24px;
  min-height: 0;
}
```

Replace with:

```css
.settings-body {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  min-height: 0;
}

.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 0;
  border-right: 1px solid var(--rule);
  background: var(--vault);
  overflow-y: auto;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 16px;
  border: none;
  border-left: 2px solid transparent;
  background: transparent;
  color: var(--muted);
  font-size: 12.5px;
  font-family: 'Archivo', 'Helvetica Neue', Arial, sans-serif;
  text-align: left;
  cursor: pointer;
}

.settings-nav-item::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--muted);
  flex-shrink: 0;
}

.settings-nav-item[data-active='true'] {
  color: var(--parchment);
  background: var(--steel);
  border-left-color: var(--gold);
}

.settings-nav-item[data-active='true']::before {
  background: var(--gold);
}

.settings-panel {
  padding: 24px;
  overflow-y: auto;
  min-height: 0;
}

.appearance-options {
  display: flex;
  gap: 12px;
}

.appearance-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  width: 150px;
  padding: 14px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, var(--bar-from) 0%, var(--bar-to) 100%);
  color: var(--parchment);
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.appearance-card:hover {
  border-color: var(--gold-dim);
}

.appearance-card[data-active='true'] {
  border-color: var(--gold);
}

.appearance-swatch {
  width: 100%;
  height: 56px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule);
}

.appearance-swatch[data-theme='dark'] {
  background: linear-gradient(135deg, #101317 0%, #1b2128 100%);
}

.appearance-swatch[data-theme='light'] {
  background: linear-gradient(135deg, #f4f5f7 0%, #ffffff 100%);
}
```

Note the two `.appearance-swatch[data-theme=...]` rules use fixed hex colors rather than the `--ink`/`--steel`/`--parchment` tokens on purpose — they're previews of what each theme looks like regardless of which theme is currently active, so they must not repaint themselves when `html[data-theme='light']` overrides those tokens.

(No typecheck applies — CSS isn't typechecked. Verified visually in Task 7.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/styles/global.css
git commit -m "$(cat <<'EOF'
Style the Settings hub sidebar and panels

Replaces the old single-centered-card layout with a sidebar (nav
items with an active-state dot, matching .tab[data-active]'s gold
treatment) + content panel, plus the Appearance category's
selectable Dark/Light cards.
EOF
)"
```

---

### Task 7: Manual verification

**REQUIRED SUB-SKILL:** Use the `run` skill to launch the app for this task, in an isolated data directory so this never touches real saved data.

- [ ] **Step 1: Launch the app**

Build (`npm run build`) and launch the app in an isolated environment.

- [ ] **Step 2: Reach the screen**

From the EA Lab, click the gear icon (now tooltipped "Settings") — confirm it navigates to the Settings screen, with the sidebar showing "Appearance" and "AI Provider", Appearance selected by default.

- [ ] **Step 3: Verify Appearance**

Confirm the Appearance panel shows two cards (Dark, Light) with a preview swatch each, the one matching the current theme visually marked active (gold border). Click the other one — confirm the whole app's theme switches immediately (same effect as the topbar theme toggle elsewhere), and the active card marker moves to match.

- [ ] **Step 4: Verify AI Provider is unchanged**

Click "AI Provider" in the sidebar — confirm the exact same form as before (Provider dropdown, Model field, Base URL field only for Custom, API key field, Test connection, Save) renders and behaves identically to the previous AI Settings screen. This logic didn't change, only its container did, so no new behavior should need testing here beyond "did the move break anything."

- [ ] **Step 5: Verify navigation**

Confirm the back button returns to the EA Lab (not Welcome). Confirm switching between Appearance and AI Provider and back doesn't lose anything unexpected (the AI form re-loads its saved values from the store each time it mounts, same as before).

- [ ] **Step 6: Check both themes**

With the app already able to switch themes from within this screen (Step 3), confirm the sidebar's active-item highlight, the nav dots, and both settings cards read correctly with good contrast in both light and dark mode.

If any step fails, fix the relevant file, re-run `npm run typecheck`, and re-verify before finishing. No commit is needed for this task unless a fix was required, in which case commit the fix with a message describing what was wrong.
