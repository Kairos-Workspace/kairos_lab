import { unrealizedPnl } from '@core/trade/simulation'
import { riskReward } from '@core/trade/sizing'
import { useAppStore } from '../store/useAppStore'
import { useCurrentCandle } from '../store/selectors'

function money(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}`
}

export function TradePanel(): React.JSX.Element {
  const active = useAppStore((s) => s.activeTrade)
  const selectedId = useAppStore((s) => s.selectedTradeId)
  const trades = useAppStore((s) => s.trades)
  const account = useAppStore((s) => s.account)
  const costs = useAppStore((s) => s.costs)
  const candle = useCurrentCandle()
  const liveMark = useAppStore((s) => s.liveMark)
  const reviewed = trades.find((t) => t.id === selectedId)
  const trade = active ?? reviewed

  if (!trade) {
    return (
      <>
        <h3>Trade</h3>
        <p className="muted">
          No open position. Take a strategy setup when one prints, or use Buy / Sell on the chart
          to start a trade yourself.
        </p>
        <div className="stat">
          <span>Virtual account</span>
          <b>${account.balance.toFixed(2)}</b>
        </div>
      </>
    )
  }

  const rr = riskReward(trade.entry, trade.stopLoss, trade.takeProfit)
  const mark = liveMark ?? candle?.close
  const floating =
    active && mark != null ? unrealizedPnl(trade, mark, costs.contractSize) : null
  const closedPnl = trade.pnl
  const equity =
    floating != null ? account.balance + floating : account.balance

  return (
    <>
      <h3>{active ? 'Open position' : 'Reviewed trade'}</h3>
      <dl className="ticket" style={{ boxShadow: 'none', borderColor: 'var(--rule)', width: 'auto' }}>
        <dt>Direction</dt>
        <dd className={trade.direction === 'BUY' ? 'up' : 'down'}>{trade.direction}</dd>
        <dt>Entry</dt>
        <dd>{trade.entry.toFixed(2)}</dd>
        <dt>Stop</dt>
        <dd>{trade.stopLoss.toFixed(2)}</dd>
        <dt>Target</dt>
        <dd>{trade.takeProfit.toFixed(2)}</dd>
        <dt>Size</dt>
        <dd>{trade.positionSize.toFixed(2)} lot</dd>
        <dt>Risk</dt>
        <dd>${trade.riskAmount.toFixed(2)}</dd>
        <dt>RR</dt>
        <dd>1 : {rr.toFixed(2)}</dd>
        {floating != null ? (
          <>
            <dt>Floating PnL</dt>
            <dd className={floating >= 0 ? 'up' : 'down'}>{money(floating)}</dd>
          </>
        ) : null}
        {closedPnl != null ? (
          <>
            <dt>PnL</dt>
            <dd className={closedPnl >= 0 ? 'up' : 'down'}>{money(closedPnl)}</dd>
          </>
        ) : null}
        {trade.result ? (
          <>
            <dt>Result</dt>
            <dd className={trade.result === 'WIN' ? 'up' : 'down'}>
              {trade.result} {trade.rMultiple?.toFixed(2)}R
            </dd>
          </>
        ) : null}
        <dt>Reason</dt>
        <dd>{trade.reason ?? '—'}</dd>
      </dl>
      <div className="stat">
        <span>{floating != null ? 'Equity' : 'Balance'}</span>
        <b>${equity.toFixed(2)}</b>
      </div>
    </>
  )
}
