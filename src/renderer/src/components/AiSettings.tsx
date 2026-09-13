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
