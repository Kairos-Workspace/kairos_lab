import { IconButton } from './ui/IconButton'
import { useAppStore } from '../store/useAppStore'

export function ThemeToggle({ className }: { className?: string } = {}): React.JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <IconButton
      icon={theme === 'dark' ? 'sun' : 'moon'}
      label="Theme"
      size="md"
      className={className}
      onClick={() => setTheme(next)}
    />
  )
}
