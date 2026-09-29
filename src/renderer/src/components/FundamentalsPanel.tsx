import { getFundamentalsBundle } from '@core/fundamentals/bundle'
import { fundamentalsAsOf, lastEvent, resolveFundamentals } from '@core/fundamentals/asOf'
import type { FundamentalEvent, FundamentalPoint } from '@core/fundamentals/types'
import { useAppStore } from '../store/useAppStore'

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(digits)}%`
}

function fmtWhen(ts: number | null | undefined): string {
  if (ts == null) return '—'
  return new Date(ts).toISOString().slice(0, 10)
}

function fmtShort(ts: number | null | undefined): string {
  if (ts == null) return '—'
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

function fedDirection(actual?: number, prior?: number): string | null {
  if (actual == null || prior == null || !Number.isFinite(actual) || !Number.isFinite(prior)) {
    return null
  }
  if (actual > prior) return 'hike'
  if (actual < prior) return 'cut'
  return 'hold'
}

function Metric({
  label,
  value,
  meta
}: {
  label: string
  value: string
  meta?: string | null
}): React.JSX.Element {
  return (
    <div className="fund-metric">
      <span className="fund-metric-label">{label}</span>
      <span className="fund-metric-value">{value}</span>
      {meta ? <span className="fund-metric-meta">{meta}</span> : null}
    </div>
  )
}

function EventRow({
  label,
  event,
  hot
}: {
  label: string
  event: FundamentalEvent | null
  hot?: boolean
}): React.JSX.Element {
  return (
    <div className="fund-event" data-hot={hot ? 'true' : undefined}>
      <span className="fund-event-label">{label}</span>
      <div className="fund-event-body">
        <span className="fund-event-title">{event ? event.title : '—'}</span>
        {event ? <span className="fund-event-date">{fmtShort(event.ts)}</span> : null}
      </div>
    </div>
  )
}

function pointMeta(point: FundamentalPoint | null | undefined): string | null {
  return point ? fmtShort(point.ts) : null
}

export function FundamentalsPanel(): React.JSX.Element {
  const mode = useAppStore((s) => s.mode)
  const replayIndex = useAppStore((s) => s.replayIndex)
  const displayCandles = useAppStore((s) => s.displayCandles)

  const asOfTs = fundamentalsAsOf({ mode, replayIndex, displayCandles })
  const bundle = getFundamentalsBundle()
  const snap = asOfTs != null ? resolveFundamentals(bundle, asOfTs) : null
  const lastFomc = asOfTs != null ? lastEvent(bundle.events, asOfTs, ['fomc']) : null
  const fedDir = fedDirection(lastFomc?.actual, lastFomc?.prior)
  const fedMeta = lastFomc
    ? [fedDir, fmtShort(lastFomc.ts)].filter(Boolean).join(' · ')
    : pointMeta(snap?.fedFunds)

  return (
    <section className="fundamentals-panel">
      <header className="fund-header">
        <h3>Fundamentals</h3>
        {snap ? <span className="fund-asof">{fmtWhen(snap.asOfTs)}</span> : null}
      </header>
      {!snap ? (
        <p className="fundamentals-empty">Load a tape to see macro context.</p>
      ) : (
        <>
          <div className="fund-metrics">
            <Metric label="Fed funds" value={fmtPct(snap.fedFunds?.value)} meta={fedMeta} />
            <Metric
              label="Unemployment"
              value={fmtPct(snap.unemployment?.value)}
              meta={pointMeta(snap.unemployment)}
            />
            <Metric label="CPI YoY" value={fmtPct(snap.cpiYoy?.value)} meta={pointMeta(snap.cpiYoy)} />
            <Metric
              label="NFP"
              value={snap.nfp ? `${fmt(snap.nfp.value, 0)}k` : '—'}
              meta={pointMeta(snap.nfp)}
            />
            <Metric label="DXY" value={fmt(snap.dxy?.value, 1)} meta={pointMeta(snap.dxy)} />
          </div>
          <div className="fund-events">
            <EventRow label="Last" event={snap.lastEvent} hot={snap.justPrinted} />
            <EventRow label="Next" event={snap.nextEvent} />
          </div>
        </>
      )}
    </section>
  )
}
