import { useState } from 'react'
import { STRATEGY_CATALOG } from '@core/strategy/registry'
import { Dropdown } from './Dropdown'
import { ReplayRangeModal } from './ReplayRangeModal'
import { Button, Checkbox, FormField } from './ui'
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
          <FormField label="Default RR">
            <input
              type="number"
              step="0.1"
              value={settings.defaultRr}
              onChange={(e) => setSettings({ defaultRr: Number(e.target.value) })}
            />
          </FormField>
          <FormField label="Risk %">
            <input
              type="number"
              step="0.1"
              value={account.riskPerTrade}
              onChange={(e) => setAccountRisk(Number(e.target.value))}
            />
          </FormField>
        </div>
        <Checkbox
          label="Auto entry"
          checked={settings.autoEntry}
          onChange={(e) => setSettings({ autoEntry: e.target.checked })}
        />
        <Checkbox
          label={`Pause on setup${settings.autoEntry ? ' (off while auto entry)' : ''}`}
          checked={settings.pauseOnSetup}
          onChange={(e) => setSettings({ pauseOnSetup: e.target.checked })}
          disabled={settings.autoEntry}
        />
        <Button
          variant="primary"
          icon="play"
          onClick={() => setShowRangeModal(true)}
          title="Choose period and start replay"
        >
          Start replay
        </Button>
        <Checkbox
          label="Show fundamentals"
          checked={showFundamentals}
          onChange={(e) => setShowFundamentals(e.target.checked)}
        />
        {showRangeModal ? <ReplayRangeModal onClose={() => setShowRangeModal(false)} /> : null}
      </>
    )
  }

  return (
    <>
      <h3>{activeName ?? 'Strategy settings'}</h3>
      <FormField label="Strategy">
        <Dropdown
          ariaLabel="Strategy"
          value={settings.strategyId}
          onChange={(v) => setSettings({ strategyId: v })}
          options={STRATEGY_CATALOG.map((s) => ({ value: s.id, label: s.name }))}
        />
      </FormField>
      <p className="muted">
        {STRATEGY_CATALOG.find((s) => s.id === settings.strategyId)?.description}
      </p>
      {settings.strategyId === 'none' ? (
        <div className="row">
          <FormField label="Default RR">
            <input
              type="number"
              step="0.1"
              value={settings.defaultRr}
              onChange={(e) => setSettings({ defaultRr: Number(e.target.value) })}
            />
          </FormField>
          <FormField label="Risk %">
            <input
              type="number"
              step="0.1"
              value={account.riskPerTrade}
              onChange={(e) => setAccountRisk(Number(e.target.value))}
            />
          </FormField>
        </div>
      ) : (
        <>
          <div className="row">
            <FormField label={settings.strategyId === 'bbma' ? 'BB period' : 'Lookback / slow MA'}>
              <input
                type="number"
                value={settings.lookback}
                onChange={(e) => setSettings({ lookback: Number(e.target.value) })}
              />
            </FormField>
            <FormField label="Default RR">
              <input
                type="number"
                step="0.1"
                value={settings.defaultRr}
                onChange={(e) => setSettings({ defaultRr: Number(e.target.value) })}
              />
            </FormField>
          </div>
          <div className="row">
            <FormField label="Risk %">
              <input
                type="number"
                step="0.1"
                value={account.riskPerTrade}
                onChange={(e) => setAccountRisk(Number(e.target.value))}
              />
            </FormField>
            <FormField label="Volume multiple">
              <input
                type="number"
                step="0.1"
                value={settings.volumeMultiplier}
                onChange={(e) => setSettings({ volumeMultiplier: Number(e.target.value) })}
              />
            </FormField>
          </div>
          <Checkbox
            label={`Pause on setup${settings.autoEntry ? ' (off while auto entry)' : ''}`}
            checked={settings.pauseOnSetup}
            onChange={(e) => setSettings({ pauseOnSetup: e.target.checked })}
            disabled={settings.autoEntry}
            aria-label="Pause on setup"
          />
          <Checkbox
            label="Auto entry"
            checked={settings.autoEntry}
            onChange={(e) => setSettings({ autoEntry: e.target.checked })}
          />
        </>
      )}
      <Button
        variant="primary"
        icon="play"
        onClick={() => setShowRangeModal(true)}
        title="Start replay from warmup"
      >
        Start
      </Button>
      <Checkbox
        label="Show fundamentals"
        checked={showFundamentals}
        onChange={(e) => setShowFundamentals(e.target.checked)}
      />
      {showRangeModal ? <ReplayRangeModal onClose={() => setShowRangeModal(false)} /> : null}
    </>
  )
}
