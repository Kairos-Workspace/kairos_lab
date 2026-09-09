import { useMemo, useState } from 'react'
import {
  MARKET_CATALOG,
  findMarketInstrument,
} from '@core/market/catalog'
import { PRODUCT_NAME } from '@shared/constants'
import { TIMEFRAMES, type DatasetInfo, type Timeframe } from '@shared/types'
import { ConfirmIconButton } from './ConfirmIconButton'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'

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
  const removeTapes = useAppStore((s) => s.removeTapes)
  
  const [view, setView] = useState<MarketView>('data')
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  
  // Modal state
  const [selectedPair, setSelectedPair] = useState<string | null>(null)
  const [timeframes, setTimeframes] = useState<Timeframe[]>(['1H'])
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 2)
    return d.toISOString().slice(0, 10)
  })
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10))

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
    if (timeframes.length === 0 || !selectedPair) return
    try {
      const startTs = new Date(fromDate).getTime()
      const endTs = new Date(toDate).getTime()
      for (const tf of timeframes) {
        await downloadPair({ symbol: selectedPair, timeframe: tf, startTs, endTs })
      }
      setSelectedPair(null)
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
            <div>
              <span className="stamp">Free tape</span>
              <h2>Add a pair</h2>
            </div>
            <div className="search-bar" style={{ width: '300px' }}>
              <input
                type="text"
                placeholder="Search symbol..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--rule)', background: 'var(--steel)', color: 'var(--parchment)' }}
              />
            </div>
          </header>
          
          <div className="pair-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', overflowY: 'auto', paddingBottom: '24px' }}>
            {filteredPairs.map(row => (
              <button
                key={row.symbol}
                className="pair-card ghost"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '16px', border: '1px solid var(--rule)', borderRadius: '8px', cursor: 'pointer', background: 'var(--plate)', transition: 'background 0.2s' }}
                onClick={() => setSelectedPair(row.symbol)}
                onMouseOver={(e) => e.currentTarget.style.background = 'var(--rule)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'var(--plate)'}
              >
                <b style={{ fontSize: '16px', color: 'var(--parchment)' }}>{row.symbol}</b>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{row.name}</span>
              </button>
            ))}
            {/* Custom option */}
            {showCustomOption && (
              <button
                className="pair-card ghost"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '16px', border: '1px dashed var(--rule)', borderRadius: '8px', cursor: 'pointer', background: 'transparent' }}
                onClick={() => setSelectedPair(searchQuery.toUpperCase())}
                onMouseOver={(e) => e.currentTarget.style.background = 'var(--rule)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <b style={{ fontSize: '16px', color: 'var(--parchment)' }}>{searchQuery.toUpperCase()}</b>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Custom Symbol</span>
              </button>
            )}
          </div>
        </section>
      )}

      {/* Modal Overlay for downloading */}
      {selectedPair && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedPair(null)
          }}
        >
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault()
              void addPair()
            }}
          >
            <header>
              <div>
                <span className="stamp">Download Data</span>
                <h2>{selectedPair}</h2>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSelectedPair(null)}
                title="Close"
              >
                <Icon name="close" />
              </button>
            </header>
            
            <div className="field" style={{ border: '1px solid var(--rule)', padding: '12px', borderRadius: 'var(--radius)', background: 'var(--vault)' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>Timeframes</span>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {TIMEFRAMES.map((tf) => (
                  <label key={tf} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '14px' }}>
                    <input
                      type="checkbox"
                      checked={timeframes.includes(tf)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setTimeframes([...timeframes, tf])
                        } else {
                          setTimeframes(timeframes.filter((t) => t !== tf))
                        }
                      }}
                    />
                    {tf}
                  </label>
                ))}
              </div>
            </div>

            <div className="row composer-metrics" style={{ marginTop: '16px' }}>
              <label className="field">
                From Date
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  max={toDate}
                />
              </label>
              <label className="field">
                To Date
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  min={fromDate}
                  max={new Date().toISOString().slice(0, 10)}
                />
              </label>
            </div>

            <div className="composer-actions">
              <button className="primary icon-label" type="submit" disabled={busy || timeframes.length === 0}>
                <Icon name="download" />
                {busy ? 'Working…' : 'Download'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
