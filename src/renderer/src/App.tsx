import { Suspense, lazy, useEffect } from 'react'
import { applyDeskTheme } from '@core/desk/theme'
import { inDesktopApp } from './lib/desktop'
import { LoadingOverlay } from './components/LoadingOverlay'
import { StrategyLibrary } from './components/StrategyLibrary'
import { ToastHost } from './components/ToastHost'
import { Workspace } from './components/Workspace'
import { useKeyboard } from './hooks/useKeyboard'
import { useAppStore } from './store/useAppStore'

const EaLab = lazy(() => import('./components/EaLab').then((m) => ({ default: m.EaLab })))
const SettingsScreen = lazy(() => import('./components/SettingsScreen').then((m) => ({ default: m.SettingsScreen })))
const Welcome = lazy(() => import('./components/Welcome').then((m) => ({ default: m.Welcome })))
const KeyboardShortcutsModal = lazy(() =>
  import('./components/KeyboardShortcutsModal').then((m) => ({ default: m.KeyboardShortcutsModal }))
)

export function App(): React.JSX.Element {
  const bootstrap = useAppStore((s) => s.bootstrap)
  const screen = useAppStore((s) => s.screen)
  const theme = useAppStore((s) => s.theme)
  const shortcutsOpen = useAppStore((s) => s.shortcutsModalOpen)
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsModalOpen)
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
      <Suspense fallback={null}>
        {screen === 'workspace' ? (
          <Workspace />
        ) : isDesktop && screen === 'welcome' ? (
          <Welcome />
        ) : isDesktop && screen === 'ea-lab' ? (
          <EaLab kind="ea" />
        ) : isDesktop && screen === 'indicator-lab' ? (
          <EaLab kind="indicator" />
        ) : screen === 'settings' ? (
          <SettingsScreen />
        ) : (
          <StrategyLibrary />
        )}
      </Suspense>
      {shortcutsOpen ? (
        <Suspense fallback={null}>
          <KeyboardShortcutsModal onClose={() => setShortcutsOpen(false)} />
        </Suspense>
      ) : null}
      <LoadingOverlay />
      <ToastHost />
    </>
  )
}
