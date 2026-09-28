import { useState } from 'react'
import { formatRange, fromReplayInput, toReplayInput } from '../lib/replayRange'
import { Button, FormField, Modal } from './ui'
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
    <Modal
      open={true}
      onClose={onClose}
      stamp="Replay"
      title="Choose period"
      subtitle={dataset ? `Data available: ${formatRange(dataset.startTs, dataset.endTs)}` : undefined}
      size="md"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon="play" type="submit" form="replay-range-form">
            Start
          </Button>
        </>
      }
    >
      <form
        id="replay-range-form"
        onSubmit={(event) => {
          event.preventDefault()
          handleStart()
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <FormField label="From">
            <input
              type="datetime-local"
              value={from}
              required
              min={minInput}
              max={maxInput}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Replay from"
            />
          </FormField>
          <FormField label="To">
            <input
              type="datetime-local"
              value={to}
              required
              min={minInput}
              max={maxInput}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Replay to"
            />
          </FormField>
        </div>
      </form>
    </Modal>
  )
}

