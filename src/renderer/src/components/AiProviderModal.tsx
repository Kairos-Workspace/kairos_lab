import { useLayoutEffect, useState } from 'react'
import { SEALION_DEFAULT_MODEL, type AiProviderKind, type AiProviderProfile } from '@shared/types'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'
import { useAiProvidersStore } from '../store/useAiProvidersStore'

const PROVIDER_OPTIONS: { value: AiProviderKind; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Claude (Anthropic)' },
  { value: 'gemini', label: 'Gemini (Google)' },
  { value: 'sealion', label: 'SEA-LION' },
  { value: 'custom', label: 'Custom (OpenAI-compatible)' }
]

const MODEL_PLACEHOLDERS: Record<AiProviderKind, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5',
  gemini: 'gemini-2.5-flash',
  sealion: SEALION_DEFAULT_MODEL,
  custom: 'model-id'
}

function modelLabel(id: string): string {
  const slash = id.lastIndexOf('/')
  return slash >= 0 ? id.slice(slash + 1) : id
}

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
  const loadModels = useAiProvidersStore((s) => s.loadModels)
  const modelsById = useAiProvidersStore((s) => s.modelsById)
  const loadingModels = useAiProvidersStore((s) => s.loadingModels)
  const modelsError = useAiProvidersStore((s) => s.modelsError)

  useLayoutEffect(() => {
    clearTestResult()
  }, [clearTestResult])

  const [id] = useState(() => profile?.id ?? crypto.randomUUID())
  const [name, setName] = useState(profile?.name ?? '')
  const [provider, setProvider] = useState<AiProviderKind>(profile?.provider ?? 'openai')
  const [model, setModel] = useState(profile?.model ?? '')
  const [baseUrl, setBaseUrl] = useState(profile?.baseUrl ?? '')
  const [apiKey, setApiKey] = useState('')

  useLayoutEffect(() => {
    if (profile?.hasApiKey) void loadModels(id)
  }, [id, profile?.hasApiKey, loadModels])

  const fetched = modelsById[id] ?? []
  const modelOptions = (model && !fetched.includes(model) ? [model, ...fetched] : fetched).map(
    (value) => ({ value, label: modelLabel(value) })
  )

  function handleProviderChange(next: AiProviderKind): void {
    setProvider(next)
    if (next === 'sealion') {
      setName((current) => current || 'SEA-LION')
      setModel((current) => current || SEALION_DEFAULT_MODEL)
    }
  }

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
          <Dropdown
            ariaLabel="Provider"
            value={provider}
            onChange={handleProviderChange}
            options={PROVIDER_OPTIONS}
          />
        </label>
        {provider !== 'custom' ? (
          <p className="composer-hint">Endpoint is set automatically. Choose a model below.</p>
        ) : null}

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
          Model
          {modelOptions.length > 0 ? (
            <Dropdown ariaLabel="Model" value={model} onChange={setModel} options={modelOptions} />
          ) : (
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={
                loadingModels ? 'Loading models…' : MODEL_PLACEHOLDERS[provider]
              }
            />
          )}
        </label>
        {modelsError ? (
          <p className="composer-hint" data-ok="false">
            {modelsError}
          </p>
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

