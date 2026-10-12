import { useEffect } from 'react'
import { applyDeskTheme } from '@core/desk/theme'
import { inDesktopApp } from './lib/desktop'
import { EaLab } from './components/EaLab'
import { LoadingOverlay } from './components/LoadingOverlay'
import { SettingsScreen } from './components/SettingsScreen'
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

  const isDesktop = inDesktopApp()

  return (
    <>
      {screen === 'workspace' ? (
        <Workspace />
      ) : isDesktop && screen === 'welcome' ? (
        <Welcome />
      ) : isDesktop && screen === 'ea-lab' ? (
        <EaLab kind="ea" />
      ) : isDesktop && screen === 'indicator-lab' ? (
        <EaLab kind="indicator" />
      ) : isDesktop && screen === 'settings' ? (
        <SettingsScreen />
      ) : (
        <StrategyLibrary />
      )}
      <LoadingOverlay />
      <ToastHost />
    </>
  )
}
