import { riskReward } from '@core/trade/sizing'
import { useAppStore } from '../store/useAppStore'

export function TradePanel(): React.JSX.Element {
  const active = useAppStore((s) => s.activeTrade)
  const selectedId = useAppStore((s) => s.selectedTradeId)
  const trades = useAppStore((s) => s.trades)
  const account = useAppStore((s) => s.account)
  const reviewed = trades.find((t) => t.id === selectedId)
  const trade = active ?? reviewed

  if (!trade) {
    return (
      <>
        <h3>Trade</h3>
        <p className="muted">
          No open position. When a setup prints, take it and configure entry, stop, and target
          here.
        </p>
        <div className="stat">
          <span>Virtual account</span>
          <b>${account.balance.toFixed(2)}</b>
        </div>
      </>
    )
  }

  const rr = riskReward(trade.entry, trade.stopLoss, trade.takeProfit)

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
        <span>Balance</span>
        <b>${account.balance.toFixed(2)}</b>
      </div>
    </>
  )
}
