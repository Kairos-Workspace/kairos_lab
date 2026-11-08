import { SPEED_OPTIONS, SYMBOLS, TIMEFRAMES } from '@shared/types'
import { sessionAt, formatReplayClock } from '@core/candles/session'
import { localSymbols } from '@core/candles/dataset'
import { BrandMark } from './BrandMark'
import { Dropdown } from './Dropdown'
import { IconButton } from './ui/IconButton'
import { ThemeToggle } from './ThemeToggle'
import { useCurrentCandle } from '../store/selectors'
import { useAppStore, type MultiChartLayout } from '../store/useAppStore'

export function TopBar(): React.JSX.Element {
  const symbol = useAppStore((s) => s.symbol)
  const timeframe = useAppStore((s) => s.displayTimeframe)
  const setTimeframe = useAppStore((s) => s.setTimeframe)
  const chartLayout = useAppStore((s) => s.chartLayout)
  const setChartLayout = useAppStore((s) => s.setChartLayout)
  const chartFull = useAppStore((s) => s.chartFull)
  const toggleChartFull = useAppStore((s) => s.toggleChartFull)
  const selectSymbol = useAppStore((s) => s.selectSymbol)
  const speed = useAppStore((s) => s.speed)
  const setSpeed = useAppStore((s) => s.setSpeed)
  const mode = useAppStore((s) => s.mode)
  const hideDate = useAppStore((s) => s.hideDate)
  const candle = useCurrentCandle()
  const datasets = useAppStore((s) => s.datasets)
  const leaveWorkspace = useAppStore((s) => s.leaveWorkspace)
  const goHome = useAppStore((s) => s.goHome)
  const enterLibrary = useAppStore((s) => s.enterLibrary)
  const enterEaLab = useAppStore((s) => s.enterEaLab)
  const enterIndicatorLab = useAppStore((s) => s.enterIndicatorLab)
  const enterSettings = useAppStore((s) => s.enterSettings)
  const setShortcutsModalOpen = useAppStore((s) => s.setShortcutsModalOpen)
  const activeStrategyId = useAppStore((s) => s.activeStrategyId)
  const activeEaScriptId = useAppStore((s) => s.activeEaScriptId)
  const sessionName = useAppStore((s) => s.sessionName)
  const strategies = useAppStore((s) => s.strategies)
  const activeName = strategies.find((s) => s.id === activeStrategyId)?.name
  const subtitle = activeEaScriptId
    ? `${sessionName.replace(/ · (EA|Bot)$/, '')} · bot tester`
    : activeName
      ? `${activeName} · tester`
      : 'Strategy tester'
  const clock = candle ? formatReplayClock(candle.timestamp) : null
  const session = candle ? sessionAt(candle.timestamp) : '—'
  const stored = localSymbols(datasets)
  const pairs = stored.length > 0 ? stored : [...SYMBOLS]
  const timeframeOptions = TIMEFRAMES

  return (
    <header className="topbar">
      <div className="brand">
        <IconButton
          icon="back"
          label={activeEaScriptId ? 'Back to Bot Lab' : 'Back to Strategy Lab'}
          className="brand-back"
          onClick={leaveWorkspace}
        />
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
            Layout
            <Dropdown
              ariaLabel="Chart layout"
              value={chartLayout}
              onChange={(v) => setChartLayout(v as MultiChartLayout)}
              options={[
                { value: 1, label: '1 Chart' },
                { value: 2, label: '2 Charts (Dual)' },
                { value: 3, label: '3 Charts' },
                { value: 4, label: '4 Charts (Quad)' }
              ]}
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
        <IconButton
          icon="home"
          label="Home"
          onClick={goHome}
        />
        <IconButton
          icon="strategy"
          label="Strategy Lab"
          onClick={enterLibrary}
        />
        <IconButton
          icon="chat"
          label="Bot Lab"
          onClick={enterEaLab}
        />
        <IconButton
          icon="indicators"
          label="Indicator Lab"
          onClick={enterIndicatorLab}
        />
        <IconButton
          icon="help"
          label="Keyboard Shortcuts"
          onClick={() => setShortcutsModalOpen(true)}
        />
        <IconButton
          icon={chartFull ? 'compress' : 'expand'}
          label={chartFull ? 'Exit full screen (F)' : 'Full screen (F)'}
          onClick={toggleChartFull}
        />
        <ThemeToggle />
        <IconButton
          icon="settings"
          label="Settings"
          onClick={enterSettings}
        />
      </div>
    </header>
  )
}
