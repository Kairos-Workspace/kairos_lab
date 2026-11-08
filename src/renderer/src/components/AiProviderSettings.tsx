import { useEffect, useState } from 'react'
import type { AiProviderProfile } from '@shared/types'
import { AiProviderModal } from './AiProviderModal'
import { ConfirmIconButton } from './ConfirmIconButton'
import { Badge, Button, IconButton } from './ui'
import { useAiProvidersStore } from '../store/useAiProvidersStore'

const PROVIDER_BADGE_LABELS: Record<AiProviderProfile['provider'], string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  sealion: 'SEA-LION',
  custom: 'Custom'
}

export function AiProviderSettings(): React.JSX.Element {
  const providers = useAiProvidersStore((s) => s.providers)
  const loadProviders = useAiProvidersStore((s) => s.loadProviders)
  const deleteProvider = useAiProvidersStore((s) => s.deleteProvider)

  const [modalTarget, setModalTarget] = useState<AiProviderProfile | 'new' | null>(null)

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  return (
    <div className="composer">
      <header>
        <div>
          <Badge variant="stamp" size="sm">AI</Badge>
          <h2>AI provider profiles</h2>
        </div>
        <Button variant="ghost" icon="plus" size="sm" onClick={() => setModalTarget('new')}>
          Add profile
        </Button>
      </header>

      {providers.length === 0 ? (
        <p className="provider-empty">No AI providers configured yet.</p>
      ) : (
        <ul className="provider-list">
          {providers.map((p) => (
            <li key={p.id} className="provider-row">
              <div className="provider-row-info">
                <div className="provider-row-title">
                  <strong>{p.name}</strong>
                  <span className="provider-badge">{PROVIDER_BADGE_LABELS[p.provider]}</span>
                </div>
                <span>{p.model}</span>
              </div>
              <div className="provider-row-actions">
                <IconButton
                  icon="edit"
                  label={`Edit ${p.name}`}
                  size="sm"
                  onClick={() => setModalTarget(p)}
                />
                <ConfirmIconButton
                  icon="trash"
                  label="Delete profile"
                  confirmLabel={`Click again to delete ${p.name}`}
                  onConfirm={() => void deleteProvider(p.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {modalTarget ? (
        <AiProviderModal
          profile={modalTarget === 'new' ? null : modalTarget}
          onClose={() => setModalTarget(null)}
        />
      ) : null}
    </div>
  )
}
