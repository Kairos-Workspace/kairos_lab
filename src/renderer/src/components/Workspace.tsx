import { TopBar } from './TopBar'
import { ChartPanel } from './ChartPanel'
import { RightPanel } from './RightPanel'
import { PerformancePanel } from './PerformancePanel'
import { EquityCurve } from './EquityCurve'
import { TradeHistory } from './TradeHistory'
import { useAppStore } from '../store/useAppStore'

export function Workspace(): React.JSX.Element {
  const chartFull = useAppStore((s) => s.chartFull)

  return (
    <div className="app" data-frame={chartFull ? 'full' : 'desk'}>
      <TopBar />
      <div className="workspace">
        <ChartPanel />
        {chartFull ? null : <RightPanel />}
      </div>
      {chartFull ? null : (
        <div className="bottom">
          <PerformancePanel />
          <EquityCurve />
          <TradeHistory />
        </div>
      )}
    </div>
  )
}
