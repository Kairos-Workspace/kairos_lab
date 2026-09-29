import { SPEED_OPTIONS, SYMBOLS, TIMEFRAMES } from '@shared/types'
import { sessionAt, formatReplayClock } from '@core/candles/session'
import { exactTimeframesForSymbol, localSymbols } from '@core/candles/dataset'
import { BrandMark } from './BrandMark'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'
import { ThemeToggle } from './ThemeToggle'
import { useCurrentCandle } from '../store/selectors'
import { useAppStore } from '../store/useAppStore'

export function TopBar(): React.JSX.Element {
  const symbol = useAppStore((s) => s.symbol)
  const timeframe = useAppStore((s) => s.displayTimeframe)
  const setTimeframe = useAppStore((s) => s.setTimeframe)
  const selectSymbol = useAppStore((s) => s.selectSymbol)
  const speed = useAppStore((s) => s.speed)
  const setSpeed = useAppStore((s) => s.setSpeed)
  const mode = useAppStore((s) => s.mode)
  const hideDate = useAppStore((s) => s.hideDate)
  const candle = useCurrentCandle()
  const datasets = useAppStore((s) => s.datasets)
  const leaveWorkspace = useAppStore((s) => s.leaveWorkspace)
  const activeStrategyId = useAppStore((s) => s.activeStrategyId)
  const activeEaScriptId = useAppStore((s) => s.activeEaScriptId)
  const sessionName = useAppStore((s) => s.sessionName)
  const showFundamentals = useAppStore((s) => s.showFundamentals)
  const setShowFundamentals = useAppStore((s) => s.setShowFundamentals)
  const strategies = useAppStore((s) => s.strategies)
  const activeName = strategies.find((s) => s.id === activeStrategyId)?.name
  const subtitle = activeEaScriptId
    ? `${sessionName.replace(/ · EA$/, '')} · EA · tester`
    : activeName
      ? `${activeName} · tester`
      : 'Strategy tester'
  const clock = candle ? formatReplayClock(candle.timestamp) : null
  const session = candle ? sessionAt(candle.timestamp) : '—'
  const stored = localSymbols(datasets)
  const pairs = stored.length > 0 ? stored : [...SYMBOLS]
  const downloaded = exactTimeframesForSymbol(datasets, symbol)
  const timeframeOptions = TIMEFRAMES.filter((tf) => tf === timeframe || downloaded.includes(tf))

  return (
    <header className="topbar">
      <div className="brand">
        <button
          className="icon-btn brand-back"
          onClick={leaveWorkspace}
          title="Strategy library"
          aria-label="Back to strategy library"
        >
          <Icon name="back" />
        </button>
        <BrandMark subtitle={subtitle} />
      </div>
      <div className="top-controls">
        <div className="control-group">
          <label>
            Symbol
            <Dropdown
              ariaLabel="Symbol"
              value={symbol}
              onChange={(v) => void selectSymbol(v)}
              options={pairs.map((pair) => ({ value: pair, label: pair }))}
            />
          </label>
          <label>
            Timeframe
            <Dropdown
              ariaLabel="Timeframe"
              value={timeframe}
              onChange={(v) => void setTimeframe(v)}
              options={timeframeOptions.map((tf) => ({ value: tf, label: tf }))}
            />
          </label>
          <label>
            Speed
            <Dropdown
              ariaLabel="Speed"
              value={speed}
              onChange={setSpeed}
              options={SPEED_OPTIONS.map((s) => ({ value: s, label: `${s}x` }))}
            />
          </label>
        </div>
        <button
          type="button"
          className="icon-btn"
          data-active={showFundamentals}
          title={showFundamentals ? 'Hide fundamentals' : 'Show fundamentals'}
          aria-label={showFundamentals ? 'Hide fundamentals' : 'Show fundamentals'}
          aria-pressed={showFundamentals}
          onClick={() => setShowFundamentals(!showFundamentals)}
        >
          Fund
        </button>
        <div className="readout-group">
          <label>
            Date
            <div className="readout-value">
              {clock ? (hideDate && mode === 'replay' ? '••••-••-••' : clock.date) : '—'}
            </div>
          </label>
          <label>
            Time
            <div className="readout-value">{clock ? clock.time : '—'}</div>
          </label>
          <label>
            Session
            <div className="readout-value">{session}</div>
          </label>
        </div>
      </div>
      <div className="session-chip">
        <ThemeToggle />
      </div>
    </header>
  )
}
