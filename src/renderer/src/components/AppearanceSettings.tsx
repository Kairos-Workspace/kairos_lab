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

      <p className="composer-hint">Choose how Kairos looks. Applies immediately, everywhere.</p>

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
