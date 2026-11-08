import type { DeskTheme } from '@shared/types'
import { Badge } from './ui'
import { useAppStore } from '../store/useAppStore'

const THEME_OPTIONS: { value: DeskTheme; label: string }[] = [
  { value: 'dark', label: 'Mono' },
  { value: 'light', label: 'Paper' }
]

export function AppearanceSettings(): React.JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)

  return (
    <div className="composer">
      <header>
        <div>
          <Badge variant="stamp" size="sm">UI</Badge>
          <h2>Appearance</h2>
        </div>
      </header>

      <p className="composer-hint">Quiet mono shell, clear green/red on the tape and PnL.</p>

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
