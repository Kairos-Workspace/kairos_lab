import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { STRATEGY_CATALOG } from '@core/strategy/registry'
import { DEFAULT_STRATEGY_SETTINGS } from '@shared/constants'
import type { StrategySettings } from '@shared/types'
import { BrandMark } from './BrandMark'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'
import { ThemeToggle } from './ThemeToggle'
import { MarketDesk } from './MarketDesk'
import { Button, FormField, Modal } from './ui'
import { inDesktopApp } from '../lib/desktop'
import { withoutSeeds } from '../store/strategyVault'
import { useAppStore } from '../store/useAppStore'

const FundamentalsDesk = lazy(() =>
  import('./FundamentalsDesk').then((m) => ({ default: m.FundamentalsDesk }))
)

type LibraryDesk = 'strategies' | 'market' | 'fundamentals'

interface StrategyTemplate {
  name: string
  notes: string
  settings: StrategySettings
}

const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    name: 'London Breakout',
    notes: '20-bar lookback breakout targeting 1:2 R:R during London session.',
    settings: {
      strategyId: 'breakout',
      lookback: 20,
      defaultRr: 2.0,
      autoEntry: true,
      pauseOnSetup: false,
      volumeMultiplier: 1.5
    }
  },
  {
    name: 'Golden Cross',
    notes: 'SMA crossover capturing trend continuation swings.',
    settings: {
      strategyId: 'ma-crossover',
      lookback: 40,
      defaultRr: 2.5,
      autoEntry: true,
      pauseOnSetup: true,
      volumeMultiplier: 1.0
    }
  },
  {
    name: 'BBMA Reversal',
    notes: 'Bollinger Band extreme test with rejection entry toward median.',
    settings: {
      strategyId: 'bbma',
      lookback: 20,
      defaultRr: 1.5,
      autoEntry: false,
      pauseOnSetup: true,
      volumeMultiplier: 1.0
    }
  }
]

function engineName(id: string): string {
  return STRATEGY_CATALOG.find((s) => s.id === id)?.name ?? id
}

