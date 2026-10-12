import { useState } from 'react'
import { STRATEGY_CATALOG } from '@core/strategy/registry'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'
import { ReplayRangeModal } from './ReplayRangeModal'
import { inDesktopApp } from '../lib/desktop'
import { useAppStore } from '../store/useAppStore'

export function StrategyPanel(): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const setSettings = useAppStore((s) => s.setSettings)
  const account = useAppStore((s) => s.account)
  const setAccountRisk = useAppStore((s) => s.setAccountRisk)
  const activeStrategyId = useAppStore((s) => s.activeStrategyId)
  const activeEaScriptId = useAppStore((s) => s.activeEaScriptId)
  const sessionName = useAppStore((s) => s.sessionName)
  const strategies = useAppStore((s) => s.strategies)
  const showFundamentals = useAppStore((s) => s.showFundamentals)
  const setShowFundamentals = useAppStore((s) => s.setShowFundamentals)
  const activeName = strategies.find((s) => s.id === activeStrategyId)?.name
  const botName = sessionName.replace(/ · EA$/, '')
  const [showRangeModal, setShowRangeModal] = useState(false)

  if (activeEaScriptId) {
    return (
      <>
        <h3>Bot backtest</h3>
        <p className="muted">
          Running <strong>{botName}</strong> from Bot Lab. Signals come from your bot rules — not
          the catalog strategies below.
        </p>
        <div className="row">
          <label className="field">
            Default RR
            <input
              type="number"
              step="0.1"
              value={settings.defaultRr}
              onChange={(e) => setSettings({ defaultRr: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            Risk %
            <input
              type="number"
              step="0.1"
              value={account.riskPerTrade}
              onChange={(e) => setAccountRisk(Number(e.target.value))}
            />
          </label>
        </div>
        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={settings.autoEntry}
              onChange={(e) => setSettings({ autoEntry: e.target.checked })}
            />{' '}
            Auto entry
          </span>
        </label>
        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={settings.pauseOnSetup}
              onChange={(e) => setSettings({ pauseOnSetup: e.target.checked })}
              disabled={settings.autoEntry}
            />{' '}
            Pause on setup{settings.autoEntry ? ' (off while auto entry)' : ''}
          </span>
        </label>
        <button
          className="primary icon-label"
          onClick={() => setShowRangeModal(true)}
          title="Choose period and start replay"
        >
          <Icon name="play" />
          Start replay
        </button>
        {inDesktopApp() && (
          <label className="field">
            <span>
              <input
                type="checkbox"
                checked={showFundamentals}
                onChange={(e) => setShowFundamentals(e.target.checked)}
              />{' '}
              Show fundamentals
            </span>
          </label>
        )}
        {showRangeModal ? <ReplayRangeModal onClose={() => setShowRangeModal(false)} /> : null}
      </>
    )
  }

  return (
    <>
      <h3>{activeName ?? 'Strategy settings'}</h3>
      <label className="field">
        Strategy
        <Dropdown
          ariaLabel="Strategy"
          value={settings.strategyId}
          onChange={(v) => setSettings({ strategyId: v })}
          options={STRATEGY_CATALOG.map((s) => ({ value: s.id, label: s.name }))}
        />
      </label>
      <p className="muted">
        {STRATEGY_CATALOG.find((s) => s.id === settings.strategyId)?.description}
      </p>
      {settings.strategyId === 'none' ? (
        <div className="row">
          <label className="field">
            Default RR
            <input
              type="number"
              step="0.1"
              value={settings.defaultRr}
              onChange={(e) => setSettings({ defaultRr: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            Risk %
            <input
              type="number"
              step="0.1"
              value={account.riskPerTrade}
              onChange={(e) => setAccountRisk(Number(e.target.value))}
            />
          </label>
        </div>
      ) : (
        <>
          <div className="row">
            <label className="field">
              {settings.strategyId === 'bbma' ? 'BB period' : 'Lookback / slow MA'}
              <input
                type="number"
                value={settings.lookback}
                onChange={(e) => setSettings({ lookback: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              Default RR
              <input
                type="number"
                step="0.1"
                value={settings.defaultRr}
                onChange={(e) => setSettings({ defaultRr: Number(e.target.value) })}
              />
            </label>
          </div>
          <div className="row">
            <label className="field">
              Risk %
              <input
                type="number"
                step="0.1"
                value={account.riskPerTrade}
                onChange={(e) => setAccountRisk(Number(e.target.value))}
              />
            </label>
            <label className="field">
              Volume multiple
              <input
                type="number"
                step="0.1"
                value={settings.volumeMultiplier}
                onChange={(e) => setSettings({ volumeMultiplier: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="field">
            <span>
              <input
                type="checkbox"
                checked={settings.pauseOnSetup}
                onChange={(e) => setSettings({ pauseOnSetup: e.target.checked })}
              />{' '}
              Pause on setup
            </span>
          </label>
          <label className="field">
            <span>
              <input
                type="checkbox"
                checked={settings.autoEntry}
                onChange={(e) => setSettings({ autoEntry: e.target.checked })}
              />{' '}
              Auto entry
            </span>
          </label>
        </>
      )}
      <button
        className="primary icon-label"
        onClick={() => setShowRangeModal(true)}
        title="Start replay from warmup"
      >
        <Icon name="play" />
        Start
      </button>
      {inDesktopApp() && (
        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={showFundamentals}
              onChange={(e) => setShowFundamentals(e.target.checked)}
            />{' '}
            Show fundamentals
          </span>
        </label>
      )}
      {showRangeModal ? <ReplayRangeModal onClose={() => setShowRangeModal(false)} /> : null}
    </>
  )
}
