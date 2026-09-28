import { useState } from 'react'
import { labCopy } from '@shared/scriptLab'
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
  const settingsReturnScreen = useAppStore((s) => s.settingsReturnScreen)
  const [category, setCategory] = useState<SettingsCategory>('appearance')
  const backLabel = labCopy(
    settingsReturnScreen === 'indicator-lab' ? 'indicator' : 'ea'
  ).settingsBack

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
            title={backLabel}
            aria-label={backLabel}
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
          {category === 'appearance' ? <AppearanceSettings /> : null}
          {category === 'ai-provider' ? <AiProviderSettings /> : null}
        </div>
      </section>
    </div>
  )
}