export function StrategyLibrary(): React.JSX.Element {
  const strategies = withoutSeeds(useAppStore((s) => s.strategies))
  const openStrategy = useAppStore((s) => s.openStrategy)
  const createStrategy = useAppStore((s) => s.createStrategy)
  const updateSavedStrategy = useAppStore((s) => s.updateSavedStrategy)
  const deleteSavedStrategy = useAppStore((s) => s.deleteSavedStrategy)
  const purgeSeededStrategies = useAppStore((s) => s.purgeSeededStrategies)
  const goHome = useAppStore((s) => s.goHome)
  const [desk, setDesk] = useState<LibraryDesk>('strategies')
  const [composer, setComposer] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingStrategy, setDeletingStrategy] = useState<(typeof strategies)[number] | null>(null)
  const [filterQuery, setFilterQuery] = useState('')
  const datasets = useAppStore((s) => s.datasets)
  const fundamentalsSource = useAppStore((s) => s.fundamentalsSource)
  const isDesktop = inDesktopApp()
  const activeDesk: LibraryDesk = !isDesktop && desk === 'fundamentals' ? 'strategies' : desk
  const tapeCount = new Set(datasets.filter((row) => row.candleCount > 0).map((row) => row.symbol)).size
  const chipLabel =
    activeDesk === 'market'
      ? `${tapeCount} pairs`
      : activeDesk === 'fundamentals'
        ? fundamentalsSource === 'custom'
          ? 'Custom'
          : 'Bundled'
        : `${strategies.length} saved`

  const subtitle =
    activeDesk === 'market'
      ? 'Market tapes'
      : activeDesk === 'fundamentals'
        ? 'Macro fundamentals'
        : 'Strategy library'
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [settings, setSettings] = useState<StrategySettings>({ ...DEFAULT_STRATEGY_SETTINGS })

  useEffect(() => {
    purgeSeededStrategies()
  }, [purgeSeededStrategies])

  function openCreate(): void {
    setEditingId(null)
    setName('')
    setNotes('')
    setSettings({ ...DEFAULT_STRATEGY_SETTINGS })
    setComposer(true)
  }

  function applyTemplate(tpl: StrategyTemplate): void {
    setName(tpl.name)
    setNotes(tpl.notes)
    setSettings({ ...tpl.settings })
  }

  function openEdit(s: (typeof strategies)[number]): void {
    setEditingId(s.id)
    setName(s.name)
    setNotes(s.notes)
    setSettings({ ...s.settings })
    setComposer(true)
  }

  async function submit(): Promise<void> {
    if (editingId) {
      await updateSavedStrategy(editingId, { name, notes, settings })
    } else {
      await createStrategy({ name, notes, settings })
    }
    setComposer(false)
    setEditingId(null)
    setName('')
    setNotes('')
    setSettings({ ...DEFAULT_STRATEGY_SETTINGS })
  }

  const filteredStrategies = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return strategies
    return strategies.filter((s) => {
      return (
        s.name.toLowerCase().includes(q) ||
        s.notes.toLowerCase().includes(q) ||
        engineName(s.settings.strategyId).toLowerCase().includes(q)
      )
    })
  }, [strategies, filterQuery])

  return (
    <div className="app" data-frame="library">
      <header className="topbar">
        <div className="brand">
          <BrandMark subtitle={subtitle} />
        </div>
        <div className="top-controls">
          <div className="tabs library-tabs">
            <button
              type="button"
              className="tab"
              data-active={activeDesk === 'strategies'}
              onClick={() => setDesk('strategies')}
            >
              Strategies
            </button>
            <button
              type="button"
              className="tab"
              data-active={activeDesk === 'market'}
              onClick={() => setDesk('market')}
            >
              Market
            </button>
            {isDesktop && (
              <button
                type="button"
                className="tab"
                data-active={activeDesk === 'fundamentals'}
                onClick={() => setDesk('fundamentals')}
              >
                Fundamental
              </button>
            )}
          </div>
          <span className="chip library-status">{chipLabel}</span>
        </div>
        <div className="session-chip">
          {isDesktop && (
            <button
              type="button"
              className="icon-btn"
              onClick={goHome}
              title="Home"
              aria-label="Home"
            >
              <Icon name="home" />
            </button>
          )}
          <ThemeToggle />
          {activeDesk === 'market' ? (
            <button
              className="icon-btn"
              onClick={() => setDesk('market')}
              title="Download market tape"
              aria-label="Market tapes"
            >
              <Icon name="download" />
            </button>
          ) : activeDesk === 'fundamentals' ? (
            <button
              className="icon-btn"
              onClick={() => setDesk('fundamentals')}
              title="Macro fundamentals"
              aria-label="Macro fundamentals"
            >
              <Icon name="download" />
            </button>
          ) : (
            <button
              className="icon-btn"
              onClick={openCreate}
              title="Create strategy"
              aria-label="Create strategy"
            >
              <Icon name="plus" />
            </button>
          )}
        </div>
      </header>

      {activeDesk === 'market' ? (
        <MarketDesk />
      ) : activeDesk === 'fundamentals' ? (
        <Suspense fallback={null}>
          <FundamentalsDesk />
        </Suspense>
      ) : (
        <section className="library-board">
          {strategies.length > 4 && (
            <div className="library-search-bar">
              <input
                type="text"
                placeholder="Search strategies..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
              />
              {filterQuery && (
                <button
                  type="button"
                  className="library-search-clear"
                  onClick={() => setFilterQuery('')}
                  title="Clear"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {strategies.length === 0 ? (
            <div className="library-empty">
              <h2>No strategies yet</h2>
              <p>Create a setup, then click the card to open the tester.</p>
              <Button variant="primary" icon="plus" onClick={openCreate}>
                Create
              </Button>
            </div>
          ) : filteredStrategies.length === 0 ? (
            <div className="library-empty">
              <h2>No matching strategies</h2>
              <p>No results found for &quot;{filterQuery}&quot;.</p>
              <Button variant="ghost" onClick={() => setFilterQuery('')}>
                Clear filter
              </Button>
            </div>
          ) : (
            <div className="strategy-grid">
              {filteredStrategies.map((s) => (
                <article key={s.id} className="strategy-card">
                  <div className="strategy-card-header">
                    <span className="stamp">{engineName(s.settings.strategyId)}</span>
                    <div className="strategy-card-actions">
                      <button
                        type="button"
                        className="icon-btn strategy-action-btn"
                        title="Edit strategy"
                        aria-label={`Edit ${s.name}`}
                        onClick={() => openEdit(s)}
                      >
                        <Icon name="edit" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger strategy-action-btn"
                        title="Delete strategy"
                        aria-label={`Delete ${s.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeletingStrategy(s)
                        }}
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="strategy-card-main"
                    onClick={() => void openStrategy(s.id)}
                  >
                    <strong className="strategy-card-title">{s.name}</strong>
                    <span className="strategy-card-desc">
                      {s.notes || STRATEGY_CATALOG.find((c) => c.id === s.settings.strategyId)?.description}
                    </span>

                    <div className="strategy-card-meta">
                      <span>{s.settings.lookback} bars</span>
                      <span className="dot">·</span>
                      <span>1:{s.settings.defaultRr} R:R</span>
                      <span className="dot">·</span>
                      <span className={s.settings.autoEntry ? 'meta-bull' : 'meta-dim'}>
                        {s.settings.autoEntry ? 'Auto' : 'Manual'}
                      </span>
                      {s.settings.pauseOnSetup && (
                        <>
                          <span className="dot">·</span>
                          <span className="meta-warn">Pause</span>
                        </>
                      )}
                    </div>
                  </button>

                  <div className="strategy-card-footer">
                    <Button
                      variant="primary"
                      icon="play"
                      size="sm"
                      fullWidth
                      onClick={() => void openStrategy(s.id)}
                      className="strategy-start"
                    >
                      Start
                    </Button>
                  </div>
                </article>
              ))}

              <button type="button" className="strategy-card-add" onClick={openCreate}>
                <Icon name="plus" />
                <span>New strategy</span>
              </button>
            </div>
          )}
        </section>
      )}

      <Modal
        open={composer}
        onClose={() => {
          setComposer(false)
          setEditingId(null)
        }}
        stamp="Library"
        title={editingId ? 'Edit strategy' : 'New strategy'}
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setComposer(false)
                setEditingId(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={editingId ? 'check' : 'plus'}
              type="submit"
              form="strategy-composer-form"
            >
              {editingId ? 'Save' : 'Create'}
            </Button>
          </>
        }
      >
        <form
          id="strategy-composer-form"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
        >
          {!editingId && (
            <div className="composer-preset-row">
              <span className="muted">Quick preset:</span>
              <div className="composer-preset-tags">
                {STRATEGY_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.name}
                    type="button"
                    className="composer-preset-chip"
                    onClick={() => applyTemplate(tpl)}
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <FormField label="Name">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="London breakout"
            />
          </FormField>
          <FormField
            label="Engine"
            hint={STRATEGY_CATALOG.find((s) => s.id === settings.strategyId)?.description}
          >
            <Dropdown
              ariaLabel="Engine"
              value={settings.strategyId}
              onChange={(v) => setSettings({ ...settings, strategyId: v })}
              options={STRATEGY_CATALOG.map((s) => ({ value: s.id, label: s.name }))}
            />
          </FormField>
          <FormField label="Notes">
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note"
            />
          </FormField>
        </form>
      </Modal>

      <Modal
        open={Boolean(deletingStrategy)}
        onClose={() => setDeletingStrategy(null)}
        stamp="Delete"
        title="Delete Strategy"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              type="button"
              onClick={() => setDeletingStrategy(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              icon="trash"
              type="button"
              onClick={async () => {
                if (!deletingStrategy) return
                const id = deletingStrategy.id
                setDeletingStrategy(null)
                await deleteSavedStrategy(id)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, color: 'var(--parchment)', lineHeight: 1.5 }}>
          Are you sure you want to delete <strong>{deletingStrategy?.name}</strong>?
        </p>
        <p style={{ margin: 0, fontSize: 'var(--font-sm)', color: 'var(--muted)', lineHeight: 1.5 }}>
          This cannot be undone. All configuration and notes for this strategy will be permanently removed.
        </p>
      </Modal>
    </div>
  )
}
