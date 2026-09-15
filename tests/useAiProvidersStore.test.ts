import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAiProvidersStore } from '@/store/useAiProvidersStore'

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const initialState = useAiProvidersStore.getState()

describe('useAiProvidersStore.loadModels', () => {
  let ai: { listModels: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    useAiProvidersStore.setState(initialState, true)
    ai = { listModels: vi.fn() }
    ;(globalThis as unknown as { window: unknown }).window = { quantify: { ai } }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keys loadingModels and modelsError per provider id, not globally', async () => {
    const slow = deferred<{ ok: boolean; models: string[]; message?: string }>()
    const fast = deferred<{ ok: boolean; models: string[]; message?: string }>()
    ai.listModels.mockImplementation((id: string) => (id === 'slow' ? slow.promise : fast.promise))

    const slowLoad = useAiProvidersStore.getState().loadModels('slow')
    const fastLoad = useAiProvidersStore.getState().loadModels('fast')

    expect(useAiProvidersStore.getState().loadingModels.slow).toBe(true)
    expect(useAiProvidersStore.getState().loadingModels.fast).toBe(true)

    // The fast request for a different provider resolves first...
    fast.resolve({ ok: true, models: ['fast-model'] })
    await fastLoad
    expect(useAiProvidersStore.getState().loadingModels.fast).toBe(false)
    // ...and must not touch the still-pending 'slow' provider's state.
    expect(useAiProvidersStore.getState().loadingModels.slow).toBe(true)

    // The slow request then fails.
    slow.resolve({ ok: false, models: [], message: 'boom' })
    await slowLoad
    expect(useAiProvidersStore.getState().loadingModels.slow).toBe(false)
    expect(useAiProvidersStore.getState().modelsError.slow).toBe('boom')
    // The fast provider's (successful, no-error) state must stay untouched.
    expect(useAiProvidersStore.getState().modelsError.fast).toBeFalsy()
    expect(useAiProvidersStore.getState().modelsById.fast).toEqual(['fast-model'])
  })
})
