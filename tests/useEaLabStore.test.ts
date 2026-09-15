import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EaScript } from '@shared/types'
import { useEaChatStore } from '@/store/useEaChatStore'
import { useEaLabStore } from '@/store/useEaLabStore'

vi.mock('@/lib/notify', () => ({
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyError: vi.fn()
}))

function script(id: string, overrides: Partial<EaScript> = {}): EaScript {
  return { id, name: id, code: `// ${id}`, createdAt: 0, updatedAt: 0, ...overrides }
}

const initialState = useEaLabStore.getState()
const initialChatState = useEaChatStore.getState()

describe('useEaLabStore', () => {
  let eaScripts: { save: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    useEaLabStore.setState(initialState, true)
    useEaChatStore.setState(initialChatState, true)
    eaScripts = {
      save: vi.fn().mockImplementation(async (s: EaScript) => {
        const others = useEaLabStore.getState().scripts.filter((x) => x.id !== s.id)
        return [s, ...others]
      }),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue([])
    }
    ;(globalThis as unknown as { window: unknown }).window = { quantify: { eaScripts } }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('applyCodeToScript', () => {
    it('writes into the active script draft when the target is the active script', () => {
      useEaLabStore.setState({
        scripts: [script('a'), script('b')],
        activeScriptId: 'a',
        draftCode: '// old',
        dirty: false
      })

      useEaLabStore.getState().applyCodeToScript('a', '// new', { quiet: true })

      expect(useEaLabStore.getState().draftCode).toBe('// new')
      expect(useEaLabStore.getState().dirty).toBe(true)
    })

    it('does not overwrite the active draft when the target script no longer exists', () => {
      // Script 'a' was deleted mid-stream; the active script is now 'b'.
      useEaLabStore.setState({
        scripts: [script('b')],
        activeScriptId: 'b',
        draftCode: '// b original',
        dirty: false
      })

      useEaLabStore.getState().applyCodeToScript('a', '// stale AI output for deleted a', { quiet: true })

      const state = useEaLabStore.getState()
      expect(state.draftCode).toBe('// b original')
      expect(state.dirty).toBe(false)
    })
  })

  describe('selectScript', () => {
    it('saves the previous script and switches when nothing is streaming', async () => {
      useEaLabStore.setState({
        scripts: [script('a'), script('b')],
        activeScriptId: 'a',
        draftCode: '// edited a',
        dirty: true
      })
      useEaChatStore.setState({ sending: false })

      await useEaLabStore.getState().selectScript('b')

      expect(eaScripts.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', code: '// edited a' }))
      expect(useEaLabStore.getState().activeScriptId).toBe('b')
    })

    it('does not persist a half-streamed draft when the AI is still sending', async () => {
      useEaLabStore.setState({
        scripts: [script('a'), script('b')],
        activeScriptId: 'a',
        draftCode: '// half-generated AI code',
        dirty: true
      })
      useEaChatStore.setState({ sending: true })

      await useEaLabStore.getState().selectScript('b')

      expect(eaScripts.save).not.toHaveBeenCalled()
      expect(useEaLabStore.getState().activeScriptId).toBe('b')
    })
  })
})
