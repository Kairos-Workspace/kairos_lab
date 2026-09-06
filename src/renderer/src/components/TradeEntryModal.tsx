import { calculatePositionSize, riskReward } from '@core/trade/sizing'
import { useAppStore } from '../store/useAppStore'

export function TradeEntryModal(): React.JSX.Element | null {
  const open = useAppStore((s) => s.tradeModalOpen)
  const draft = useAppStore((s) => s.draft)
  const updateDraft = useAppStore((s) => s.updateDraft)
  const confirmTrade = useAppStore((s) => s.confirmTrade)
  const account = useAppStore((s) => s.account)
  const costs = useAppStore((s) => s.costs)
  if (!open || !draft) return null

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

  return (
    <div className="modal-backdrop" role="dialog" aria-labelledby="entry-title">
      <div className="ticket">
        <header>
          <h2 id="entry-title">Trade setup</h2>
          <span className="stamp">Dealing ticket</span>
        </header>
        <div className="row">
          <button
            className={draft.direction === 'BUY' ? 'primary' : 'ghost'}
            onClick={() => updateDraft({ direction: 'BUY' })}
          >
            Buy
          </button>
          <button
            className={draft.direction === 'SELL' ? 'primary' : 'ghost'}
            onClick={() => updateDraft({ direction: 'SELL' })}
          >
            Sell
          </button>
        </div>
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
        <dl>
          <dt>Position</dt>
          <dd>{sized.positionSize.toFixed(2)} lot</dd>
          <dt>Risk USD</dt>
          <dd>${sized.riskAmount.toFixed(2)}</dd>
          <dt>Risk/Reward</dt>
          <dd>1 : {Number.isFinite(rr) ? rr.toFixed(2) : '—'}</dd>
        </dl>
        <div className="ticket-actions">
          <button className="primary icon-label" onClick={confirmTrade}>
            Confirm
          </button>
          <button
            className="ghost"
            onClick={() =>
              useAppStore.setState({ tradeModalOpen: false, draft: null, pendingSetup: null })
            }
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
