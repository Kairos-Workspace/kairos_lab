import { useEffect, useMemo, useRef } from 'react'
import { formatReplayClock } from '@core/candles/session'
import type { Trade } from '@shared/types'
import { useAppStore, type HistoryFilter } from '../store/useAppStore'

const FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'WIN', label: 'Wins' },
  { id: 'LOSS', label: 'Losses' },
  { id: 'BUY', label: 'Buys' },
  { id: 'SELL', label: 'Sells' }
]

function money(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}$${Math.round(n).toLocaleString()}`
}

function resultTone(result: Trade['result']): 'up' | 'down' | 'flat' {
  if (result === 'WIN') return 'up'
  if (result === 'LOSS') return 'down'
  return 'flat'
}

function matchesFilter(trade: Trade, filter: HistoryFilter): boolean {
  if (filter === 'ALL') return true
  if (filter === 'WIN' || filter === 'LOSS') return trade.result === filter
  return trade.direction === filter
}

export function TradeHistory(): React.JSX.Element {
  const trades = useAppStore((s) => s.trades)
  const skipped = useAppStore((s) => s.skipped)
  const filter = useAppStore((s) => s.historyFilter)
  const setFilter = useAppStore((s) => s.setHistoryFilter)
  const selected = useAppStore((s) => s.selectedTradeId)
  const selectTrade = useAppStore((s) => s.selectTrade)
  const mode = useAppStore((s) => s.mode)
  const listRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => trades.filter((t) => matchesFilter(t, filter)), [trades, filter])

  const closedNet = useMemo(
    () => trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0),
    [trades]
  )

  useEffect(() => {
    if (!selected || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-trade-id="${selected}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected, rows.length])

  return (
    <section className="history-panel">
      <header className="history-head">
        <div className="history-title-row">
          <h3>History</h3>
          <div className="history-summary">
            <span>
              {trades.length} trade{trades.length === 1 ? '' : 's'}
            </span>
            {trades.length > 0 ? (
              <span className={closedNet >= 0 ? 'up' : 'down'}>{money(closedNet)}</span>
            ) : null}
            {skipped.length > 0 ? <span className="muted">· {skipped.length} skipped</span> : null}
          </div>
        </div>
        <div className="history-filters" role="tablist" aria-label="Filter trades">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              data-active={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <div className="history-list" ref={listRef}>
        {rows.length === 0 ? (
          <div className="panel-empty">
            {trades.length === 0
              ? mode === 'replay'
                ? 'No fills yet — take a setup as the tape prints.'
                : 'No trades yet — start a replay and take a setup.'
              : 'Nothing matches this filter.'}
          </div>
        ) : (
          rows.map((t, i) => {
            const clock = formatReplayClock(t.openedAt)
            const tone = resultTone(t.result)
            const label = t.result ?? 'OPEN'
            const isSelected = selected === t.id
            return (
              <button
                key={t.id}
                type="button"
                className="history-row"
                data-trade-id={t.id}
                data-selected={isSelected}
                data-result={label}
                onClick={() => selectTrade(isSelected ? null : t.id)}
                aria-pressed={isSelected}
                title="Jump chart to this fill"
              >
                <span className="history-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="history-main">
                  <span className="history-line">
                    <span className={`history-side ${t.direction === 'BUY' ? 'up' : 'down'}`}>
                      {t.direction}
                    </span>
                    <span className={`history-result ${tone}`}>{label}</span>
                    {t.rMultiple !== undefined ? (
                      <span className={`history-r ${tone}`}>{t.rMultiple.toFixed(2)}R</span>
                    ) : null}
                  </span>
                  <span className="history-meta">
                    <span>
                      {clock.date} · {clock.time}
                    </span>
                    <span>@ {t.entry.toFixed(2)}</span>
                    {t.reason ? <span className="history-reason">{t.reason}</span> : null}
                  </span>
                </span>
                <span className={`history-pnl ${t.pnl !== undefined ? tone : 'flat'}`}>
                  {t.pnl !== undefined ? money(t.pnl) : '—'}
                </span>
              </button>
            )
          })
        )}
      </div>
    </section>
  )
}
