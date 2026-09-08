import { useMemo, useState } from 'react'
import {
  DOWNLOAD_LOOKBACKS,
  MARKET_CATALOG,
  findMarketInstrument,
  resolveMarketSource,
  type DownloadLookbackId
} from '@core/market/catalog'
import { PRODUCT_NAME } from '@shared/constants'
import { TIMEFRAMES, type DatasetInfo, type Timeframe } from '@shared/types'
import { ConfirmIconButton } from './ConfirmIconButton'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'

const CUSTOM = '__custom__'

type MarketView = 'data' | 'add'

function formatRange(startTs: number, endTs: number): string {
  if (!startTs || !endTs) return 'Range pending'
  const from = new Date(startTs).toISOString().slice(0, 10)
  const to = new Date(endTs).toISOString().slice(0, 10)
  return `${from} → ${to}`
}

export function MarketDesk(): React.JSX.Element {
  const datasets = useAppStore((s) => s.datasets)
  const busy = useAppStore((s) => s.busy)
  const status = useAppStore((s) => s.status)
  const downloadPair = useAppStore((s) => s.downloadPair)
  const refreshTapes = useAppStore((s) => s.refreshTapes)
  const removeTape = useAppStore((s) => s.removeTape)
  const [view, setView] = useState<MarketView>('data')
  const [symbol, setSymbol] = useState('EURUSD')
  const [custom, setCustom] = useState('')
  const [timeframe, setTimeframe] = useState<Timeframe>('1H')
  const [lookback, setLookback] = useState<DownloadLookbackId>('2y')

  const selected = symbol === CUSTOM ? custom : symbol
  const route = resolveMarketSource(selected)
  const instrument = findMarketInstrument(selected)
  const lookbackMs = DOWNLOAD_LOOKBACKS.find((row) => row.id === lookback)?.ms ?? DOWNLOAD_LOOKBACKS[2].ms

  const rows = useMemo(() => {
    return datasets
      .filter((row) => row.candleCount > 0)
      .slice()
      .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.timeframe.localeCompare(b.timeframe))
  }, [datasets])

  const groups = useMemo(() => {
    const bySymbol = new Map<string, DatasetInfo[]>()
    for (const row of rows) {
      const list = bySymbol.get(row.symbol) ?? []
      list.push(row)
      bySymbol.set(row.symbol, list)
    }
    return [...bySymbol.values()]
  }, [rows])

  const pairCount = groups.length

  async function addPair(): Promise<void> {
    try {
      await downloadPair({ symbol: selected, timeframe, lookbackMs })
    } catch {
      // Store already toasts the failure.
    }
  }

  async function updateLatest(ids: number[]): Promise<void> {
    try {
      await refreshTapes(ids)
    } catch {
      // Store already toasts the failure.
    }
  }

  return (
    <section className="library-board market-desk">
      <div className="tabs market-tabs">
        <button
          type="button"
          className="tab"
          data-active={view === 'data'}
          onClick={() => setView('data')}
        >
          Your data
        </button>
        <button
          type="button"
          className="tab"
          data-active={view === 'add'}
          onClick={() => setView('add')}
        >
          Add a pair
        </button>
      </div>

      {view === 'data' ? (
        <section className="market-section">
          <header className="market-section-header">
            <span className="muted">
              {busy ? status : `${pairCount} pair${pairCount === 1 ? '' : 's'} stored`}
            </span>
            <button
              type="button"
              className="ghost icon-label"
              disabled={busy || rows.length === 0}
              onClick={() => void updateLatest(rows.map((row) => row.id))}
            >
              <Icon name="download" />
              Get latest
            </button>
          </header>

          {rows.length === 0 ? (
            <div className="library-empty">
              <h2>No market tapes yet</h2>
              <p>Switch to Add a pair and {PRODUCT_NAME} will pull free history for the tester.</p>
              <button className="primary icon-label" onClick={() => setView('add')}>
                <Icon name="plus" />
                Add a pair
              </button>
            </div>
          ) : (
            <div className="market-table-shell">
              <table className="history-table market-table">
                <thead>
                  <tr>
                    <th>Pair</th>
                    <th>Timeframe</th>
                    <th>Bars</th>
                    <th>Range</th>
                    <th>Source</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {groups.map((tapes) => {
                    const pair = tapes[0].symbol
                    const meta = findMarketInstrument(pair)
                    return tapes.map((row, i) => (
                      <tr key={row.id} data-group-start={i === 0}>
                        {i === 0 ? (
                          <td className="market-table-pair" rowSpan={tapes.length}>
                            <b>{pair}</b>
                            <span className="market-table-sub">{meta?.name ?? 'Custom tape'}</span>
                          </td>
                        ) : null}
                        <td>{row.timeframe}</td>
                        <td>{row.candleCount.toLocaleString()}</td>
                        <td>{formatRange(row.startTs, row.endTs)}</td>
                        <td>{row.source}</td>
                        <td>
                          <div className="market-tape-actions">
                            <button
                              type="button"
                              className="icon-btn"
                              title={`Get latest ${row.symbol} ${row.timeframe}`}
                              aria-label={`Get latest ${row.symbol} ${row.timeframe}`}
                              disabled={busy}
                              onClick={() => void updateLatest([row.id])}
                            >
                              <Icon name="download" />
                            </button>
                            <ConfirmIconButton
                              icon="trash"
                              label={`Remove ${row.symbol} ${row.timeframe}`}
                              confirmLabel={`Click again to remove ${row.symbol} ${row.timeframe}`}
                              onConfirm={() => void removeTape(row.id)}
                            />
                          </div>
                        </td>
                      </tr>
                    ))
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="market-section">
          <form
            className="market-add"
            onSubmit={(event) => {
              event.preventDefault()
              void addPair()
            }}
          >
            <header className="market-section-header">
              <div>
                <span className="stamp">Free tape</span>
                <h2>Search &amp; add a pair</h2>
              </div>
              <p>
                {instrument?.name ?? (selected.toUpperCase() || 'Custom')} ·{' '}
                {route.source === 'dukascopy' ? 'Dukascopy' : 'Yahoo Finance'}
              </p>
            </header>
            <div className="row composer-metrics">
              <label className="field">
                Pair
                <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                  {MARKET_CATALOG.map((row) => (
                    <option key={row.symbol} value={row.symbol}>
                      {row.symbol} · {row.name}
                    </option>
                  ))}
                  <option value={CUSTOM}>Custom…</option>
                </select>
              </label>
              <label className="field">
                Timeframe
                <select value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)}>
                  {TIMEFRAMES.map((tf) => (
                    <option key={tf} value={tf}>
                      {tf}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                History
                <select
                  value={lookback}
                  onChange={(e) => setLookback(e.target.value as DownloadLookbackId)}
                >
                  {DOWNLOAD_LOOKBACKS.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {symbol === CUSTOM ? (
              <label className="field">
                Custom symbol
                <input
                  autoFocus
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="AUDUSD or AAPL"
                />
              </label>
            ) : null}
            <p className="composer-hint">
              XAUUSD stays on the desk. Minute tapes use a shorter window so the pull stays light.
            </p>
            <div className="composer-actions">
              <button className="primary icon-label" type="submit" disabled={busy}>
                <Icon name="plus" />
                {busy ? 'Working…' : 'Download'}
              </button>
            </div>
          </form>
        </section>
      )}
    </section>
  )
}
