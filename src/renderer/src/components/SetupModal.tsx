import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'

export function SetupModal(): React.JSX.Element | null {
  const setup = useAppStore((s) => s.pendingSetup)
  const tradeOpen = useAppStore((s) => s.tradeModalOpen)
  const takeSetup = useAppStore((s) => s.takeSetup)
  const skipSetup = useAppStore((s) => s.skipSetup)
  if (!setup || tradeOpen) return null

  return (
    <div className="modal-backdrop" role="dialog" aria-labelledby="setup-title">
      <div className="ticket">
        <header>
          <h2 id="setup-title">Setup detected</h2>
          <span className="stamp">{setup.strategy}</span>
        </header>
        <dl>
          <dt>Direction</dt>
          <dd className={setup.type === 'LONG' ? 'up' : 'down'}>{setup.type}</dd>
          <dt>Price</dt>
          <dd>{setup.price.toFixed(2)}</dd>
          <dt>Reason</dt>
          <dd>{setup.reason ?? '—'}</dd>
        </dl>
        <div className="ticket-actions">
          <button className="primary icon-label" onClick={takeSetup} title="Take trade">
            <Icon name="check" />
            Take
          </button>
          <button className="ghost icon-label" onClick={skipSetup} title="Skip setup">
            <Icon name="skip" />
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}
