import { useMemo, useState } from 'react'
import { SERIES_META } from '@core/fundamentals/fetchMacro'
import type { FundamentalEventKind, FundamentalSeriesId } from '@core/fundamentals/types'
import { Icon } from './Icon'
import { ConfirmIconButton } from './ConfirmIconButton'
import { useAppStore } from '../store/useAppStore'

function fmtWhen(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

function fmtValue(value: number, unit: string): string {
  if (unit === 'k') return `${value.toFixed(0)}k`
  if (unit === '%') return `${value.toFixed(2)}%`
  return value.toFixed(1)
}

function dateInputToTs(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d, 12, 30, 0)
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

function yearsAgoUtc(years: number): string {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() - years)
  return d.toISOString().slice(0, 10)
}

type RangePreset =
  | { id: string; label: string; years: number }
  | { id: string; label: string; start: string }

const RANGE_PRESETS: RangePreset[] = [
  { id: '2y', label: '2Y', years: 2 },
  { id: '5y', label: '5Y', years: 5 },
  { id: '10y', label: '10Y', years: 10 },
  { id: 'max', label: 'Max', start: '2000-01-01' }
]

export function FundamentalsDesk(): React.JSX.Element {
  const bundle = useAppStore((s) => s.fundamentalsBundle)
  const source = useAppStore((s) => s.fundamentalsSource)
  const updatedAt = useAppStore((s) => s.fundamentalsUpdatedAt)
  const busy = useAppStore((s) => s.busy)
  const status = useAppStore((s) => s.status)
  const refreshFundamentals = useAppStore((s) => s.refreshFundamentals)
  const resetFundamentals = useAppStore((s) => s.resetFundamentals)
  const upsertFundamentalPoint = useAppStore((s) => s.upsertFundamentalPoint)
  const upsertFundamentalEvent = useAppStore((s) => s.upsertFundamentalEvent)

  const [fromDate, setFromDate] = useState(() => yearsAgoUtc(5))
  const [toDate, setToDate] = useState(() => todayUtc())
  const [selectedId, setSelectedId] = useState<FundamentalSeriesId>('fed_funds')
  const [pointDate, setPointDate] = useState(() => todayUtc())
  const [pointValue, setPointValue] = useState('')
  const [pointPeriod, setPointPeriod] = useState('')
  const [eventKind, setEventKind] = useState<FundamentalEventKind>('fomc')
  const [eventTitle, setEventTitle] = useState('')
  const [eventDate, setEventDate] = useState(() => todayUtc())
  const [eventActual, setEventActual] = useState('')

  const rows = useMemo(() => {
    return SERIES_META.map((meta) => {
      const series = bundle.series.find((s) => s.id === meta.id)
      const last = series?.points.at(-1) ?? null
      return { ...meta, series, last, count: series?.points.length ?? 0 }
    })
  }, [bundle])

  const selected = rows.find((r) => r.id === selectedId) ?? rows[0]
  const recent = (selected?.series?.points ?? []).slice(-12).reverse()
  const recentEvents = bundle.events.slice(-10).reverse()
  const rangeOk = Boolean(fromDate && toDate && fromDate <= toDate)

  function applyPreset(preset: RangePreset): void {
    setToDate(todayUtc())
    if ('start' in preset) setFromDate(preset.start)
    else setFromDate(yearsAgoUtc(preset.years))
  }

  async function pullRange(): Promise<void> {
    if (!rangeOk) return
    await refreshFundamentals({ startDate: fromDate, endDate: toDate })
  }

  async function savePoint(): Promise<void> {
    const value = Number(pointValue)
    if (!Number.isFinite(value) || !pointDate) return
    await upsertFundamentalPoint(selectedId, {
      ts: dateInputToTs(pointDate),
      value,
      period: pointPeriod.trim() || undefined
    })
    setPointValue('')
    setPointPeriod('')
  }

  async function saveEvent(): Promise<void> {
    if (!eventTitle.trim() || !eventDate) return
    const actual = eventActual.trim() === '' ? undefined : Number(eventActual)
    await upsertFundamentalEvent({
      ts: dateInputToTs(eventDate),
      kind: eventKind,
      title: eventTitle.trim(),
      impact: 'high',
      actual: actual != null && Number.isFinite(actual) ? actual : undefined
    })
    setEventTitle('')
    setEventActual('')
  }

  return (
    <section className="library-board market-desk fundamentals-desk">
      <section className="market-section">
        <header className="market-section-header">
          <div>
            <span className="stamp">{source === 'custom' ? 'Custom' : 'Bundled'}</span>
            <h2>Macro fundamentals</h2>
            <p className="muted">
              {busy
                ? status
                : updatedAt
                  ? `Updated ${fmtWhen(updatedAt)} · as-of the chart playhead in backtests`
                  : 'Pick a window, pull from FRED, or edit prints below'}
            </p>
          </div>
          <div className="market-section-header-actions">
            <ConfirmIconButton
              icon="trash"
              label="Reset to bundled macro"
              confirmLabel="Click again to restore shipped bundle"
              onConfirm={() => void resetFundamentals()}
            />
          </div>
        </header>

        <div className="fund-range-bar">
          <label className="field">
            From
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label className="field">
            To
            <input
              type="date"
              value={toDate}
              min={fromDate}
              max={todayUtc()}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>
          <div className="fund-range-presets">
            {RANGE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => applyPreset(preset)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="primary icon-label"
            disabled={busy || !rangeOk}
            onClick={() => void pullRange()}
          >
            <Icon name="download" />
            Get macro
          </button>
        </div>

        <div className="market-table-shell">
          <table className="history-table market-table">
            <thead>
              <tr>
                <th>Series</th>
                <th>Latest</th>
                <th>Period</th>
                <th>As of</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  data-active={row.id === selectedId}
                  className="fund-series-row"
                  onClick={() => setSelectedId(row.id)}
                >
                  <td className="market-table-pair">
                    <b>{row.label}</b>
                    <span className="market-table-sub">{row.hint}</span>
                  </td>
                  <td>
                    {row.last && row.series
                      ? fmtValue(row.last.value, row.series.unit)
                      : '—'}
                  </td>
                  <td>{row.last?.period ?? '—'}</td>
                  <td>{row.last ? fmtWhen(row.last.ts) : '—'}</td>
                  <td>{row.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="fund-desk-grid">
        <section className="market-section">
          <header className="market-section-header">
            <div>
              <h2>Edit {selected?.label ?? 'series'}</h2>
              <p className="muted">Add or overwrite a release/decision point.</p>
            </div>
          </header>
          <div className="fund-edit-form">
            <label className="field">
              Date (UTC)
              <input type="date" value={pointDate} onChange={(e) => setPointDate(e.target.value)} />
            </label>
            <label className="field">
              Value
              <input
                type="number"
                step="any"
                value={pointValue}
                onChange={(e) => setPointValue(e.target.value)}
                placeholder={selected?.series?.unit === 'k' ? '162' : '4.10'}
              />
            </label>
            <label className="field">
              Period label
              <input
                type="text"
                value={pointPeriod}
                onChange={(e) => setPointPeriod(e.target.value)}
                placeholder="Aug 2026"
              />
            </label>
            <button
              type="button"
              className="primary"
              disabled={busy || !pointValue}
              onClick={() => void savePoint()}
            >
              Save point
            </button>
          </div>
          <div className="market-table-shell">
            <table className="history-table market-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Value</th>
                  <th>Period</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((p) => (
                  <tr key={p.ts}>
                    <td>{fmtWhen(p.ts)}</td>
                    <td>
                      {selected?.series ? fmtValue(p.value, selected.series.unit) : p.value}
                    </td>
                    <td>{p.period ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="market-section">
          <header className="market-section-header">
            <div>
              <h2>Calendar event</h2>
              <p className="muted">FOMC / CPI / NFP titles for Last & Next in the backtest panel.</p>
            </div>
          </header>
          <div className="fund-edit-form">
            <label className="field">
              Kind
              <select
                value={eventKind}
                onChange={(e) => setEventKind(e.target.value as FundamentalEventKind)}
              >
                <option value="fomc">FOMC</option>
                <option value="cpi">CPI</option>
                <option value="nfp">NFP</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="field">
              Date (UTC)
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </label>
            <label className="field">
              Title
              <input
                type="text"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="FOMC hike 25bp"
              />
            </label>
            <label className="field">
              Actual (optional)
              <input
                type="number"
                step="any"
                value={eventActual}
                onChange={(e) => setEventActual(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="primary"
              disabled={busy || !eventTitle.trim()}
              onClick={() => void saveEvent()}
            >
              Save event
            </button>
          </div>
          <div className="market-table-shell">
            <table className="history-table market-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Kind</th>
                  <th>Title</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.map((ev) => (
                  <tr key={`${ev.kind}-${ev.ts}`}>
                    <td>{fmtWhen(ev.ts)}</td>
                    <td>{ev.kind.toUpperCase()}</td>
                    <td>{ev.title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  )
}
