import { useMemo, useState } from 'react'
import { SPEED_OPTIONS } from '@shared/types'
import { formatReplayClock } from '@core/candles/session'
import { formatRange } from '../lib/replayRange'
import { Dropdown } from './Dropdown'
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
  const speed = useAppStore((s) => s.speed)
  const setSpeed = useAppStore((s) => s.setSpeed)
  const isPlaying = useAppStore((s) => s.isPlaying)
  const mode = useAppStore((s) => s.mode)
  const replayFromTs = useAppStore((s) => s.replayFromTs)
  const replayToTs = useAppStore((s) => s.replayToTs)
  const replayIndex = useAppStore((s) => s.replayIndex)
  const candles = useAppStore((s) => s.displayCandles)
  const setFollowReplay = useAppStore((s) => s.setFollowReplay)
  const datasetId = useAppStore((s) => s.datasetId)
  const datasets = useAppStore((s) => s.datasets)
  const dataset = datasets.find((d) => d.id === datasetId)
  const sourceHasOlder = useAppStore((s) => s.sourceHasOlder)
  const historyStreaming = useAppStore((s) => s.historyStreaming)
  const displayEntireHistory = useAppStore((s) => s.displayEntireHistory)
  const stopHistoryStream = useAppStore((s) => s.stopHistoryStream)
  const exitReplayToEntireHistory = useAppStore((s) => s.exitReplayToEntireHistory)
  const setHistoryScrollTargetIndex = useAppStore((s) => s.setHistoryScrollTargetIndex)
  const jumpToHistoryEdge = useAppStore((s) => s.jumpToHistoryEdge)

  const [showRangeModal, setShowRangeModal] = useState(false)
  const [viewScrubIndex, setViewScrubIndex] = useState<number | null>(null)

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

  const effectiveViewIdx = viewScrubIndex ?? (candles.length > 0 ? candles.length - 1 : 0)
  const viewScrubProgress = candles.length > 1 ? effectiveViewIdx / (candles.length - 1) : 1
  const viewScrubCandle = candles[effectiveViewIdx]
  const viewClock = viewScrubCandle ? formatReplayClock(viewScrubCandle.timestamp) : null

  if (mode === 'view') {
    return (
      <div className="replay-bar" data-mode="view">
        <div className="history-mode-pill" title="Entire history displayed without replay">
          <Icon name="history" />
          <span>Entire History</span>
        </div>

        <div className="replay-transport">
          <div className="replay-buttons">
            <button
              className="icon-btn"
              onClick={() => {
                setViewScrubIndex(0)
                void jumpToHistoryEdge('oldest')
              }}
              title="Jump to oldest loaded candle"
              aria-label="Oldest candle"
            >
              <Icon name="stepBack" />
            </button>
            {historyStreaming ? (
              <button
                className="icon-btn replay-play"
                data-active="true"
                onClick={stopHistoryStream}
                title="Pause progressive step rendering"
                aria-label="Pause progressive step rendering"
              >
                <Icon name="pause" />
              </button>
            ) : sourceHasOlder ? (
              <button
                className="icon-btn replay-step-trigger"
                onClick={() => void displayEntireHistory({ progressive: true })}
                title="Render entire history step by step"
                aria-label="Render step by step"
              >
                <Icon name="play" />
              </button>
            ) : (
              <button
                className="icon-btn"
                disabled
                title="All historical candles loaded"
                aria-label="All historical candles loaded"
              >
                <Icon name="check" />
              </button>
            )}
            <button
              className="icon-btn"
              onClick={() => {
                setViewScrubIndex(candles.length - 1)
                void jumpToHistoryEdge('latest')
              }}
              title="Jump to latest candle"
              aria-label="Latest candle"
            >
              <Icon name="stepForward" />
            </button>
          </div>

          <div className="replay-scrub">
            <input
              type="range"
              min={0}
              max={1000}
              step={1}
              value={Math.round(viewScrubProgress * 1000)}
              disabled={!candles.length}
              aria-label="History scroll position"
              onChange={(e) => {
                const ratio = Number(e.target.value) / 1000
                const targetIdx = Math.round(Math.max(0, Math.min(1, ratio)) * (candles.length - 1))
                setViewScrubIndex(targetIdx)
                setHistoryScrollTargetIndex(targetIdx)
              }}
            />
            <div className="replay-scrub-meta">
              <span className="replay-clock">
                {viewClock ? (
                  <>
                    <b>{viewClock.date}</b> {viewClock.time}
                  </>
                ) : (
                  'No tape'
                )}
              </span>
              <span className="muted">
                {candles.length.toLocaleString()}{' '}
                {dataset ? `/ ${dataset.candleCount.toLocaleString()}` : ''} candles
                {sourceHasOlder ? ' (scroll back for older)' : ' (all loaded)'}
              </span>
            </div>
          </div>
        </div>

        <div className="replay-actions">
          {sourceHasOlder && !historyStreaming ? (
            <button
              type="button"
              className="ghost replay-step-btn"
              onClick={() => void displayEntireHistory({ progressive: true })}
              title="Render all history step by step backwards"
            >
              <Icon name="history" />
              <span>Step Render</span>
            </button>
          ) : null}
          <button
            type="button"
            className="ghost replay-period"
            onClick={() => setShowRangeModal(true)}
            title="Choose replay period"
          >
            <span className="muted">Period</span>
            <span>{rangeLabel}</span>
          </button>
          <button
            type="button"
            className="ghost replay-start-action"
            onClick={() => setShowRangeModal(true)}
            title="Start Replay Simulation"
          >
            <Icon name="play" />
            <span>Replay</span>
          </button>
        </div>

        {showRangeModal ? (
          <ReplayRangeModal onClose={() => setShowRangeModal(false)} onStarted={play} />
        ) : null}
      </div>
    )
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
          <Dropdown
            ariaLabel="Replay speed"
            className="replay-speed-dropdown"
            placement="top"
            value={speed}
            onChange={setSpeed}
            options={SPEED_OPTIONS.map((s) => ({ value: s, label: `${s}x` }))}
          />
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

      <div className="replay-actions">
        <button
          type="button"
          className="ghost replay-history-btn"
          onClick={exitReplayToEntireHistory}
          title="Display entire history without replay"
        >
          <Icon name="history" />
          <span>Entire History</span>
        </button>

        <button
          type="button"
          className="ghost replay-period"
          onClick={() => setShowRangeModal(true)}
          title="Choose replay period"
        >
          <span className="muted">Period</span>
          <span>{rangeLabel}</span>
        </button>
      </div>

      {showRangeModal ? (
        <ReplayRangeModal onClose={() => setShowRangeModal(false)} onStarted={play} />
      ) : null}
    </div>
  )
}
