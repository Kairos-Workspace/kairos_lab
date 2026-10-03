import { useMemo, useState } from 'react'
import { formatReplayClock } from '@core/candles/session'
import { formatRange } from '../lib/replayRange'
import { Icon } from './Icon'
import { ReplayRangeModal } from './ReplayRangeModal'
import { useAppStore } from '../store/useAppStore'

export function ReplayControls(): React.JSX.Element {
  const togglePlay = useAppStore((s) => s.togglePlay)
  const play = useAppStore((s) => s.play)
  const step = useAppStore((s) => s.manualStep)
  const resetReplay = useAppStore((s) => s.resetReplay)
  const startReplay = useAppStore((s) => s.startReplay)
  const jumpToDate = useAppStore((s) => s.jumpToDate)
  const isPlaying = useAppStore((s) => s.isPlaying)
  const mode = useAppStore((s) => s.mode)
  const replayFromTs = useAppStore((s) => s.replayFromTs)
  const replayToTs = useAppStore((s) => s.replayToTs)
  const replayIndex = useAppStore((s) => s.replayIndex)
  const candles = useAppStore((s) => s.displayCandles)
  const setFollowReplay = useAppStore((s) => s.setFollowReplay)
  const [showRangeModal, setShowRangeModal] = useState(false)

  const current = candles[Math.max(0, Math.min(replayIndex, candles.length - 1))]
  const clock = current ? formatReplayClock(current.timestamp) : null
  const progress = candles.length > 1 ? replayIndex / (candles.length - 1) : 0

  const rangeLabel = useMemo(() => {
    const from = replayFromTs ?? candles[0]?.timestamp
    const to = replayToTs ?? candles.at(-1)?.timestamp
    if (from == null || to == null) return 'Set period'
    return formatRange(from, to)
  }, [replayFromTs, replayToTs, candles])

  function seekRatio(ratio: number): void {
    if (!candles.length) return
    const index = Math.round(Math.max(0, Math.min(1, ratio)) * (candles.length - 1))
    const ts = candles[index]?.timestamp
    if (ts == null) return
    setFollowReplay(true)
    jumpToDate(ts)
  }

  return (
    <div className="replay-bar" data-mode={mode}>
      <div className="replay-transport">
        <div className="replay-buttons">
          <button
            className="icon-btn"
            onClick={() => step(-1)}
            title="Previous candle"
            aria-label="Previous candle"
          >
            <Icon name="stepBack" />
          </button>
          <button
            className="icon-btn replay-play"
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
          <button
            className="icon-btn"
            onClick={() => step(1)}
            title="Next candle"
            aria-label="Next candle"
          >
            <Icon name="stepForward" />
          </button>
          <button className="icon-btn" onClick={() => step(5)} title="Step 5" aria-label="Step 5">
            +5
          </button>
          <button className="icon-btn" onClick={() => step(10)} title="Step 10" aria-label="Step 10">
            +10
          </button>
          <button
            className="icon-btn"
            onClick={resetReplay}
            title="Reset replay"
            aria-label="Reset replay"
          >
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

        <div className="replay-scrub">
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round(progress * 1000)}
            disabled={!candles.length}
            aria-label="Replay position"
            onChange={(e) => seekRatio(Number(e.target.value) / 1000)}
          />
          <div className="replay-scrub-meta">
            <span className="replay-clock">
              {clock ? (
                <>
                  <b>{clock.date}</b> {clock.time}
                </>
              ) : (
                'No tape'
              )}
            </span>
            <span className="muted">
              {candles.length ? `${replayIndex + 1} / ${candles.length}` : '—'}
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="ghost replay-period"
        onClick={() => setShowRangeModal(true)}
        title="Choose replay period"
      >
        <span className="muted">Period</span>
        <span>{rangeLabel}</span>
      </button>

      {showRangeModal ? (
        <ReplayRangeModal onClose={() => setShowRangeModal(false)} onStarted={play} />
      ) : null}
    </div>
  )
}
