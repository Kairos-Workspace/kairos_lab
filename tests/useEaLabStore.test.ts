import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EaScript } from '@shared/types'
import { useEaChatStore } from '@/store/useEaChatStore'
import { useEaLabStore } from '@/store/useEaLabStore'

const { openEaBacktest } = vi.hoisted(() => ({
  openEaBacktest: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('@/lib/notify', () => ({
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyError: vi.fn()
}))

vi.mock('@/store/useAppStore', () => ({
  useAppStore: {
    getState: () => ({ openEaBacktest })
  }
}))

function script(id: string, overrides: Partial<EaScript> = {}): EaScript {
  return {
    id,
    name: id,
    kind: 'ea',
    language: 'mql5',
    code: `// ${id}`,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  }
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

  describe('compile actions', () => {
    it('resets compileStatus when draft changes', () => {
      useEaLabStore.setState({
        kind: 'ea',
        activeScriptId: 'a',
        draftCode: 'void OnTick() {}',
        compileStatus: 'ok',
        diagnostics: [{ severity: 'warning', message: 'x', line: 1, column: 1 }],
        dirty: false
      })

      useEaLabStore.getState().updateDraftCode('void OnTick() { Buy(); }')

      expect(useEaLabStore.getState().compileStatus).toBe('idle')
      expect(useEaLabStore.getState().diagnostics).toEqual([])
    })

    it('compiles the active EA and records success', () => {
      useEaLabStore.setState({
        kind: 'ea',
        scripts: [script('a', { name: 'Cross EA' })],
        activeScriptId: 'a',
        draftCode: 'void OnTick() { Buy(); }'
      })

      expect(useEaLabStore.getState().compileActive()).toBe(true)
      expect(useEaLabStore.getState().compileStatus).toBe('ok')
      expect(useEaLabStore.getState().lastCompiledAt).not.toBeNull()
    })

    it('opens a backtest for a successfully compiled EA', async () => {
      useEaLabStore.setState({
        kind: 'ea',
        scripts: [script('a', { name: 'Cross EA' })],
        activeScriptId: 'a',
        draftCode: 'void OnTick() { Buy(); }',
        dirty: false
      })

      await expect(useEaLabStore.getState().runBacktest()).resolves.toBe(true)
      expect(openEaBacktest).toHaveBeenCalledWith(
        expect.objectContaining({ scriptId: 'a', scriptName: 'Cross EA' })
      )
    })
  })

  describe('createScript', () => {
    it('creates an expert advisor with the EA starter template', async () => {
      await useEaLabStore.getState().createScript()
      const created = eaScripts.save.mock.calls[0][0] as EaScript
      expect(created.kind).toBe('ea')
      expect(created.language).toBe('mql5')
      expect(created.name).toBe('Untitled EA')
      expect(created.code).toContain('OnTick')
    })

    it('creates an MQL5 indicator by default', async () => {
      useEaLabStore.getState().setKind('indicator')
      await useEaLabStore.getState().createScript()
      const created = eaScripts.save.mock.calls[0][0] as EaScript
      expect(created.kind).toBe('indicator')
      expect(created.language).toBe('mql5')
      expect(created.name).toBe('Untitled Indicator')
      expect(created.code).toContain('OnCalculate')
      expect(created.code).toContain('#property indicator_chart_window')
    })

    it('creates a Pine Script indicator when asked', async () => {
      useEaLabStore.getState().setKind('indicator')
      await useEaLabStore.getState().createScript('pinescript')
      const created = eaScripts.save.mock.calls[0][0] as EaScript
      expect(created.kind).toBe('indicator')
      expect(created.language).toBe('pinescript')
      expect(created.code).toContain('//@version=5')
      expect(created.code).toContain('indicator(')
    })
  })
})
