import { useState } from 'react'
import { formatRange, fromReplayInput, toReplayInput } from '../lib/replayRange'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'

export function ReplayRangeModal({
  onClose,
  onStarted
}: {
  onClose: () => void
  onStarted?: () => void
}): React.JSX.Element {
  const replayFromTs = useAppStore((s) => s.replayFromTs)
  const replayToTs = useAppStore((s) => s.replayToTs)
  const datasetId = useAppStore((s) => s.datasetId)
  const datasets = useAppStore((s) => s.datasets)
  const dataset = datasets.find((d) => d.id === datasetId)
  const setReplayRange = useAppStore((s) => s.setReplayRange)
  const startReplay = useAppStore((s) => s.startReplay)
  const loadReplayRange = useAppStore((s) => s.loadReplayRange)

  const [from, setFrom] = useState(() => toReplayInput(replayFromTs ?? dataset?.startTs))
  const [to, setTo] = useState(() => toReplayInput(replayToTs ?? dataset?.endTs))

  const minInput = dataset ? toReplayInput(dataset.startTs) : undefined
  const maxInput = dataset ? toReplayInput(dataset.endTs) : undefined

  function handleStart(): void {
    const fromTs = fromReplayInput(from)
    const toTs = fromReplayInput(to)
    if (fromTs == null || toTs == null) return
    onClose()
    void (async () => {
      await loadReplayRange(fromTs, toTs)
      setReplayRange(fromTs, toTs)
      startReplay({ fromTs, toTs })
      onStarted?.()
    })()
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

        {dataset ? (
          <p className="composer-hint">Data available: {formatRange(dataset.startTs, dataset.endTs)}</p>
        ) : null}

        <div className="row">
          <label className="field">
            From
            <input
              type="datetime-local"
              value={from}
              required
              min={minInput}
              max={maxInput}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Replay from"
            />
          </label>
          <label className="field">
            To
            <input
              type="datetime-local"
              value={to}
              required
              min={minInput}
              max={maxInput}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Replay to"
            />
          </label>
        </div>

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
