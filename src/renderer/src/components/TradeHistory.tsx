import { useEffect, useMemo, useRef } from 'react'
import { formatReplayClock } from '@core/candles/session'
import type { Trade } from '@shared/types'
import { Icon } from './Icon'
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

  function exportTrades(): void {
    if (trades.length === 0) return
    const symbol = useAppStore.getState().symbol || 'XAUUSD'
    const headers = [
      'Trade ID',
      'Symbol',
      'Direction',
      'Open Time',
      'Close Time',
      'Entry Price',
      'Stop Loss',
      'Take Profit',
      'Position Size (Lots)',
      'Risk ($)',
      'Result',
      'P&L ($)',
      'Return (R)',
      'Reason'
    ]
    const lines = [headers.join(',')]
    for (const t of trades) {
      lines.push(
        [
          t.id,
          t.symbol || symbol,
          t.direction,
          new Date(t.openedAt).toISOString(),
          t.closedAt ? new Date(t.closedAt).toISOString() : '',
          t.entry.toFixed(2),
          t.stopLoss.toFixed(2),
          t.takeProfit.toFixed(2),
          t.positionSize.toFixed(2),
          t.riskAmount.toFixed(2),
          t.result ?? 'OPEN',
          (t.pnl ?? 0).toFixed(2),
          t.rMultiple != null ? t.rMultiple.toFixed(2) : '',
          `"${(t.reason ?? '').replace(/"/g, '""')}"`
        ].join(',')
      )
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `kairos-trades-${symbol.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

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
            {trades.length > 0 ? (
              <button
                type="button"
                className="export-csv-btn"
                onClick={exportTrades}
                title="Export trades as CSV"
                aria-label="Export trades as CSV"
              >
                <Icon name="download" size={12} />
                <span>Export CSV</span>
              </button>
            ) : null}
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
