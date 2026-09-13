import { useMemo, useState } from 'react'
import {
  MARKET_CATALOG,
  findMarketInstrument,
} from '@core/market/catalog'
import { PRODUCT_NAME } from '@shared/constants'
import type { DatasetInfo } from '@shared/types'
import { ConfirmIconButton } from './ConfirmIconButton'
import { DownloadWizard } from './DownloadWizard'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'
import { formatRange } from '../lib/replayRange'

type MarketView = 'data' | 'add'

export function MarketDesk(): React.JSX.Element {
  const datasets = useAppStore((s) => s.datasets)
  const busy = useAppStore((s) => s.busy)
  const status = useAppStore((s) => s.status)
  const refreshTapes = useAppStore((s) => s.refreshTapes)
  const removeTapes = useAppStore((s) => s.removeTapes)

  const [view, setView] = useState<MarketView>('data')

  // Search state
  const [searchQuery, setSearchQuery] = useState('')

  // Download wizard state
  const [selectedPair, setSelectedPair] = useState<string | null>(null)

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

  async function updateLatest(ids: number[]): Promise<void> {
    try {
      await refreshTapes(ids)
    } catch {
      // Store already toasts the failure.
    }
  }

  const filteredPairs = MARKET_CATALOG.filter(row => 
    row.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || 
    row.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const showCustomOption = searchQuery && !MARKET_CATALOG.some(row => row.symbol.toLowerCase() === searchQuery.toLowerCase())

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
                    const ids = tapes.map((row) => row.id)
                    const primary = tapes.reduce((best, row) =>
                      row.candleCount > best.candleCount ? row : best
                    )
                    return (
                      <tr key={pair}>
                        <td className="market-table-pair">
                          <b>{pair}</b>
                          <span className="market-table-sub">{meta?.name ?? 'Custom tape'}</span>
                        </td>
                        <td>
                          <div className="tf-tags">
                            {tapes.map((row) => (
                              <span key={row.id} className="tf-tag">
                                {row.timeframe}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>{primary.candleCount.toLocaleString()}</td>
                        <td>{formatRange(primary.startTs, primary.endTs)}</td>
                        <td>{primary.source}</td>
                        <td>
                          <div className="market-tape-actions">
                            <button
                              type="button"
                              className="icon-btn"
                              title={`Get latest ${pair} data`}
                              aria-label={`Get latest ${pair} data`}
                              disabled={busy}
                              onClick={() => void updateLatest(ids)}
                            >
                              <Icon name="download" />
                            </button>
                            <ConfirmIconButton
                              icon="trash"
                              label={`Remove ${pair}`}
                              confirmLabel={`Click again to remove all ${pair} data`}
                              onConfirm={() => void removeTapes(ids)}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="market-section" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <header className="market-section-header" style={{ marginBottom: '24px' }}>
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search symbol..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <span className="stamp">Free tape</span>
              <h2>Add a pair</h2>
            </div>
          </header>
          
          <div className="pair-grid">
            {filteredPairs.map(row => (
              <button
                key={row.symbol}
                className="pair-card"
                onClick={() => setSelectedPair(row.symbol)}
              >
                <b>{row.symbol}</b>
                <span>{row.name}</span>
              </button>
            ))}
            {/* Custom option */}
            {showCustomOption && (
              <button
                className="pair-card pair-card-custom"
                onClick={() => setSelectedPair(searchQuery.toUpperCase())}
              >
                <b>{searchQuery.toUpperCase()}</b>
                <span>Custom Symbol</span>
              </button>
            )}
          </div>
        </section>
      )}

      {selectedPair ? (
        <DownloadWizard key={selectedPair} symbol={selectedPair} onClose={() => setSelectedPair(null)} />
      ) : null}
    </section>
  )
}
