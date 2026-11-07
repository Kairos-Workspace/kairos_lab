import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'

export function ThemeToggle(): React.JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={() => setTheme(next)}
      title={next === 'light' ? 'Paper mode' : 'Mono mode'}
      aria-label={next === 'light' ? 'Switch to paper mode' : 'Switch to mono mode'}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  )
}
