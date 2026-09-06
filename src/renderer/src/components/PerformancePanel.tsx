import { usePerformance } from '../store/selectors'

function money(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}$${n.toFixed(0)}`
}

export function PerformancePanel(): React.JSX.Element {
  const stats = usePerformance()
  const pf = Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'

  return (
    <section>
      <h3>Performance</h3>
      <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="stat">
          <span>Trades</span>
          <b>{stats.totalTrades}</b>
        </div>
        <div className="stat">
          <span>Win rate</span>
          <b>{stats.winRate.toFixed(1)}%</b>
        </div>
        <div className="stat">
          <span>Net P&L</span>
          <b className={stats.netPnl >= 0 ? 'up' : 'down'}>{money(stats.netPnl)}</b>
        </div>
        <div className="stat">
          <span>Profit factor</span>
          <b>{pf}</b>
        </div>
        <div className="stat">
          <span>Avg R</span>
          <b>{stats.averageR.toFixed(2)}R</b>
        </div>
        <div className="stat">
          <span>Expectancy</span>
          <b>{stats.expectancy.toFixed(2)}R</b>
        </div>
        <div className="stat">
          <span>Max DD</span>
          <b className="down">{stats.maxDrawdownPct.toFixed(1)}%</b>
        </div>
        <div className="stat">
          <span>Setups</span>
          <b>
            {stats.takenSetups}/{stats.totalSetups}
          </b>
        </div>
      </div>
    </section>
  )
}
