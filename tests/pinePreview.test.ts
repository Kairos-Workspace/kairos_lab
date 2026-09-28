import { describe, expect, it } from 'vitest'
import { diagnosePineScript, previewPineScript } from '@core/indicators/pinePreview'
import type { Candle } from '@shared/types'

function candles(count: number, at?: (i: number) => Partial<Candle>): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: i * 60_000,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 10,
    ...at?.(i)
  }))
}

const ICT = `//@version=5
indicator("ICT Structure & FVG Signals", overlay=true)

leftBars = input.int(5, "Pivot Left Bars")
rightBars = input.int(5, "Pivot Right Bars")
showFVG = input.bool(true, "Show Fair Value Gaps")
signalLookback = input.int(30, "Signal Lookback (Bars)")
fillOpacity = input.int(80, "FVG Fill Opacity", minval=0, maxval=100)
useTrendFilter = input.bool(true, "Require Trend Confirmation")

ph = ta.pivothigh(high, leftBars, rightBars)
pl = ta.pivotlow(low, leftBars, rightBars)

var float lastSwingHigh = na
var float lastSwingLow = na
var string trend = "Neutral"

if not na(ph)
    lastSwingHigh := ph
if not na(pl)
    lastSwingLow := pl

if not na(lastSwingHigh) and not na(lastSwingLow)
    if close > lastSwingHigh and trend != "Bullish"
        trend := "Bullish"
    else if close < lastSwingLow and trend != "Bearish"
        trend := "Bearish"

bullFVG = low[2] > high[0]
bearFVG = high[2] < low[0]

var float bullTop = na
var float bullBot = na
var float bearTop = na
var float bearBot = na
var int bullFVGAge = na
var int bearFVGAge = na

if bullFVG
    bullTop := high[0]
    bullBot := low[2]
    bullFVGAge := 0
else if not na(bullFVGAge)
    bullFVGAge += 1

if bearFVG
    bearTop := low[0]
    bearBot := high[2]
    bearFVGAge := 0
else if not na(bearFVGAge)
    bearFVGAge += 1

if not na(bullTop) and close > bullTop
    bullTop := na
    bullBot := na
    bullFVGAge := na
if not na(bearTop) and close < bearBot
    bearTop := na
    bearBot := na
    bearFVGAge := na

inBullFVG = not na(bullTop) and close <= bullTop and close >= bullBot
inBearFVG = not na(bearTop) and close >= bearBot and close <= bearTop

trendBull = useTrendFilter ? trend == "Bullish" : true
trendBear = useTrendFilter ? trend == "Bearish" : true

buySignal = trendBull and inBullFVG and not na(bullFVGAge) and bullFVGAge <= signalLookback
sellSignal = trendBear and inBearFVG and not na(bearFVGAge) and bearFVGAge <= signalLookback

plotshape(buySignal, title="ICT Buy", location=location.belowbar, color=color.green, style=shape.triangleup, size=size.normal, text="BUY")
plotshape(sellSignal, title="ICT Sell", location=location.abovebar, color=color.red, style=shape.triangledown, size=size.normal, text="SELL")

bullTopPlot = plot(showFVG ? bullTop : na, display=display.none)
bullBotPlot = plot(showFVG ? bullBot : na, display=display.none)
bearTopPlot = plot(showFVG ? bearTop : na, display=display.none)
bearBotPlot = plot(showFVG ? bearBot : na, display=display.none)

fill(bullTopPlot, bullBotPlot, color=color.new(color.green, fillOpacity), title="Bullish FVG")
fill(bearTopPlot, bearBotPlot, color=color.new(color.red, fillOpacity), title="Bearish FVG")
`

