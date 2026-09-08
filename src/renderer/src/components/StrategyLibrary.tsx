import { useEffect, useState } from 'react'
import { STRATEGY_CATALOG } from '@core/strategy/registry'
import { DEFAULT_STRATEGY_SETTINGS } from '@shared/constants'
import type { StrategySettings } from '@shared/types'
import { BrandMark } from './BrandMark'
import { ConfirmIconButton } from './ConfirmIconButton'
import { Icon } from './Icon'
import { ThemeToggle } from './ThemeToggle'
import { MarketDesk } from './MarketDesk'
import { withoutSeeds } from '../store/strategyVault'
import { useAppStore } from '../store/useAppStore'

type LibraryDesk = 'strategies' | 'market'

function engineName(id: string): string {
  return STRATEGY_CATALOG.find((s) => s.id === id)?.name ?? id
}

export function StrategyLibrary(): React.JSX.Element {
  const strategies = withoutSeeds(useAppStore((s) => s.strategies))
  const openStrategy = useAppStore((s) => s.openStrategy)
  const createStrategy = useAppStore((s) => s.createStrategy)
  const deleteSavedStrategy = useAppStore((s) => s.deleteSavedStrategy)
  const purgeSeededStrategies = useAppStore((s) => s.purgeSeededStrategies)
  const [desk, setDesk] = useState<LibraryDesk>('strategies')
  const [composer, setComposer] = useState(false)
  const datasets = useAppStore((s) => s.datasets)
  const tapeCount = new Set(datasets.filter((row) => row.candleCount > 0).map((row) => row.symbol)).size
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [settings, setSettings] = useState<StrategySettings>({ ...DEFAULT_STRATEGY_SETTINGS })

  useEffect(() => {
    purgeSeededStrategies()
  }, [purgeSeededStrategies])

  useEffect(() => {
    if (!composer) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setComposer(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [composer])

  async function submit(): Promise<void> {
    await createStrategy({ name, notes, settings })
    setComposer(false)
    setName('')
    setNotes('')
    setSettings({ ...DEFAULT_STRATEGY_SETTINGS })
  }

  return (
    <div className="app" data-frame="library">
      <header className="topbar">
        <div className="brand">
          <BrandMark subtitle={desk === 'market' ? 'Market tapes' : 'Strategy library'} />
        </div>
        <div className="top-controls">
          <div className="tabs library-tabs">
            <button
              type="button"
              className="tab"
              data-active={desk === 'strategies'}
              onClick={() => setDesk('strategies')}
            >
              Strategies
            </button>
            <button
              type="button"
              className="tab"
              data-active={desk === 'market'}
              onClick={() => setDesk('market')}
            >
              Market
            </button>
          </div>
          <span className="chip">{desk === 'market' ? `${tapeCount} pairs` : `${strategies.length} saved`}</span>
        </div>
        <div className="session-chip">
          <ThemeToggle />
          {desk === 'market' ? (
            <button
              className="icon-btn"
              onClick={() => setDesk('market')}
              title="Download market tape"
              aria-label="Market tapes"
            >
              <Icon name="download" />
            </button>
          ) : (
            <button
              className="icon-btn"
              onClick={() => setComposer(true)}
              title="Create strategy"
              aria-label="Create strategy"
            >
              <Icon name="plus" />
            </button>
          )}
        </div>
      </header>

      {desk === 'market' ? (
        <MarketDesk />
      ) : (
      <section className="library-board">
        {strategies.length === 0 ? (
          <div className="library-empty">
            <h2>No strategies yet</h2>
            <p>Create a setup, then click the card to open the tester.</p>
            <button className="primary icon-label" onClick={() => setComposer(true)}>
              <Icon name="plus" />
              Create
            </button>
          </div>
        ) : (
          <div className="strategy-grid">
            {strategies.map((s) => (
              <article key={s.id} className="strategy-card">
                <button className="strategy-card-main" onClick={() => openStrategy(s.id)}>
                  <span className="stamp">{engineName(s.settings.strategyId)}</span>
                  <strong>{s.name}</strong>
                  <span>
                    {s.notes ||
                      STRATEGY_CATALOG.find((c) => c.id === s.settings.strategyId)?.description}
                  </span>
                  <dl>
                    <div className="stat">
                      <span>Lookback</span>
                      <b>{s.settings.lookback}</b>
                    </div>
                    <div className="stat">
                      <span>RR</span>
                      <b>{s.settings.defaultRr}</b>
                    </div>
                    <div className="stat">
                      <span>Vol</span>
                      <b>{s.settings.volumeMultiplier}</b>
                    </div>
                  </dl>
                </button>
                <ConfirmIconButton
                  className="strategy-delete"
                  icon="trash"
                  label="Delete strategy"
                  confirmLabel={`Click again to delete ${s.name}`}
                  onConfirm={() => void deleteSavedStrategy(s.id)}
                />
              </article>
            ))}
          </div>
        )}
      </section>
      )}

      {composer ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-strategy-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setComposer(false)
          }}
        >
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <header>
              <div>
                <span className="stamp">Library</span>
                <h2 id="new-strategy-title">New strategy</h2>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setComposer(false)}
                title="Close"
                aria-label="Close"
              >
                <Icon name="close" />
              </button>
            </header>
            <label className="field">
              Name
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="London breakout"
              />
            </label>
            <label className="field">
              Engine
              <select
                value={settings.strategyId}
                onChange={(e) => setSettings({ ...settings, strategyId: e.target.value })}
              >
                {STRATEGY_CATALOG.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="composer-hint">
              {STRATEGY_CATALOG.find((s) => s.id === settings.strategyId)?.description}
            </p>
            <div className="row composer-metrics">
              <label className="field">
                {settings.strategyId === 'bbma' ? 'BB period' : 'Lookback'}
                <input
                  type="number"
                  value={settings.lookback}
                  onChange={(e) => setSettings({ ...settings, lookback: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                Default RR
                <input
                  type="number"
                  step="0.1"
                  value={settings.defaultRr}
                  onChange={(e) => setSettings({ ...settings, defaultRr: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                Vol
                <input
                  type="number"
                  step="0.1"
                  value={settings.volumeMultiplier}
                  onChange={(e) =>
                    setSettings({ ...settings, volumeMultiplier: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <label className="field">
              Notes
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional note"
              />
            </label>
            <div className="composer-actions">
              <button type="button" className="ghost" onClick={() => setComposer(false)}>
                Cancel
              </button>
              <button className="primary icon-label" type="submit">
                <Icon name="plus" />
                Create
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
