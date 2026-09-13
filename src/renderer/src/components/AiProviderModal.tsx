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
