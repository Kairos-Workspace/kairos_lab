import { calculatePositionSize, riskReward } from '@core/trade/sizing'
import { useAppStore } from '../store/useAppStore'

export function TradeTicket(): React.JSX.Element | null {
  const draft = useAppStore((s) => s.draft)
  const pendingSetup = useAppStore((s) => s.pendingSetup)
  const activeTrade = useAppStore((s) => s.activeTrade)
  const updateDraft = useAppStore((s) => s.updateDraft)
  const confirmTrade = useAppStore((s) => s.confirmTrade)
  const skipSetup = useAppStore((s) => s.skipSetup)
  const account = useAppStore((s) => s.account)
  const costs = useAppStore((s) => s.costs)

  if (!draft || activeTrade) return null

  const entry = Number(draft.entry)
  const sl = Number(draft.stopLoss)
  const tp = Number(draft.takeProfit)
  const risk = Number(draft.riskPercent)
  const sized = calculatePositionSize({
    balance: account.balance,
    riskPercent: Number.isFinite(risk) ? risk : account.riskPerTrade,
    entry: Number.isFinite(entry) ? entry : 0,
    stopLoss: Number.isFinite(sl) ? sl : 0,
    costs
  })
  const rr = riskReward(entry, sl, tp)

  function cancel(): void {
    if (pendingSetup) skipSetup()
    else useAppStore.setState({ draft: null })
  }

  return (
    <div className="trade-ticket" role="dialog" aria-labelledby="ticket-title">
      <header className="trade-ticket-header">
        <h4 id="ticket-title">{pendingSetup ? pendingSetup.strategy : 'Manual trade'}</h4>
        <div className="row">
          <button
            type="button"
            className={draft.direction === 'BUY' ? 'primary' : 'ghost'}
            onClick={() => updateDraft({ direction: 'BUY' })}
          >
            Buy
          </button>
          <button
            type="button"
            className={draft.direction === 'SELL' ? 'primary' : 'ghost'}
            onClick={() => updateDraft({ direction: 'SELL' })}
          >
            Sell
          </button>
        </div>
      </header>
      <label className="field">
        Entry
        <input value={draft.entry} onChange={(e) => updateDraft({ entry: e.target.value })} />
      </label>
      <label className="field">
        Stop loss
        <input value={draft.stopLoss} onChange={(e) => updateDraft({ stopLoss: e.target.value })} />
      </label>
      <label className="field">
        Take profit
        <input
          value={draft.takeProfit}
          onChange={(e) => updateDraft({ takeProfit: e.target.value })}
        />
      </label>
      <label className="field">
        Risk %
        <input
          value={draft.riskPercent}
          onChange={(e) => updateDraft({ riskPercent: e.target.value })}
        />
      </label>
      <dl className="trade-ticket-stats">
        <dt>Position</dt>
        <dd>{sized.positionSize.toFixed(2)} lot</dd>
        <dt>Risk USD</dt>
        <dd>${sized.riskAmount.toFixed(2)}</dd>
        <dt>Risk/Reward</dt>
        <dd>1 : {Number.isFinite(rr) ? rr.toFixed(2) : '—'}</dd>
      </dl>
      <div className="ticket-actions">
        <button type="button" className="primary" onClick={confirmTrade}>
          Confirm
        </button>
        <button type="button" className="ghost" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
