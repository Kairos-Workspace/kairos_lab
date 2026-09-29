import { TopBar } from './TopBar'
import { ChartPanel } from './ChartPanel'
import { RightPanel } from './RightPanel'
import { PerformancePanel } from './PerformancePanel'
import { EquityCurve } from './EquityCurve'
import { TradeHistory } from './TradeHistory'
import { FundamentalsPanel } from './FundamentalsPanel'
import { useAppStore } from '../store/useAppStore'

export function Workspace(): React.JSX.Element {
  const chartFull = useAppStore((s) => s.chartFull)
  const showFundamentals = useAppStore((s) => s.showFundamentals)

  return (
    <div className="app" data-frame={chartFull ? 'full' : 'desk'}>
      <TopBar />
      <div className="workspace">
        <ChartPanel />
        {chartFull ? null : <RightPanel />}
      </div>
      {chartFull ? null : (
        <div className="bottom" data-fundamentals={showFundamentals ? 'true' : undefined}>
          <PerformancePanel />
          <EquityCurve />
          <TradeHistory />
          {showFundamentals ? <FundamentalsPanel /> : null}
        </div>
      )}
    </div>
  )
}
