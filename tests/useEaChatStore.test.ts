import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EaChatMessage, EaChatThread } from '@shared/types'
import { useAiProvidersStore } from '@/store/useAiProvidersStore'
import { useEaChatStore } from '@/store/useEaChatStore'

function thread(id: string, overrides: Partial<EaChatThread> = {}): EaChatThread {
  return { id, title: id, scriptId: 's1', createdAt: 0, updatedAt: 0, ...overrides }
}

function message(id: string, overrides: Partial<EaChatMessage> = {}): EaChatMessage {
  return {
    id,
    scriptId: 's1',
    threadId: 'thread-a',
    role: 'assistant',
    content: 'hi',
    providerId: 'p1',
    createdAt: 0,
    thinkingOnly: false,
    ...overrides
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const initialState = useEaChatStore.getState()

describe('useEaChatStore', () => {
  let ai: {
    sendChatMessage: ReturnType<typeof vi.fn>
    onChatChunk: ReturnType<typeof vi.fn>
    listChatMessages: ReturnType<typeof vi.fn>
    listChatThreads: ReturnType<typeof vi.fn>
    deleteChatThread: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    useEaChatStore.setState(initialState, true)
    useAiProvidersStore.setState({
      providers: [
        { id: 'p1', name: 'One', provider: 'openai', model: 'gpt-4o', baseUrl: null, hasApiKey: true }
      ]
    })
    ai = {
      sendChatMessage: vi.fn(),
      onChatChunk: vi.fn(() => vi.fn()),
      listChatMessages: vi.fn().mockResolvedValue([]),
      listChatThreads: vi.fn().mockResolvedValue([]),
      deleteChatThread: vi.fn().mockResolvedValue([])
    }
    ;(globalThis as unknown as { window: unknown }).window = { quantify: { ai } }
    useEaChatStore.setState({ currentThreadId: 'thread-a', selectedProviderId: 'p1' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('applies the resolved result normally when the user is still on the same thread', async () => {
    ai.sendChatMessage.mockResolvedValue({
      ok: true,
      thread: thread('thread-a'),
      messages: [message('m1')],
      threads: [thread('thread-a')]
    })

    await useEaChatStore.getState().sendMessage('s1', [], 'hello')

    const state = useEaChatStore.getState()
    expect(state.sending).toBe(false)
    expect(state.currentThreadId).toBe('thread-a')
    expect(state.messages).toEqual([message('m1')])
  })

  it('does not clobber the view when the user switched threads while the request was in flight', async () => {
    const pending = deferred<{
      ok: true
      thread: EaChatThread
      messages: EaChatMessage[]
      threads: EaChatThread[]
    }>()
    ai.sendChatMessage.mockReturnValue(pending.promise)

    const sendPromise = useEaChatStore.getState().sendMessage('s1', [], 'hello')

    // User navigates away before the response lands.
    await useEaChatStore.getState().openThread('thread-b')
    expect(useEaChatStore.getState().currentThreadId).toBe('thread-b')

    // The stale request for thread A now resolves.
    pending.resolve({
      ok: true,
      thread: thread('thread-a'),
      messages: [message('m1')],
      threads: [thread('thread-a'), thread('thread-b')]
    })
    await sendPromise

    const state = useEaChatStore.getState()
    expect(state.currentThreadId).toBe('thread-b')
    expect(state.messages).toEqual([])
    // The sidebar's thread list is still safe to merge in.
    expect(state.threads).toEqual([thread('thread-a'), thread('thread-b')])
  })

  it('keeps the optimistic user message visible when the send fails at the application level', async () => {
    // ipc.ts's failure branches return a `messages` list built from the DB,
    // which never includes the user's text since it's only persisted
    // alongside a successful reply — the store must not let that wipe out
    // what the user can see they typed.
    ai.sendChatMessage.mockResolvedValue({
      ok: false,
      message: 'No reply from the AI',
      messages: [],
      threads: []
    })

    await useEaChatStore.getState().sendMessage('s1', [], 'hello')

    const state = useEaChatStore.getState()
    expect(state.error).toBe('No reply from the AI')
    expect(state.messages.some((m) => m.role === 'user' && m.content === 'hello')).toBe(true)
  })

  it('resets sending instead of hanging forever when the IPC call rejects', async () => {
    ai.sendChatMessage.mockRejectedValue(new Error('sqlite is busy'))

    await expect(useEaChatStore.getState().sendMessage('s1', [], 'hello')).resolves.toBeUndefined()

    const state = useEaChatStore.getState()
    expect(state.sending).toBe(false)
    expect(state.error).toBe('sqlite is busy')
  })

  it('unsubscribes the chunk listener even when the IPC call rejects', async () => {
    const stop = vi.fn()
    ai.onChatChunk.mockReturnValue(stop)
    ai.sendChatMessage.mockRejectedValue(new Error('boom'))

    await useEaChatStore.getState().sendMessage('s1', [], 'hello')

    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('ignores chunks that arrive for an abandoned request after the user has navigated away', async () => {
    let onChunk: ((payload: { requestId: string; text?: string; thinking?: string }) => void) | undefined
    ai.onChatChunk.mockImplementation((cb) => {
      onChunk = cb
      return vi.fn()
    })
    ai.sendChatMessage.mockReturnValue(new Promise(() => {}))

    void useEaChatStore.getState().sendMessage('s1', [], 'hello')
    const requestId = ai.sendChatMessage.mock.calls[0][0].requestId
    onChunk?.({ requestId, text: 'partial reply for thread A' })
    expect(useEaChatStore.getState().streamText).toBe('partial reply for thread A')

    // User navigates away before the request settles; the listener is still
    // alive (its `finally` hasn't run yet) so more chunks can still arrive.
    await useEaChatStore.getState().openThread('thread-b')
    expect(useEaChatStore.getState().streamText).toBe('')

    onChunk?.({ requestId, text: 'more content the user never asked to see here' })

    const state = useEaChatStore.getState()
    expect(state.streamText).toBe('')
    expect(state.streamBlock).toBeNull()
    expect(state.thinking).toBe(false)
  })

  it('ignores a stale openThread resolution when the user has since started a new chat', async () => {
    const pending = deferred<EaChatMessage[]>()
    ai.listChatMessages.mockReturnValueOnce(pending.promise)

    const openPromise = useEaChatStore.getState().openThread('thread-a')

    // User clicks "New chat" before thread-a's history finishes loading.
    useEaChatStore.getState().newChat()
    expect(useEaChatStore.getState().currentThreadId).toBeNull()

    pending.resolve([message('m1')])
    await openPromise

    const state = useEaChatStore.getState()
    expect(state.currentThreadId).toBeNull()
    expect(state.messages).toEqual([])
  })

  it('ignores a stale loadHistory resolution when the user has since opened a different thread', async () => {
    const pending = deferred<EaChatThread[]>()
    ai.listChatThreads.mockReturnValueOnce(pending.promise)
    ai.listChatMessages.mockResolvedValue([message('m2', { threadId: 'thread-b' })])

    const loadPromise = useEaChatStore.getState().loadHistory()

    // User opens a specific thread before the initial history load resolves.
    await useEaChatStore.getState().openThread('thread-b')
    expect(useEaChatStore.getState().currentThreadId).toBe('thread-b')

    pending.resolve([thread('thread-a')])
    await loadPromise

    const state = useEaChatStore.getState()
    expect(state.currentThreadId).toBe('thread-b')
    expect(state.messages).toEqual([message('m2', { threadId: 'thread-b' })])
  })

  it('computes streamBlock once per chunk and resets it on newChat', () => {
    let onChunk: ((payload: { requestId: string; text?: string; thinking?: string }) => void) | undefined
    ai.onChatChunk.mockImplementation((cb) => {
      onChunk = cb
      return vi.fn()
    })
    ai.sendChatMessage.mockReturnValue(new Promise(() => {}))

    void useEaChatStore.getState().sendMessage('s1', [], 'hello')
    const requestId = ai.sendChatMessage.mock.calls[0][0].requestId

    onChunk?.({ requestId, text: 'Sure, ```mql5\nvoid OnTick() {}\n' })

    expect(useEaChatStore.getState().streamBlock?.content).toBe('void OnTick() {}')

    useEaChatStore.getState().newChat()
    expect(useEaChatStore.getState().streamBlock).toBeNull()
  })
})
