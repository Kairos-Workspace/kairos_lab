import { BrandMark } from './BrandMark'
import { ThemeToggle } from './ThemeToggle'
import { IconButton } from './ui/IconButton'
import { Badge } from './ui/Badge'
import { useAppStore } from '../store/useAppStore'

export function Welcome(): React.JSX.Element {
  const enterLibrary = useAppStore((s) => s.enterLibrary)
  const enterEaLab = useAppStore((s) => s.enterEaLab)
  const enterIndicatorLab = useAppStore((s) => s.enterIndicatorLab)
  const enterSettings = useAppStore((s) => s.enterSettings)
  const setShortcutsModalOpen = useAppStore((s) => s.setShortcutsModalOpen)

  return (
    <div className="app" data-frame="welcome" style={{ gridTemplateRows: '60px minmax(0, 1fr)' }}>
      <header className="topbar">
        <div className="brand">
          <BrandMark subtitle="Backtesting desk" />
        </div>
        <div className="top-controls" />
        <div className="session-chip">
          <IconButton icon="strategy" label="Strategy Lab" onClick={enterLibrary} />
          <IconButton icon="chat" label="Bot Lab" onClick={enterEaLab} />
          <IconButton icon="indicators" label="Indicator Lab" onClick={enterIndicatorLab} />
          <IconButton icon="help" label="Keyboard Shortcuts" onClick={() => setShortcutsModalOpen(true)} />
          <ThemeToggle />
          <IconButton icon="settings" label="Settings" onClick={enterSettings} />
        </div>
      </header>
      <div className="welcome-screen">
        <div className="brand">
          <BrandMark subtitle="Backtesting desk" />
        </div>
        <div className="welcome-labs">
          <button type="button" className="welcome-lab-card" onClick={enterLibrary}>
            <Badge variant="stamp">Desk</Badge>
            <strong>Strategy Lab</strong>
            <span>Backtest and manage strategies</span>
          </button>
          <button type="button" className="welcome-lab-card" onClick={enterEaLab}>
            <Badge variant="stamp">Bots</Badge>
            <strong>Bot Lab</strong>
            <span>Build bots with AI and backtest them here</span>
          </button>
          <button type="button" className="welcome-lab-card" onClick={enterIndicatorLab}>
            <Badge variant="stamp">Editor</Badge>
            <strong>Indicator Lab</strong>
            <span>Build MQL5 and Pine Script indicators</span>
          </button>
        </div>
      </div>
    </div>
  )
}
