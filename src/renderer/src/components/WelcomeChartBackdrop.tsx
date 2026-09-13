const CLOSES = [
  120, 128, 122, 135, 130, 142, 138, 150, 145, 160, 155, 168, 162, 175, 170, 185, 178, 190, 184, 198, 192, 205, 198,
  212, 205, 220, 212, 228, 220, 235, 228, 242, 235, 250, 242, 258
]

const CANDLE_WIDTH = 14
const CANDLE_GAP = 8
const WICK_PAD = 10
const CHART_HEIGHT = 300

interface Candle {
  x: number
  top: number
  bottom: number
  wickTop: number
  wickBottom: number
  bull: boolean
}

function buildCandles(): Candle[] {
  const candles: Candle[] = []
  let prevClose = CLOSES[0] - 6
  CLOSES.forEach((close, i) => {
    const open = prevClose
    const bull = close >= open
    const top = CHART_HEIGHT - Math.max(open, close)
    const bottom = CHART_HEIGHT - Math.min(open, close)
    candles.push({
      x: i * (CANDLE_WIDTH + CANDLE_GAP),
      top,
      bottom,
      wickTop: top - WICK_PAD,
      wickBottom: bottom + WICK_PAD,
      bull
    })
    prevClose = close
  })
  return candles
}

const CANDLES = buildCandles()
const CHART_WIDTH = CANDLES.length * (CANDLE_WIDTH + CANDLE_GAP)

export function WelcomeChartBackdrop(): React.JSX.Element {
  return (
    <svg
      className="welcome-chart-bg"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {CANDLES.map((c) => (
        <g key={c.x} className={c.bull ? 'welcome-candle-bull' : 'welcome-candle-bear'}>
          <line x1={c.x + CANDLE_WIDTH / 2} x2={c.x + CANDLE_WIDTH / 2} y1={c.wickTop} y2={c.wickBottom} />
          <rect x={c.x} y={c.top} width={CANDLE_WIDTH} height={Math.max(c.bottom - c.top, 2)} />
        </g>
      ))}
    </svg>
  )
}
