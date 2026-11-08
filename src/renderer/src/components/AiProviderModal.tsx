import { useLayoutEffect, useState } from 'react'
import { SEALION_DEFAULT_MODEL, type AiProviderKind, type AiProviderProfile } from '@shared/types'
import { Dropdown } from './Dropdown'
import { Modal, Button, FormField } from './ui'
import { fetchedModelsFor, modelLabel } from '../lib/aiProviders'
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

  // The fetched cache only ever reflects the profile's currently *saved*
  // provider — switching the dropdown to a different, unsaved provider kind
  // must not keep showing that stale, mismatched model list.
  const fetched = fetchedModelsFor({
    modelsById,
    id,
    selectedProvider: provider,
    savedProvider: profile?.provider ?? null
  })
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
    <Modal
      open={true}
      onClose={onClose}
      size="md"
      stamp="AI"
      title={profile ? 'Edit profile' : 'Add profile'}
      footer={
        <>
          <Button
            variant="ghost"
            type="button"
            disabled={testing || !profile}
            title={profile ? undefined : 'Save this profile first, then test it'}
            onClick={() => void testConnection(id)}
          >
            {testing ? 'Testing…' : 'Test connection'}
          </Button>
          <Button
            variant="primary"
            icon="save"
            type="submit"
            form="ai-provider-form"
          >
            Save
          </Button>
        </>
      }
    >
      <form
        id="ai-provider-form"
        onSubmit={(event) => {
          event.preventDefault()
          void handleSave()
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
      >
        <FormField label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Work OpenAI"
            autoFocus
          />
        </FormField>

        <FormField
          label="Provider"
          hint={provider !== 'custom' ? 'Endpoint is set automatically. Choose a model below.' : undefined}
        >
          <Dropdown
            ariaLabel="Provider"
            value={provider}
            onChange={handleProviderChange}
            options={PROVIDER_OPTIONS}
          />
        </FormField>

        {provider === 'custom' ? (
          <FormField label="Base URL">
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://your-endpoint/v1"
            />
          </FormField>
        ) : null}

        <FormField label="Model" error={modelsError[id]}>
          {modelOptions.length > 0 ? (
            <Dropdown ariaLabel="Model" value={model} onChange={setModel} options={modelOptions} />
          ) : (
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={
                loadingModels[id] ? 'Loading models…' : MODEL_PLACEHOLDERS[provider]
              }
            />
          )}
        </FormField>

        <FormField label="API key">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={profile?.hasApiKey ? 'Key saved — leave blank to keep it' : 'sk-...'}
          />
        </FormField>

        {testResult ? (
          <p className="composer-hint" data-ok={testResult.ok}>
            {testResult.message}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}

