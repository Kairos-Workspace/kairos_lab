import { useState } from 'react'
import { TIMEFRAMES, type Timeframe } from '@shared/types'
import { Icon } from './Icon'
import { Modal, Button, Checkbox, FormField } from './ui'
import { useAppStore } from '../store/useAppStore'

type Step = 'timeframes' | 'range' | 'downloading' | 'done'
const STEPS: Step[] = ['timeframes', 'range', 'downloading', 'done']

export function DownloadWizard({
  symbol,
  onClose
}: {
  symbol: string
  onClose: () => void
}): React.JSX.Element {
  const downloadPair = useAppStore((s) => s.downloadPair)
  const downloadProgress = useAppStore((s) => s.downloadProgress)

  const [step, setStep] = useState<Step>('timeframes')
  const [timeframes, setTimeframes] = useState<Timeframe[]>(['1H'])
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 2)
    return d.toISOString().slice(0, 10)
  })
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [currentIndex, setCurrentIndex] = useState(0)
  const [failedTimeframe, setFailedTimeframe] = useState<Timeframe | null>(null)

  const stepIndex = STEPS.indexOf(step)

  function toggleTimeframe(tf: Timeframe, checked: boolean): void {
    setTimeframes(checked ? [...timeframes, tf] : timeframes.filter((t) => t !== tf))
  }

  async function runDownload(): Promise<void> {
    setFailedTimeframe(null)
    setStep('downloading')
    const startTs = new Date(fromDate).getTime()
    const endTs = new Date(toDate).getTime()
    for (let i = 0; i < timeframes.length; i++) {
      setCurrentIndex(i)
      try {
        await downloadPair({ symbol, timeframe: timeframes[i], startTs, endTs })
      } catch {
        setFailedTimeframe(timeframes[i])
        return
      }
    }
    setStep('done')
  }

  const progressPct = Math.round((downloadProgress?.fraction ?? 0) * 100)

  const canDismiss = step !== 'downloading' || Boolean(failedTimeframe)

  return (
    <Modal
      open={true}
      onClose={onClose}
      size="md"
      stamp={`Download data · Step ${stepIndex + 1} of ${STEPS.length}`}
      title={symbol}
      closeOnBackdropClick={canDismiss}
      closeOnEscape={canDismiss}
      showCloseButton={canDismiss}
      footer={
        failedTimeframe ? (
          <>
            <Button variant="ghost" type="button" onClick={() => setStep('range')}>
              Back
            </Button>
            <Button
              variant="primary"
              icon="download"
              type="button"
              onClick={() => void runDownload()}
            >
              Retry
            </Button>
          </>
        ) : step === 'timeframes' ? (
          <>
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="button"
              disabled={timeframes.length === 0}
              onClick={() => setStep('range')}
            >
              Next
            </Button>
          </>
        ) : step === 'range' ? (
          <>
            <Button variant="ghost" type="button" onClick={() => setStep('timeframes')}>
              Back
            </Button>
            <Button
              variant="primary"
              icon="download"
              type="submit"
              form="download-wizard-form"
            >
              Download
            </Button>
          </>
        ) : step === 'done' ? (
          <Button variant="primary" type="button" onClick={onClose}>
            Done
          </Button>
        ) : null
      }
    >
      <div className="wizard-steps" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span key={s} className="wizard-dot" data-active={i === stepIndex} data-done={i < stepIndex} />
        ))}
      </div>

      <form
        id="download-wizard-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (step === 'range') void runDownload()
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
      >
        {step === 'timeframes' ? (
          <FormField label="Timeframes">
            <div className="wizard-timeframes">
              {TIMEFRAMES.map((tf) => (
                <Checkbox
                  key={tf}
                  label={tf}
                  checked={timeframes.includes(tf)}
                  onChange={(e) => toggleTimeframe(tf, e.target.checked)}
                />
              ))}
            </div>
          </FormField>
        ) : null}

        {step === 'range' ? (
          <div className="row">
            <FormField label="From Date">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                max={toDate}
              />
            </FormField>
            <FormField label="To Date">
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                min={fromDate}
                max={new Date().toISOString().slice(0, 10)}
              />
            </FormField>
          </div>
        ) : null}

        {step === 'downloading' && !failedTimeframe ? (
          <div className="wizard-progress">
            <p className="wizard-progress-label">
              Downloading {symbol} {timeframes[currentIndex]}
              {timeframes.length > 1 ? ` · ${currentIndex + 1} of ${timeframes.length}` : ''}…
            </p>
            <div className="progress-bar" data-indeterminate={downloadProgress?.indeterminate ?? false}>
              <div
                className="progress-bar-fill"
                style={downloadProgress?.indeterminate ? undefined : { width: `${progressPct}%` }}
              />
            </div>
            {downloadProgress?.indeterminate ? (
              <span className="muted wizard-progress-pct">Fetching…</span>
            ) : (
              <span className="muted wizard-progress-pct">{progressPct}%</span>
            )}
          </div>
        ) : null}

        {step === 'done' ? (
          <div className="wizard-done">
            <div className="wizard-done-icon">
              <Icon name="check" size={22} />
            </div>
            <p>{symbol} data is ready.</p>
          </div>
        ) : null}

        {failedTimeframe ? (
          <p className="wizard-error">
            Could not download {symbol} {failedTimeframe}. Check your connection and try again.
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
