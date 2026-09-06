import { useState } from 'react'
import { calculatePerformance } from '@core/performance/stats'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'

export function SessionsPanel(): React.JSX.Element {
  const sessions = useAppStore((s) => s.sessions)
  const sessionName = useAppStore((s) => s.sessionName)
  const saveCurrentSession = useAppStore((s) => s.saveCurrentSession)
  const loadSession = useAppStore((s) => s.loadSession)
  const deleteSession = useAppStore((s) => s.deleteSession)
  const trades = useAppStore((s) => s.trades)
  const skipped = useAppStore((s) => s.skipped)
  const account = useAppStore((s) => s.account)
  const [name, setName] = useState(sessionName)
  const live = calculatePerformance(trades, account.initialBalance, skipped)

  return (
    <>
      <h3>Backtest sessions</h3>
      <label className="field">
        Session name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button
        className="primary icon-label"
        onClick={() => void saveCurrentSession(name)}
        title="Save current session"
      >
        <Icon name="save" />
        Save
      </button>
      <p className="muted">
        Live: {live.totalTrades} trades · {live.winRate.toFixed(1)}% · {live.netPnl >= 0 ? '+' : ''}
        ${live.netPnl.toFixed(0)}
      </p>
      {sessions.map((s) => (
        <div key={s.id} className="dataset">
          <div>
            <strong>{s.name}</strong>
            <div className="muted">
              {s.strategyId} · {s.symbol} {s.timeframe} ·{' '}
              {new Date(s.updatedAt).toISOString().slice(0, 10)}
            </div>
          </div>
          <div className="replay-buttons">
            <button
              className="icon-btn"
              onClick={() => void loadSession(s.id)}
              title="Open session"
              aria-label="Open session"
            >
              <Icon name="open" />
            </button>
            <button
              className="icon-btn danger"
              onClick={() => void deleteSession(s.id)}
              title="Delete session"
              aria-label="Delete session"
            >
              <Icon name="trash" />
            </button>
          </div>
        </div>
      ))}
    </>
  )
}
