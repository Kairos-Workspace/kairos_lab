import { usePerformance } from '../store/selectors'

export function EquityCurve(): React.JSX.Element {
  const curve = usePerformance().equityCurve
  const width = 520
  const height = 150
  const pad = 18
  const values = curve.map((p) => p.equity)
  const max = values.length ? Math.max(0, ...values) : 0
  const min = 0
  const span = Math.max(1, max - min)
  const points = curve.map((p, i) => {
    const x = pad + (i / Math.max(1, curve.length - 1)) * (width - pad * 2)
    const y = height - pad - ((p.equity - min) / span) * (height - pad * 2)
    return `${x},${y}`
  })

  return (
    <section>
      <h3>Equity</h3>
      <svg className="equity" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Equity curve">
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="var(--rule)" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="var(--rule)" />
        {points.length > 1 ? (
          <polyline fill="none" stroke="var(--brand)" strokeWidth="2" points={points.join(' ')} />
        ) : null}
        <text x={pad} y={12} fill="var(--muted)" fontSize="10">
          ${max.toFixed(0)}
        </text>
        <text x={pad} y={height - 4} fill="var(--muted)" fontSize="10">
          ${min.toFixed(0)}
        </text>
      </svg>
    </section>
  )
}
