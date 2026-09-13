import { BrandMark } from './BrandMark'
import { ThemeToggle } from './ThemeToggle'
import { withoutSeeds } from '../store/strategyVault'
import { useAppStore } from '../store/useAppStore'

export function Welcome(): React.JSX.Element {
  const strategies = withoutSeeds(useAppStore((s) => s.strategies))
  const datasets = useAppStore((s) => s.datasets)
  const enterLibrary = useAppStore((s) => s.enterLibrary)
  const tapeCount = new Set(
    datasets.filter((row) => row.candleCount > 0).map((row) => row.symbol)
  ).size

  return (
    <div className="app" data-frame="welcome">
      <div className="welcome-screen">
        <div className="welcome-theme-toggle">
          <ThemeToggle />
        </div>
        <div className="brand">
          <BrandMark subtitle="Backtesting desk" />
        </div>
        <div className="welcome-stats">
          <span className="chip">{strategies.length} strategies saved</span>
          <span className="chip">{tapeCount} pairs downloaded</span>
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
