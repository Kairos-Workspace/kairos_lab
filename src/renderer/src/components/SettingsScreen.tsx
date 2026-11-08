import { useState } from 'react'
import { labCopy } from '@shared/scriptLab'
import { AiProviderSettings } from './AiProviderSettings'
import { AppearanceSettings } from './AppearanceSettings'
import { BrandMark } from './BrandMark'
import { IconButton } from './ui/IconButton'
import { ThemeToggle } from './ThemeToggle'
import { useAppStore } from '../store/useAppStore'

type SettingsCategory = 'appearance' | 'ai-provider'

const CATEGORIES: { id: SettingsCategory; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'ai-provider', label: 'AI Provider' }
]

export function SettingsScreen(): React.JSX.Element {
  const leaveSettings = useAppStore((s) => s.leaveSettings)
  const settingsReturnScreen = useAppStore((s) => s.settingsReturnScreen)
  const goHome = useAppStore((s) => s.goHome)
  const enterLibrary = useAppStore((s) => s.enterLibrary)
  const enterEaLab = useAppStore((s) => s.enterEaLab)
  const enterIndicatorLab = useAppStore((s) => s.enterIndicatorLab)
  const setShortcutsModalOpen = useAppStore((s) => s.setShortcutsModalOpen)
  const [category, setCategory] = useState<SettingsCategory>('appearance')
  const backLabel =
    settingsReturnScreen === 'workspace'
      ? 'Back to Workspace'
      : settingsReturnScreen === 'library'
        ? 'Back to Strategy Lab'
        : settingsReturnScreen === 'welcome'
          ? 'Back to Home'
          : labCopy(settingsReturnScreen === 'indicator-lab' ? 'indicator' : 'ea').settingsBack

  return (
    <div className="app" data-frame="settings">
      <header className="topbar">
        <div className="brand">
          <BrandMark subtitle="Settings" />
        </div>
        <div className="top-controls" />
        <div className="session-chip">
          <IconButton icon="home" label="Home" onClick={goHome} />
          <IconButton icon="strategy" label="Strategy Lab" onClick={enterLibrary} />
          <IconButton icon="chat" label="Bot Lab" onClick={enterEaLab} />
          <IconButton icon="indicators" label="Indicator Lab" onClick={enterIndicatorLab} />
          <IconButton icon="help" label="Keyboard Shortcuts" onClick={() => setShortcutsModalOpen(true)} />
          <ThemeToggle />
          <IconButton icon="back" label={backLabel} onClick={leaveSettings} />
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