describe('previewPineScript', () => {
  it('plots close from a simple overlay', () => {
    const source = `//@version=5
indicator("Untitled Indicator", overlay=true)

plot(close)
`
    const result = previewPineScript(source, candles(5), 'Fallback')
    expect(result.title).toBe('Untitled Indicator')
    expect(result.unsupported).toBe(false)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].hidden).toBeFalsy()
    expect(result.lines[0].points.map((p) => p.value)).toEqual([100, 101, 102, 103, 104])
  })

  it('plots a simple moving average on close', () => {
    const source = `indicator("SMA", overlay=true)\nplot(ta.sma(close, 3))`
    const result = previewPineScript(source, candles(4), 'SMA')
    expect(result.unsupported).toBe(false)
    expect(result.lines[0].points.map((p) => p.value)).toEqual([101, 102])
  })

  it('does not fake a close line for unknown plots', () => {
    const source = `indicator("X")\nplot(myCustomBuffer)`
    const result = previewPineScript(source, candles(3), 'X')
    expect(result.unsupported).toBe(true)
    expect(result.lines.filter((line) => !line.hidden)).toHaveLength(0)
    expect(result.diagnostics.some((row) => row.message.includes('myCustomBuffer'))).toBe(true)
  })

  it('reports syntax errors with a line number', () => {
    const diags = diagnosePineScript('indicator("X")\nif close\nplot(close)\n')
    expect(diags.length).toBeGreaterThan(0)
    expect(diags[0].severity).toBe('error')
    expect(diags[0].line).toBeGreaterThanOrEqual(2)
  })

  it('reports no issues for a valid ICT script', () => {
    expect(diagnosePineScript(ICT)).toEqual([])
  })

  it('matches TradingView when range is used as a variable', () => {
    const source = `indicator("X", overlay=true)
range = high - low
plot(range)
`
    const result = previewPineScript(source, candles(8), 'X')
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        line: 2,
        message: "'range' cannot be used as a variable or function name."
      })
    ])
  })

  it('accepts math.abs and shape.labeldown like TradingView', () => {
    const source = `indicator("X", overlay=true)
body = math.abs(close - open)
plotshape(body > 0, style=shape.labeldown, location=location.abovebar, color=color.red)
plot(body)
`
    expect(diagnosePineScript(source)).toEqual([])
  })

  it('confirms a pivot high the way TradingView ta.pivothigh does', () => {
    const source = `indicator("P")\nplot(ta.pivothigh(high, 1, 1))`
    const tape = candles(5, (i) => {
      const high = [10, 12, 20, 11, 10][i]
      return { high, close: high - 1, open: high - 1, low: high - 2 }
    })
    const result = previewPineScript(source, tape, 'P')
    expect(result.unsupported).toBe(false)
    expect(result.lines[0].points.map((p) => ({ i: p.timestamp / 60_000, v: p.value }))).toEqual([
      { i: 3, v: 20 }
    ])
  })

  it('seeds ta.ema from the SMA of the first period, matching TradingView', () => {
    const source = `indicator("E", overlay=true)\nplot(ta.ema(close, 3))`
    const result = previewPineScript(source, candles(5), 'E')
    expect(result.unsupported).toBe(false)
    expect(result.lines[0].points.map((p) => p.value)).toEqual([101, 102, 103])
  })

  it('renders ICT FVG fills and does not overlay close', () => {
    const tape: Candle[] = []
    for (let i = 0; i < 24; i++) {
      const base = 100 + i * 0.4
      tape.push({
        timestamp: i * 60_000,
        open: base,
        high: base + 1.2,
        low: base - 0.4,
        close: base + 0.8,
        volume: 10
      })
    }
    // Pivot low around bar 6, pivot high around bar 16 so both swings exist.
    tape[6] = { ...tape[6], low: 90, close: 91, open: 92, high: 93 }
    tape[16] = { ...tape[16], high: 130, close: 128, open: 126, low: 125 }
    // Bullish-script FVG (low[2] > high[0]) at bar 20.
    tape[18] = { timestamp: 18 * 60_000, open: 120, high: 121, low: 119.5, close: 120.5, volume: 10 }
    tape[19] = { timestamp: 19 * 60_000, open: 118, high: 119, low: 110, close: 111, volume: 10 }
    tape[20] = { timestamp: 20 * 60_000, open: 108, high: 109, low: 107, close: 108.5, volume: 10 }
    tape[21] = { timestamp: 21 * 60_000, open: 108.2, high: 109.2, low: 107.8, close: 108.8, volume: 10 }

    const result = previewPineScript(ICT, tape, 'ICT')
    expect(result.title).toBe('ICT Structure & FVG Signals')
    expect(result.unsupported).toBe(false)
    expect(result.lines.every((line) => line.hidden)).toBe(true)
    expect(result.fills.some((fill) => fill.timestamp === 20 * 60_000)).toBe(true)
    expect(result.fills.find((fill) => fill.timestamp === 20 * 60_000)?.color).toMatch(/rgba\(8, 153, 129/)
  })

  it('merges consecutive equal fills into bands', () => {
    const source = `//@version=5
indicator("Band", overlay=true)
top = plot(120)
bot = plot(80)
fill(top, bot, color=color.new(color.green, 80))
`
    const result = previewPineScript(source, candles(40), 'Band')
    expect(result.fills).toHaveLength(1)
    expect(result.fills[0]?.timestamp).toBe(0)
    expect(result.fills[0]?.until).toBe(39 * 60_000)
    expect(previewPineScript(source, candles(40), 'Band')).toBe(result)
  })

  it('supports Bollinger Bands with ta.stdev', () => {
    const source = `//@version=5
indicator("Bollinger Bands", overlay=true)
length = 20
mult = 2.0
basis = ta.sma(close, length)
dev = mult * ta.stdev(close, length)
upper = basis + dev
lower = basis - dev
p1 = plot(upper, "Upper")
p2 = plot(lower, "Lower")
plot(basis, "Basis")
fill(p1, p2, color=color.new(color.teal, 90))
`
    const tape = candles(50)
    const result = previewPineScript(source, tape, 'BB')
    expect(result.unsupported).toBe(false)
    expect(result.lines).toHaveLength(3)
    expect(result.fills.length).toBeGreaterThan(0)
  })

  it('supports MACD with ta.macd and tuple assignment', () => {
    const source = `//@version=5
indicator("MACD", overlay=false)
[macdLine, signalLine, histLine] = ta.macd(close, 12, 26, 9)
plot(macdLine, "MACD")
plot(signalLine, "Signal")
plot(histLine, "Hist")
`
    const tape = candles(50)
    const result = previewPineScript(source, tape, 'MACD')
    expect(result.unsupported).toBe(false)
    expect(result.lines).toHaveLength(3)
    expect(result.lines[0].points.length).toBeGreaterThan(0)
  })

  it('supports Supertrend with ta.supertrend', () => {
    const source = `//@version=5
indicator("Supertrend", overlay=true)
[superTrend, direction] = ta.supertrend(3.0, 10)
plot(superTrend, "Supertrend")
`
    const tape = candles(50)
    const result = previewPineScript(source, tape, 'Supertrend')
    expect(result.unsupported).toBe(false)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].points.length).toBeGreaterThan(0)
  })

  it('supports ta.crossover on expressions directly without intermediate variables', () => {
    const source = `//@version=5
indicator("Cross", overlay=true)
buy = ta.crossover(ta.ema(close, 5), ta.ema(close, 10))
plotshape(buy, title="Buy")
`
    const tape = candles(30, (i) => ({ close: i === 15 ? 200 : 100 }))
    const result = previewPineScript(source, tape, 'Cross')
    expect(result.unsupported).toBe(false)
    expect(result.shapes.length).toBeGreaterThan(0)
  })

  it('plots horizontal lines with hline', () => {
    const source = `//@version=5
indicator("RSI", overlay=false)
plot(ta.rsi(close, 14), "RSI")
hline(70, "Overbought", color=color.red)
hline(30, "Oversold", color=color.green)
`
    const tape = candles(40)
    const result = previewPineScript(source, tape, 'RSI')
    expect(result.unsupported).toBe(false)
    expect(result.lines.some((l) => l.title === 'Overbought')).toBe(true)
    expect(result.lines.some((l) => l.title === 'Oversold')).toBe(true)
  })

  it('computes sliding window ta.highest and ta.lowest accurately', () => {
    const source = `//@version=5
indicator("HighLow", overlay=true)
plot(ta.highest(high, 5), "High5")
plot(ta.lowest(low, 5), "Low5")
`
    const tape = candles(10, (i) => ({ high: i * 2, low: i }))
    const result = previewPineScript(source, tape, 'HL')
    expect(result.unsupported).toBe(false)
    const highPoints = result.lines.find((l) => l.title === 'High5')?.points
    expect(highPoints?.[highPoints.length - 1].value).toBe(18)
  })

  it('accepts TradingView hex color literals like #RRGGBB', () => {
    const source = `//@version=5
indicator("Hex Colors", overlay=true)
bullCss = input.color(#089981, "Bullish")
bearCss = input.color(#f23645, "Bearish")
midCss = #2962FF
plot(close, "Close", color=color.new(midCss, 70))
`
    const diags = diagnosePineScript(source)
    expect(diags.filter((d) => d.severity === 'error')).toEqual([])
    const result = previewPineScript(source, candles(20), 'Hex')
    expect(result.unsupported).toBe(false)
    expect(result.lines[0]?.color).toMatch(/rgba\(41, 98, 255/)
  })

  it('accepts generic array.new<T>() like TradingView', () => {
    const source = `//@version=5
indicator("Generics", overlay=true)
var array<float> highs = array.new<float>()
var array<int> times = array.new<int>()
highs.push(high)
times.push(time)
plot(highs.size() > 0 ? highs.get(highs.size() - 1) : na, "Last High")
`
    const diags = diagnosePineScript(source)
    expect(diags.filter((d) => d.message.includes('Unexpected'))).toEqual([])
    expect(diags.filter((d) => d.message.includes('Unknown'))).toEqual([])
    const result = previewPineScript(source, candles(10), 'Generics')
    expect(result.unsupported).toBe(false)
    expect(result.lines[0]?.points.length).toBeGreaterThan(0)
  })

  it('does not warn on declared user functions or request.security stubs', () => {
    const source = `//@version=5
indicator("UDF", overlay=true)
ce(int len) =>
    ta.ema(close, len)
maCalc() =>
    ta.sma(close, 10)
plotcandle(open, high, low, close)
v = request.security(syminfo.tickerid, "60", ce(10))
plot(v, "CE")
plot(maCalc(), "MA")
`
    const diags = diagnosePineScript(source)
    expect(diags.filter((d) => d.severity === 'error')).toEqual([])
    expect(diags.filter((d) => d.message.includes('Unknown'))).toEqual([])
  })

  it('executes user functions so CE-style plots produce chart lines', () => {
    const source = `//@version=5
indicator("CE Mini", overlay=true)
ce(int len, int lb, float mult) =>
    atr = ta.sma(ta.tr(true)[1], len)
    hh = ta.highest(high[1], lb)
    ll = ta.lowest(low[1], lb)
    longRaw = hh - mult * atr
    shortRaw = ll + mult * atr
    var int trend = 1
    var float longStop = na
    var float shortStop = na
    trend := close > nz(shortStop[1], shortRaw) ? 1 : close < nz(longStop[1], longRaw) ? -1 : nz(trend[1], 1)
    longStop := trend == 1 ? math.max(longRaw, nz(longStop[1], longRaw)) : longRaw
    shortStop := trend == -1 ? math.min(shortRaw, nz(shortStop[1], shortRaw)) : shortRaw
    [trend, longStop, shortStop]

maCalc(string t, int len, float src) =>
    switch t
        "SMA" => ta.sma(src, len)
        "EMA" => ta.ema(src, len)
        => ta.wma(src, len)

[t, ls, ss] = request.security(syminfo.tickerid, "60", ce(10, 10, 3.0))
maVal = request.security(syminfo.tickerid, "15", maCalc("WMA", 20, close))
line = t == 1 ? ls : ss
plot(line, "CE")
plot(maVal, "MA")
`
    const diags = diagnosePineScript(source)
    expect(diags.filter((d) => d.severity === 'error')).toEqual([])
    const result = previewPineScript(source, candles(40), 'CE Mini')
    expect(result.unsupported).toBe(false)
    expect(result.lines.length).toBeGreaterThanOrEqual(1)
    expect(result.lines.some((l) => l.points.length > 0)).toBe(true)
  })
})
