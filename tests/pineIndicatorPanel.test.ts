import { describe, expect, it } from 'vitest'
import { diagnosePineScript, previewPineScript } from '@core/indicators/pinePreview'
import type { Candle } from '@shared/types'

function mockCandles(n = 50): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: 1700000000000 + i * 60_000,
    open: 100 + i * 0.5,
    high: 102 + i * 0.5,
    low: 99 + i * 0.5,
    close: 101 + i * 0.5,
    volume: 1000
  }))
}

describe('Pine Script Indicators in Workspace', () => {
  it('validates custom EMA cross script and generates lines and shapes', () => {
    const code = `//@version=5
indicator("EMA Cross", overlay=true)
emaFast = ta.ema(close, 10)
emaSlow = ta.ema(close, 20)
plot(emaFast, "Fast", color=color.yellow)
plot(emaSlow, "Slow", color=color.blue)
`
    const diagnostics = diagnosePineScript(code)
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)

    const preview = previewPineScript(code, mockCandles(30), 'Custom EMA')
    expect(preview.lines.length).toBeGreaterThanOrEqual(2)
    expect(preview.lines[0].points.length).toBeGreaterThan(0)
  })

  it('handles oscillator indicator in oscillator pane', () => {
    const code = `//@version=5
indicator("RSI", overlay=false)
rsiValue = ta.rsi(close, 14)
plot(rsiValue, "RSI", color=color.purple)
`
    const preview = previewPineScript(code, mockCandles(30), 'RSI')
    const rsiLine = preview.lines.find((l) => l.title === 'RSI')
    expect(rsiLine).toBeDefined()
    expect(rsiLine?.pane).toBe('oscillator')
  })

  it('detects syntax errors gracefully', () => {
    const brokenCode = `//@version=5
indicator("Broken", overlay=true)
plot(ta.ema(close, )
`
    const diagnostics = diagnosePineScript(brokenCode)
    expect(diagnostics.length).toBeGreaterThan(0)
  })

  it('aggregates multiple indicators concurrently (overlay and oscillator)', () => {
    const candles = mockCandles(30)
    const ind1 = `//@version=5
indicator("EMA 20", overlay=true)
plot(ta.ema(close, 20), "EMA20", color=color.yellow)
`
    const ind2 = `//@version=5
indicator("RSI", overlay=false)
plot(ta.rsi(close, 14), "RSI", color=color.purple)
`
    const ind3 = `//@version=5
indicator("Bollinger", overlay=true)
p1 = plot(close + 2, "Upper")
p2 = plot(close - 2, "Lower")
fill(p1, p2, color=color.teal)
`
    const res1 = previewPineScript(ind1, candles, 'EMA 20')
    const res2 = previewPineScript(ind2, candles, 'RSI')
    const res3 = previewPineScript(ind3, candles, 'Bollinger')

    const combinedLines = [...res1.lines, ...res2.lines, ...res3.lines]
    const combinedFills = [...res1.fills, ...res2.fills, ...res3.fills]

    expect(combinedLines.length).toBe(4) // EMA20, RSI, Upper, Lower
    expect(combinedFills.length).toBe(30) // 1 fill per bar across 30 bars
    expect(combinedLines.filter((l) => l.pane === 'oscillator').length).toBe(1)
    expect(combinedLines.filter((l) => l.pane !== 'oscillator').length).toBe(3)
  })

  it('manages multiple indicators in store (add, toggle, duplicate, remove)', async () => {
    const { useAppStore } = await import('@/store/useAppStore')
    const store = useAppStore.getState()

    const initialCount = store.pineIndicators.length
    expect(initialCount).toBeGreaterThanOrEqual(1)

    // Add a new indicator — starts detached from the chart
    const newId = store.addPineIndicator({
      name: 'Test RSI',
      code: '//@version=5\nindicator("Test RSI")\nplot(ta.rsi(close, 14))\n'
    })
    expect(useAppStore.getState().pineIndicators.length).toBe(initialCount + 1)
    expect(useAppStore.getState().activePineIndicatorId).toBe(newId)
    expect(useAppStore.getState().pineIndicators.find((i) => i.id === newId)?.enabled).toBe(false)

    // Attach via toggle, then detach
    store.togglePineIndicator(newId)
    expect(useAppStore.getState().pineIndicators.find((i) => i.id === newId)?.enabled).toBe(true)
    store.togglePineIndicator(newId)
    expect(useAppStore.getState().pineIndicators.find((i) => i.id === newId)?.enabled).toBe(false)

    // Duplicate indicator stays detached
    store.duplicatePineIndicator(newId)
    expect(useAppStore.getState().pineIndicators.length).toBe(initialCount + 2)
    const dup = useAppStore.getState().pineIndicators.find((i) => i.name.includes('Test RSI (Copy)'))
    expect(dup).toBeDefined()
    expect(dup?.enabled).toBe(false)

    // Remove indicator
    store.removePineIndicator(newId)
    expect(useAppStore.getState().pineIndicators.find((i) => i.id === newId)).toBeUndefined()
  })
})
