import { useState } from 'react'
import { fromReplayInput, toReplayInput } from '../lib/replayRange'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'

type RangeMode = 'full' | 'custom'

export function ReplayRangeModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const replayFromTs = useAppStore((s) => s.replayFromTs)
  const replayToTs = useAppStore((s) => s.replayToTs)
  const candles = useAppStore((s) => s.displayCandles)
  const setReplayRange = useAppStore((s) => s.setReplayRange)
  const startReplay = useAppStore((s) => s.startReplay)

  const [mode, setMode] = useState<RangeMode>('full')
  const [from, setFrom] = useState(() => toReplayInput(replayFromTs ?? candles[0]?.timestamp))
  const [to, setTo] = useState(() => toReplayInput(replayToTs ?? candles.at(-1)?.timestamp))

  function handleStart(): void {
    if (mode === 'full') {
      setReplayRange(null, null)
      startReplay()
    } else {
      const fromTs = fromReplayInput(from)
      const toTs = fromReplayInput(to)
      setReplayRange(fromTs, toTs)
      startReplay({ fromTs: fromTs ?? undefined, toTs: toTs ?? undefined })
    }
    onClose()
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="replay-range-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault()
          handleStart()
        }}
      >
        <header>
          <div>
            <span className="stamp">Replay</span>
            <h2 id="replay-range-title">Choose period</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close">
            <Icon name="close" />
          </button>
        </header>

        <label className="field">
          <span>
            <input
              type="radio"
              name="replay-range-mode"
              checked={mode === 'full'}
              onChange={() => setMode('full')}
            />{' '}
            Full history
          </span>
        </label>
        <label className="field">
          <span>
            <input
              type="radio"
              name="replay-range-mode"
              checked={mode === 'custom'}
              onChange={() => setMode('custom')}
            />{' '}
            Custom range
          </span>
        </label>

        {mode === 'custom' ? (
          <div className="row">
            <label className="field">
              From
              <input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="Replay from"
              />
            </label>
            <label className="field">
              To
              <input
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-label="Replay to"
              />
            </label>
          </div>
        ) : null}

        <div className="composer-actions">
          <button className="ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary icon-label" type="submit">
            <Icon name="play" />
            Start
          </button>
        </div>
      </form>
    </div>
  )
}
