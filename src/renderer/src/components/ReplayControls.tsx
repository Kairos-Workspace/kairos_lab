import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { useAppStore } from '../store/useAppStore'

function toInput(ts: number | null | undefined): string {
  if (ts == null) return ''
  const date = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromInput(value: string): number | null {
  if (!value) return null
  const ts = Date.parse(value)
  return Number.isNaN(ts) ? null : ts
}

export function ReplayControls(): React.JSX.Element {
  const togglePlay = useAppStore((s) => s.togglePlay)
  const step = useAppStore((s) => s.step)
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

  useEffect(() => {
    setFrom(toInput(replayFromTs ?? candles[0]?.timestamp))
    setTo(toInput(replayToTs ?? candles.at(-1)?.timestamp))
  }, [replayFromTs, replayToTs, candles])

  function applyRange(): void {
    const fromTs = fromInput(from)
    const toTs = fromInput(to)
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
          onClick={togglePlay}
          title="Play / Pause"
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
        {mode === 'replay' ? (
          <button
            className="icon-btn"
            onClick={() => useAppStore.getState().stopReplay()}
            title="Show full tape"
            aria-label="Show full tape"
          >
            <Icon name="eye" />
          </button>
        ) : (
          <button
            className="icon-btn"
            onClick={() => startReplay()}
            title="Hide future"
            aria-label="Hide future"
          >
            <Icon name="eyeOff" />
          </button>
        )}
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
    </div>
  )
}
