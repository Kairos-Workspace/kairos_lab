import { useMemo, useState } from 'react'
import {
  DOWNLOAD_LOOKBACKS,
  MARKET_CATALOG,
  findMarketInstrument,
  resolveMarketSource,
  type DownloadLookbackId
} from '@core/market/catalog'
import { PRODUCT_NAME } from '@shared/constants'
import { TIMEFRAMES, type Timeframe } from '@shared/types'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'

const CUSTOM = '__custom__'

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
  const [symbol, setSymbol] = useState('EURUSD')
  const [custom, setCustom] = useState('')
  const [timeframe, setTimeframe] = useState<Timeframe>('1H')
  const [lookback, setLookback] = useState<DownloadLookbackId>('2y')

  const selected = symbol === CUSTOM ? custom : symbol
  const route = resolveMarketSource(selected)
  const instrument = findMarketInstrument(selected)
  const lookbackMs = DOWNLOAD_LOOKBACKS.find((row) => row.id === lookback)?.ms ?? DOWNLOAD_LOOKBACKS[2].ms

  const groups = useMemo(() => {
    const bySymbol = new Map<string, typeof datasets>()
    for (const row of datasets) {
      if (row.candleCount <= 0) continue
      const list = bySymbol.get(row.symbol) ?? []
      list.push(row)
      bySymbol.set(row.symbol, list)
    }
    return [...bySymbol.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [datasets])

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
      <form
        className="market-add"
        onSubmit={(event) => {
          event.preventDefault()
          void addPair()
        }}
      >
        <header>
          <div>
            <span className="stamp">Free tape</span>
            <h2>Add a pair</h2>
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
          <span className="muted">
            {busy ? status : `${groups.length} pair${groups.length === 1 ? '' : 's'} stored`}
          </span>
          <div className="market-add-actions">
            <button
              type="button"
              className="ghost icon-label"
              disabled={busy || groups.length === 0}
              onClick={() => void updateLatest(groups.flatMap(([, tapes]) => tapes.map((tape) => tape.id)))}
            >
              <Icon name="download" />
              Get latest
            </button>
            <button className="primary icon-label" type="submit" disabled={busy}>
              <Icon name="plus" />
              {busy ? 'Working…' : 'Download'}
            </button>
          </div>
        </div>
      </form>

      {groups.length === 0 ? (
        <div className="library-empty">
          <h2>No market tapes yet</h2>
          <p>Add a pair and {PRODUCT_NAME} will pull free history for the tester.</p>
        </div>
      ) : (
        <div className="strategy-grid">
          {groups.map(([pair, tapes]) => {
            const meta = findMarketInstrument(pair)
            return (
              <article key={pair} className="strategy-card market-card">
                <div className="strategy-card-main">
                  <span className="stamp">{meta?.group ?? 'custom'}</span>
                  <div className="market-card-title">
                    <strong>{pair}</strong>
                    <button
                      type="button"
                      className="ghost icon-label"
                      disabled={busy}
                      onClick={() => void updateLatest(tapes.map((tape) => tape.id))}
                    >
                      <Icon name="download" />
                      Get latest
                    </button>
                  </div>
                  <span>{meta?.name ?? 'Custom tape'}</span>
                  <ul className="market-tapes">
                    {tapes
                      .slice()
                      .sort((a, b) => a.timeframe.localeCompare(b.timeframe))
                      .map((tape) => (
                        <li key={tape.id}>
                          <div>
                            <b>{tape.timeframe}</b>
                            <span>
                              {tape.candleCount.toLocaleString()} bars · {tape.source} ·{' '}
                              {formatRange(tape.startTs, tape.endTs)}
                            </span>
                          </div>
                          <div className="market-tape-actions">
                            <button
                              type="button"
                              className="icon-btn"
                              title={`Get latest ${pair} ${tape.timeframe}`}
                              aria-label={`Get latest ${pair} ${tape.timeframe}`}
                              disabled={busy}
                              onClick={() => void updateLatest([tape.id])}
                            >
                              <Icon name="download" />
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              title={`Remove ${pair} ${tape.timeframe}`}
                              aria-label={`Remove ${pair} ${tape.timeframe}`}
                              disabled={busy}
                              onClick={() => void removeTape(tape.id)}
                            >
                              <Icon name="trash" />
                            </button>
                          </div>
                        </li>
                      ))}
                  </ul>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
