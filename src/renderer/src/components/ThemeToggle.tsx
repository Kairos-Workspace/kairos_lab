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
      title={next === 'light' ? 'Light mode' : 'Dark mode'}
      aria-label={next === 'light' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  )
}
