import { getFundamentalsBundle } from '@core/fundamentals/bundle'
import { fundamentalsAsOf, lastEvent, resolveFundamentals } from '@core/fundamentals/asOf'
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

function fedDirection(actual?: number, prior?: number): string | null {
  if (actual == null || prior == null || !Number.isFinite(actual) || !Number.isFinite(prior)) {
    return null
  }
  if (actual > prior) return 'hike'
  if (actual < prior) return 'cut'
  return 'hold'
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

  return (
    <section className="fundamentals-panel">
      <h3>Fundamentals</h3>
      {!snap ? (
        <p className="fundamentals-empty">Load a tape to see macro context.</p>
      ) : (
        <dl className="fundamentals-grid">
          <div>
            <dt>Fed funds</dt>
            <dd>
              {fmtPct(snap.fedFunds?.value)}
              {lastFomc ? ` · ${fmtWhen(lastFomc.ts)}${fedDir ? ` ${fedDir}` : ''}` : ''}
            </dd>
          </div>
          <div>
            <dt>Unemployment</dt>
            <dd>{fmtPct(snap.unemployment?.value)}</dd>
          </div>
          <div>
            <dt>CPI YoY</dt>
            <dd>{fmtPct(snap.cpiYoy?.value)}</dd>
          </div>
          <div>
            <dt>NFP</dt>
            <dd>{snap.nfp ? `${fmt(snap.nfp.value, 0)}k` : '—'}</dd>
          </div>
          <div>
            <dt>DXY</dt>
            <dd>{fmt(snap.dxy?.value, 1)}</dd>
          </div>
          <div className="fundamentals-cal" data-hot={snap.justPrinted ? 'true' : undefined}>
            <dt>Last event</dt>
            <dd>
              {snap.lastEvent
                ? `${snap.lastEvent.title} · ${fmtWhen(snap.lastEvent.ts)}`
                : '—'}
            </dd>
          </div>
          <div className="fundamentals-cal">
            <dt>Next event</dt>
            <dd>
              {snap.nextEvent
                ? `${snap.nextEvent.title} · ${fmtWhen(snap.nextEvent.ts)}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>As of</dt>
            <dd>{fmtWhen(snap.asOfTs)}</dd>
          </div>
        </dl>
      )}
    </section>
  )
}
