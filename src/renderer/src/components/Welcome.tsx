import { BrandMark } from './BrandMark'
import { ThemeToggle } from './ThemeToggle'
import { WelcomeChartBackdrop } from './WelcomeChartBackdrop'
import { useAppStore } from '../store/useAppStore'

export function Welcome(): React.JSX.Element {
  const enterLibrary = useAppStore((s) => s.enterLibrary)

  return (
    <div className="app" data-frame="welcome">
      <div className="welcome-screen">
        <WelcomeChartBackdrop />
        <div className="welcome-theme-toggle">
          <ThemeToggle />
        </div>
        <div className="brand">
          <BrandMark subtitle="Backtesting desk" />
        </div>
        <div className="welcome-labs">
          <button type="button" className="welcome-lab-card" onClick={enterLibrary}>
            <strong>Strategy Lab</strong>
            <span>Backtest and manage strategies</span>
          </button>
          <div className="welcome-lab-card" data-disabled="true">
            <strong>EA Development Lab</strong>
            <span>Build automated trading bots</span>
            <span className="welcome-lab-soon">Coming soon</span>
          </div>
        </div>
      </div>
    </div>
  )
}
