import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compileEaScript } from '@core/ea/compile'
import { useAppStore } from '@/store/useAppStore'
import { notifyError } from '@/lib/notify'
import { series } from './helpers'

vi.mock('@/lib/notify', () => ({
  notifyError: vi.fn(),
  notifyInfo: vi.fn(),
  notifySuccess: vi.fn()
}))

const initialState = useAppStore.getState()

async function start(code: string): Promise<void> {
  const compiled = compileEaScript(code, { name: 'Test EA' })
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
  await useAppStore.getState().openEaBacktest({
    scriptId: 'test-ea', scriptName: 'Test EA', strategy: compiled.strategy
  })
  useAppStore.getState().startReplay()
}

describe('EA replay integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState(initialState, true)
    const candles = series(0, 60_000, Array.from({ length: 100 }, (_, i) => i + 1))
    useAppStore.setState({
      sourceCandles: candles,
      displayCandles: candles,
      displayTimeframe: '1M',
      sourceTimeframe: '1M',
      busy: false
    })
  })

  afterEach(() => {
    useAppStore.getState().pause()
    useAppStore.setState(initialState, true)
  })

  it('provides enough history for a shifted SMA whose period is an expression', async () => {
    await start(`input int Period = 25;
      void OnTick() { if (SMA(Period * 2, 2) == 25.5) Buy("long history"); }`)
    useAppStore.getState().step(1)
    expect(useAppStore.getState().pendingSetup?.reason).toBe('long history')
    expect(notifyError).not.toHaveBeenCalled()
  })

  it('waits for a longer period to warm up instead of silently starving it forever', async () => {
    await start('void OnTick() { if (SMA(70) > 0) Buy(); }')
    useAppStore.getState().step(18)
    expect(useAppStore.getState().pendingSetup).toBeNull()
    useAppStore.getState().step(1)
    expect(useAppStore.getState().pendingSetup?.timestamp).toBe(69 * 60_000)
    expect(notifyError).not.toHaveBeenCalled()
  })

  it('does not expose future prices to the EA', async () => {
    await start('void OnTick() { if (close[0] == 53) Buy("bar 52"); }')
    useAppStore.getState().step(1)
    expect(useAppStore.getState().pendingSetup).toBeNull()
    useAppStore.getState().step(1)
    expect(useAppStore.getState().pendingSetup?.timestamp).toBe(52 * 60_000)
  })

  it('preserves full EMA history, including its original seed', async () => {
    const candles = series(0, 60_000, [1000, ...Array(99).fill(1)])
    useAppStore.setState({ sourceCandles: candles, displayCandles: candles })
    await start('void OnTick() { if (EMA(5) > 1) Buy("seed retained"); }')
    useAppStore.getState().step(1)
    expect(useAppStore.getState().pendingSetup?.reason).toBe('seed retained')
  })

  it.each(['SMA(0)', 'close[-1]', 'Buy(123)'])(
    'pauses a batched replay and reports runtime failure: %s', async (expression) => {
      await start(`void OnTick() { ${expression}; }`)
      useAppStore.setState({ isPlaying: true })
      useAppStore.getState().step(10)
      const state = useAppStore.getState()
      expect(state.isPlaying).toBe(false)
      expect(state.replayIndex).toBe(51)
      expect(state.pendingSetup).toBeNull()
      expect(state.trades).toEqual([])
      expect(state.status).toContain('Test EA stopped at')
      expect(notifyError).toHaveBeenCalledExactlyOnceWith(state.status)
    }
  )
})
