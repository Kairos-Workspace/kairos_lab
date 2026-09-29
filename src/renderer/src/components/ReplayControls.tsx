import { useEffect, useState } from 'react'
import { fromReplayInput, toReplayInput } from '../lib/replayRange'
import { Icon } from './Icon'
import { ReplayRangeModal } from './ReplayRangeModal'
import { useAppStore } from '../store/useAppStore'

export function ReplayControls(): React.JSX.Element {
  const togglePlay = useAppStore((s) => s.togglePlay)
  const play = useAppStore((s) => s.play)
  const step = useAppStore((s) => s.manualStep)
  const resetReplay = useAppStore((s) => s.resetReplay)
  const startReplay = useAppStore((s) => s.startReplay)
  const setReplayRange = useAppStore((s) => s.setReplayRange)
  const isPlaying = useAppStore((s) => s.isPlaying)
  const mode = useAppStore((s) => s.mode)
  const replayFromTs = useAppStore((s) => s.replayFromTs)
  const replayToTs = useAppStore((s) => s.replayToTs)
  const candles = useAppStore((s) => s.displayCandles)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [showRangeModal, setShowRangeModal] = useState(false)

  useEffect(() => {
    setFrom(toReplayInput(replayFromTs ?? candles[0]?.timestamp))
    setTo(toReplayInput(replayToTs ?? candles.at(-1)?.timestamp))
  }, [replayFromTs, replayToTs, candles])

  function applyRange(): void {
    const fromTs = fromReplayInput(from)
    const toTs = fromReplayInput(to)
    setReplayRange(fromTs, toTs)
    startReplay({ fromTs: fromTs ?? undefined, toTs: toTs ?? undefined })
  }

  return (
    <div className="replay-bar">
      <div className="replay-buttons">
        <button className="icon-btn" onClick={() => step(-1)} title="Previous candle" aria-label="Previous candle">
          <Icon name="stepBack" />
        </button>
        <button
          className="icon-btn"
          data-active={isPlaying}
          onClick={() => {
            if (!isPlaying && mode !== 'replay') setShowRangeModal(true)
            else togglePlay()
          }}
          title="Play / Pause (Space)"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} />
        </button>
        <button className="icon-btn" onClick={() => step(1)} title="Next candle" aria-label="Next candle">
          <Icon name="stepForward" />
        </button>
        <button className="icon-btn" onClick={() => step(5)} title="Step 5" aria-label="Step 5">
          +5
        </button>
        <button className="icon-btn" onClick={() => step(10)} title="Step 10" aria-label="Step 10">
          +10
        </button>
        <button className="icon-btn" onClick={resetReplay} title="Reset replay" aria-label="Reset replay">
          <Icon name="reset" />
        </button>
        <button
          className="icon-btn"
          onClick={() => startReplay({ random: true, hideDate: true })}
          title="Random replay"
          aria-label="Random replay"
        >
          <Icon name="shuffle" />
        </button>
      </div>
      <form
        className="replay-range"
        onSubmit={(e) => {
          e.preventDefault()
          applyRange()
        }}
      >
        <label>
          From
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="Replay from"
          />
        </label>
        <label>
          To
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="Replay to"
          />
        </label>
        <button className="ghost" type="submit">
          Apply
        </button>
      </form>

      {showRangeModal ? (
        <ReplayRangeModal onClose={() => setShowRangeModal(false)} onStarted={play} />
      ) : null}
    </div>
  )
}
