import { formatReplayClock } from '@core/candles/session'
import { useAppStore, type HistoryFilter } from '../store/useAppStore'

const FILTERS: HistoryFilter[] = ['ALL', 'WIN', 'LOSS', 'BUY', 'SELL']

export function TradeHistory(): React.JSX.Element {
  const trades = useAppStore((s) => s.trades)
  const skipped = useAppStore((s) => s.skipped)
  const filter = useAppStore((s) => s.historyFilter)
  const setFilter = useAppStore((s) => s.setHistoryFilter)
  const selected = useAppStore((s) => s.selectedTradeId)
  const selectTrade = useAppStore((s) => s.selectTrade)

  const rows = trades.filter((t) => {
    if (filter === 'ALL') return true
    if (filter === 'WIN' || filter === 'LOSS') return t.result === filter
    return t.direction === filter
  })

  return (
    <section>
      <h3>Trade history</h3>
      <div className="filters">
        {FILTERS.map((f) => (
          <button
            key={f}
            className="ghost"
            data-active={filter === f}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
        <span className="muted">Skipped {skipped.length}</span>
      </div>
      <table className="history-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Date</th>
            <th>Dir</th>
            <th>Entry</th>
            <th>Result</th>
            <th>P&L</th>
            <th>R</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr data-empty="true">
              <td colSpan={7}>
                <div className="panel-empty">
                  {trades.length === 0
                    ? 'No trades yet — take a setup during replay to start building your history.'
                    : 'No trades match this filter.'}
                </div>
              </td>
            </tr>
          ) : null}
          {rows.map((t, i) => {
            const clock = formatReplayClock(t.openedAt)
            return (
              <tr
                key={t.id}
                data-selected={selected === t.id}
                onClick={() => selectTrade(t.id)}
              >
                <td>{String(i + 1).padStart(3, '0')}</td>
                <td>
                  {clock.date} {clock.time}
                </td>
                <td className={t.direction === 'BUY' ? 'up' : 'down'}>{t.direction}</td>
                <td>{t.entry.toFixed(2)}</td>
                <td className={t.result === 'WIN' ? 'up' : t.result === 'LOSS' ? 'down' : ''}>
                  {t.result ?? 'OPEN'}
                </td>
                <td>{t.pnl !== undefined ? t.pnl.toFixed(0) : '—'}</td>
                <td>{t.rMultiple !== undefined ? `${t.rMultiple.toFixed(2)}R` : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
