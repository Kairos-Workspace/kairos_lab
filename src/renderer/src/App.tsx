import { useEffect } from 'react'
import { applyDeskTheme } from '@core/desk/theme'
import { AiSettings } from './components/AiSettings'
import { EaLab } from './components/EaLab'
import { LoadingOverlay } from './components/LoadingOverlay'
import { StrategyLibrary } from './components/StrategyLibrary'
import { ToastHost } from './components/ToastHost'
import { Welcome } from './components/Welcome'
import { Workspace } from './components/Workspace'
import { useKeyboard } from './hooks/useKeyboard'
import { useAppStore } from './store/useAppStore'

export function App(): React.JSX.Element {
  const bootstrap = useAppStore((s) => s.bootstrap)
  const screen = useAppStore((s) => s.screen)
  const theme = useAppStore((s) => s.theme)
  useKeyboard()

  useEffect(() => {
    applyDeskTheme(theme)
  }, [theme])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  return (
    <>
      {screen === 'workspace' ? (
        <Workspace />
      ) : screen === 'welcome' ? (
        <Welcome />
      ) : screen === 'ea-lab' ? (
        <EaLab />
      ) : screen === 'settings' ? (
        <AiSettings />
      ) : (
        <StrategyLibrary />
      )}
      <LoadingOverlay />
      <ToastHost />
    </>
  )
}
