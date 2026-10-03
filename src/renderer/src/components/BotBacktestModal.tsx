import { useMemo, useState } from 'react'
import { exactTimeframesForSymbol, localSymbols, pickLocalDataset } from '@core/candles/dataset'
import { DEFAULT_BALANCE } from '@shared/constants'
import { SYMBOLS, TIMEFRAMES, type Timeframe } from '@shared/types'
import { formatRange, fromReplayInput, toReplayInput } from '../lib/replayRange'
import { Dropdown } from './Dropdown'
import { Button, FormField, Modal } from './ui'
import { useAppStore } from '../store/useAppStore'

export type BotBacktestConfig = {
  symbol: string
  timeframe: Timeframe
  fromTs: number
  toTs: number
  initialBalance: number
  leverage: number
  visualize: boolean
}

export function BotBacktestModal({
  scriptName,
  busy,
  onClose,
  onConfirm
}: {
  scriptName: string
  busy?: boolean
  onClose: () => void
  onConfirm: (config: BotBacktestConfig) => void | Promise<void>
}): React.JSX.Element {
  const datasets = useAppStore((s) => s.datasets)
  const deskSymbol = useAppStore((s) => s.symbol)
  const deskTf = useAppStore((s) => s.displayTimeframe)
  const account = useAppStore((s) => s.account)

  const pairs = useMemo(() => {
    const stored = localSymbols(datasets)
    return stored.length > 0 ? stored : [...SYMBOLS]
  }, [datasets])

  const [symbol, setSymbol] = useState(() =>
    pairs.includes(deskSymbol) ? deskSymbol : (pairs[0] ?? 'XAUUSD')
  )
  const downloadedTfs = exactTimeframesForSymbol(datasets, symbol)
  const timeframeOptions = TIMEFRAMES.filter((tf) => downloadedTfs.includes(tf) || tf === deskTf)
  const [timeframe, setTimeframe] = useState<Timeframe>(() => {
    if (downloadedTfs.includes(deskTf)) return deskTf
    return (downloadedTfs[0] as Timeframe | undefined) ?? deskTf
  })

  const dataset = pickLocalDataset(datasets, symbol, timeframe)
  const [from, setFrom] = useState(() => toReplayInput(dataset?.startTs))
  const [to, setTo] = useState(() => toReplayInput(dataset?.endTs))
  const [balance, setBalance] = useState(String(account.initialBalance || DEFAULT_BALANCE))
  const [leverage, setLeverage] = useState(String(Math.max(1, account.leverage || 1)))
  const [visualize, setVisualize] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const minInput = dataset ? toReplayInput(dataset.startTs) : undefined
  const maxInput = dataset ? toReplayInput(dataset.endTs) : undefined

  function onSymbolChange(next: string): void {
    setSymbol(next)
    const tfs = exactTimeframesForSymbol(datasets, next)
    const nextTf = tfs.includes(timeframe) ? timeframe : ((tfs[0] as Timeframe | undefined) ?? timeframe)
    setTimeframe(nextTf)
    const ds = pickLocalDataset(datasets, next, nextTf)
    setFrom(toReplayInput(ds?.startTs))
    setTo(toReplayInput(ds?.endTs))
    setError(null)
  }

  function onTimeframeChange(next: Timeframe): void {
    setTimeframe(next)
    const ds = pickLocalDataset(datasets, symbol, next)
    setFrom(toReplayInput(ds?.startTs))
    setTo(toReplayInput(ds?.endTs))
    setError(null)
  }

  async function handleSubmit(): Promise<void> {
    const fromTs = fromReplayInput(from)
    const toTs = fromReplayInput(to)
    const initialBalance = Number(balance)
    const lev = Number(leverage)
    if (fromTs == null || toTs == null) {
      setError('Choose a valid from / to period.')
      return
    }
    if (fromTs >= toTs) {
      setError('From must be before To.')
      return
    }
    if (!Number.isFinite(initialBalance) || initialBalance <= 0) {
      setError('Initial balance must be a positive number.')
      return
    }
    if (!Number.isFinite(lev) || lev < 1) {
      setError('Leverage must be 1 or higher.')
      return
    }
    if (!pickLocalDataset(datasets, symbol, timeframe)) {
      setError(`No local tape for ${symbol} ${timeframe}. Download a pair first.`)
      return
    }
    setError(null)
    await onConfirm({
      symbol,
      timeframe,
      fromTs,
      toTs,
      initialBalance,
      leverage: lev,
      visualize
    })
  }

  return (
    <Modal
      open={true}
      onClose={busy ? () => undefined : onClose}
      stamp="Backtest"
      title="Run bot backtest"
      subtitle={`${scriptName} · pick pair, period, and account`}
      size="md"
      closeOnBackdropClick={!busy}
      closeOnEscape={!busy}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="play"
            type="submit"
            form="bot-backtest-form"
            disabled={busy}
          >
            {busy ? 'Running…' : visualize ? 'Open tester' : 'Run in background'}
          </Button>
        </>
      }
    >
      <form
        id="bot-backtest-form"
        onSubmit={(event) => {
          event.preventDefault()
          void handleSubmit()
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <FormField label="Pair" required>
            <Dropdown
              ariaLabel="Pair"
              value={symbol}
              onChange={onSymbolChange}
              options={pairs.map((pair) => ({ value: pair, label: pair }))}
            />
          </FormField>
          <FormField label="Timeframe" required>
            <Dropdown
              ariaLabel="Timeframe"
              value={timeframe}
              onChange={onTimeframeChange}
              options={(timeframeOptions.length > 0 ? timeframeOptions : TIMEFRAMES).map((tf) => ({
                value: tf,
                label: tf
              }))}
            />
          </FormField>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <FormField label="From" required>
            <input
              type="datetime-local"
              value={from}
              required
              min={minInput}
              max={maxInput}
              disabled={busy}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Backtest from"
            />
          </FormField>
          <FormField label="To" required>
            <input
              type="datetime-local"
              value={to}
              required
              min={minInput}
              max={maxInput}
              disabled={busy}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Backtest to"
            />
          </FormField>
        </div>
        {dataset ? (
          <p className="ui-field-hint" style={{ margin: 0 }}>
            Tape available: {formatRange(dataset.startTs, dataset.endTs)}
          </p>
        ) : (
          <p className="ui-field-error" style={{ margin: 0 }} role="alert">
            No local tape for this pair / timeframe.
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <FormField label="Initial balance" required hint="Account starting equity">
            <input
              type="number"
              min={1}
              step={100}
              value={balance}
              disabled={busy}
              onChange={(e) => setBalance(e.target.value)}
              aria-label="Initial balance"
            />
          </FormField>
          <FormField label="Leverage" required hint="1 = no leverage">
            <input
              type="number"
              min={1}
              step={1}
              value={leverage}
              disabled={busy}
              onChange={(e) => setLeverage(e.target.value)}
              aria-label="Leverage"
            />
          </FormField>
        </div>

        <FormField label="Mode" required>
          <div className="bot-backtest-mode" role="radiogroup" aria-label="Backtest mode">
            <label data-active={visualize ? 'true' : 'false'}>
              <input
                type="radio"
                name="bot-bt-mode"
                checked={visualize}
                disabled={busy}
                onChange={() => setVisualize(true)}
              />
              <span>
                <strong>Visualize</strong>
                <em>Open chart tester and replay</em>
              </span>
            </label>
            <label data-active={!visualize ? 'true' : 'false'}>
              <input
                type="radio"
                name="bot-bt-mode"
                checked={!visualize}
                disabled={busy}
                onChange={() => setVisualize(false)}
              />
              <span>
                <strong>Background</strong>
                <em>Run headless and show results</em>
              </span>
            </label>
          </div>
        </FormField>

        {error ? (
          <p className="ui-field-error" style={{ margin: 0 }} role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
