import { useEffect, useRef, useState } from 'react'
import { calculatePositionSize, riskReward } from '@core/trade/sizing'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'

interface TicketPosition {
  left: number
  top: number
}

export function TradeTicket(): React.JSX.Element | null {
  const draft = useAppStore((s) => s.draft)
  const pendingSetup = useAppStore((s) => s.pendingSetup)
  const activeTrade = useAppStore((s) => s.activeTrade)
  const updateDraft = useAppStore((s) => s.updateDraft)
  const confirmTrade = useAppStore((s) => s.confirmTrade)
  const skipSetup = useAppStore((s) => s.skipSetup)
  const account = useAppStore((s) => s.account)
  const costs = useAppStore((s) => s.costs)
  const ticketRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<TicketPosition | null>(null)

  // draft.timestamp is stable across field edits (entry/SL/TP/risk/direction
  // patches never touch it) but changes whenever a genuinely new draft
  // starts — reset any drag position from a previous trade so each new
  // ticket opens at the default spot instead of wherever the last one was
  // left.
  useEffect(() => {
    setPosition(null)
  }, [draft?.timestamp])

  if (!draft || activeTrade) return null

  function startDrag(event: React.PointerEvent<HTMLElement>): void {
    if ((event.target as HTMLElement).closest('button')) return
    event.preventDefault()
    const ticketEl = ticketRef.current
    const parentEl = ticketEl?.offsetParent as HTMLElement | null
    if (!ticketEl || !parentEl) return
    const ticketRect = ticketEl.getBoundingClientRect()
    const parentRect = parentEl.getBoundingClientRect()
    const startLeft = ticketRect.left - parentRect.left
    const startTop = ticketRect.top - parentRect.top
    const startX = event.clientX
    const startY = event.clientY
    const maxLeft = Math.max(0, parentRect.width - ticketRect.width)
    const maxTop = Math.max(0, parentRect.height - ticketRect.height)
    const move = (ev: PointerEvent): void => {
      setPosition({
        left: Math.min(Math.max(0, startLeft + (ev.clientX - startX)), maxLeft),
        top: Math.min(Math.max(0, startTop + (ev.clientY - startY)), maxTop)
      })
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointercancel', up)
    window.addEventListener('pointerup', up)
  }

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
    <div
      ref={ticketRef}
      className="trade-ticket"
      role="dialog"
      aria-labelledby="ticket-title"
      style={position ? { left: position.left, top: position.top, right: 'auto' } : undefined}
    >
      <header className="trade-ticket-header" onPointerDown={startDrag}>
        <h4 id="ticket-title">{pendingSetup ? pendingSetup.strategy : 'Manual trade'}</h4>
        <span
          className={`direction-tag ${draft.direction === 'BUY' ? 'direction-tag-buy' : 'direction-tag-sell'}`}
        >
          <Icon name={draft.direction === 'BUY' ? 'arrowUp' : 'arrowDown'} size={12} />
          {draft.direction}
        </span>
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
