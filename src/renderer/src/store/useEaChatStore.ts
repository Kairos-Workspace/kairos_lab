import { create } from 'zustand'
import type { EaChatAttachedFile, EaChatMessage, EaChatThread, ScriptKind } from '@shared/types'
import { desktop } from '../lib/desktop'
import { pickValidProviderId } from '../lib/aiProviders'
import { type ChatContentSegment, latestCodeBlock } from '../lib/extractCodeBlocks'
import { useAiProvidersStore } from './useAiProvidersStore'

function aiBridge() {
  return desktop()?.ai
}

interface EaChatState {
  messages: EaChatMessage[]
  threads: EaChatThread[]
  currentThreadId: string | null
  sending: boolean
  thinking: boolean
  streamText: string
  streamThinking: string
  streamBlock: ChatContentSegment | null
  activeRequestId: string | null
  navSeq: number
  error: string | null
  selectedProviderId: string | null
  currentScriptId: string | null
  labKind: ScriptKind
  setLabKind: (kind: ScriptKind) => void
  loadHistory: () => Promise<void>
  openThread: (threadId: string) => Promise<void>
  newChat: () => void
  deleteThread: (threadId: string) => Promise<void>
  setCurrentScriptId: (scriptId: string | null) => void
  setSelectedProviderId: (id: string) => void
  sendMessage: (scriptId: string, files: EaChatAttachedFile[], text: string) => Promise<void>
}

export const useEaChatStore = create<EaChatState>((set, get) => ({
  messages: [],
  threads: [],
  currentThreadId: null,
  sending: false,
  thinking: false,
  streamText: '',
  streamThinking: '',
  streamBlock: null,
  activeRequestId: null,
  navSeq: 0,
  error: null,
  selectedProviderId: null,
  currentScriptId: null,
  labKind: 'ea',

  setLabKind: (kind) => {
    if (get().labKind === kind) return
    set({
      labKind: kind,
      messages: [],
      threads: [],
      currentThreadId: null,
      sending: false,
      thinking: false,
      streamText: '',
      streamThinking: '',
      streamBlock: null,
      activeRequestId: null,
      error: null,
      navSeq: get().navSeq + 1
    })
  },

  loadHistory: async () => {
    // Guards against a slower loadHistory/openThread call resolving after a
    // newer navigation action has already changed what the user is looking
    // at — without this, its `set()` below would silently snap the view back.
    const seq = get().navSeq + 1
    set({ navSeq: seq })
    const threads = (await aiBridge()?.listChatThreads(get().labKind)) ?? []
    const latest = threads[0]
    if (!latest) {
      if (get().navSeq !== seq) return
      set({
        threads,
        currentThreadId: null,
        messages: [],
        error: null,
        sending: false,
        streamText: '',
        streamThinking: '',
        streamBlock: null,
        activeRequestId: null
      })
      return
    }
    const messages = (await aiBridge()?.listChatMessages(latest.id)) ?? []
    if (get().navSeq !== seq) return
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    const providers = useAiProvidersStore.getState().providers
    const lastId = lastAssistant?.providerId ?? null
    const lastStillExists = lastId !== null && providers.some((p) => p.id === lastId)
    const fallback = providers[0]?.id ?? null
    set({
      threads,
      currentThreadId: latest.id,
      messages,
      error: null,
      sending: false,
      thinking: false,
      streamText: '',
      streamThinking: '',
      streamBlock: null,
      activeRequestId: null,
      selectedProviderId: lastStillExists ? lastId : (fallback ?? lastId ?? get().selectedProviderId)
    })
  },

  openThread: async (threadId) => {
    const seq = get().navSeq + 1
    set({ navSeq: seq })
    const messages = (await aiBridge()?.listChatMessages(threadId)) ?? []
    if (get().navSeq !== seq) return
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    const providers = useAiProvidersStore.getState().providers
    const lastId = lastAssistant?.providerId ?? null
    const lastStillExists = lastId !== null && providers.some((p) => p.id === lastId)
    set({
      currentThreadId: threadId,
      messages,
      error: null,
      sending: false,
      thinking: false,
      streamText: '',
      streamThinking: '',
      streamBlock: null,
      activeRequestId: null,
      selectedProviderId: lastStillExists
        ? lastId
        : (get().selectedProviderId ?? providers[0]?.id ?? null)
    })
  },

  newChat: () => {
    set({
      navSeq: get().navSeq + 1,
      currentThreadId: null,
      messages: [],
      error: null,
      thinking: false,
      sending: false,
      streamText: '',
      streamThinking: '',
      streamBlock: null,
      activeRequestId: null
    })
  },

  deleteThread: async (threadId) => {
    const threads = (await aiBridge()?.deleteChatThread(threadId, get().labKind)) ?? []
    if (get().currentThreadId === threadId) {
      set({
        threads,
        currentThreadId: null,
        messages: [],
        error: null,
        sending: false,
        streamText: '',
        streamThinking: '',
        streamBlock: null,
        activeRequestId: null
      })
      return
    }
    set({ threads })
  },

  setCurrentScriptId: (scriptId) => {
    set({ currentScriptId: scriptId })
  },

  setSelectedProviderId: (id) => {
    set({ selectedProviderId: id, error: null })
  },

  sendMessage: async (scriptId, files, text) => {
    const providerId = get().selectedProviderId
    if (!providerId) {
      set({ error: 'Add an AI provider in Settings first' })
      return
    }
    const requestId = crypto.randomUUID()
    const threadId = get().currentThreadId
    const optimistic: EaChatMessage = {
      id: requestId,
      scriptId,
      threadId,
      role: 'user',
      content: text,
      providerId: null,
      createdAt: Date.now(),
      thinkingOnly: false
    }
    set({
      sending: true,
      thinking: true,
      streamText: '',
      streamThinking: '',
      streamBlock: null,
      activeRequestId: requestId,
      error: null,
      messages: [...get().messages, optimistic]
    })
    const stop = aiBridge()?.onChatChunk?.((payload) => {
      // The listener for an abandoned request can still be alive (it's only
      // unsubscribed once its own `sendChatMessage` call settles), so also
      // check it's still the request the user is actually looking at —
      // otherwise a late chunk would bleed into whatever thread/new chat the
      // user has since navigated to.
      if (payload.requestId !== requestId || get().activeRequestId !== requestId) return
      set((state) => {
        const streamText = payload.text ? state.streamText + payload.text : state.streamText
        return {
          thinking: false,
          streamText,
          // Parsed once per chunk here and reused by every consumer (the
          // live-apply effect, the "writing" indicator) instead of each of
          // them re-scanning the whole accumulated reply on every tick.
          streamBlock: payload.text
            ? latestCodeBlock(streamText, { allowOpenFence: true })
            : state.streamBlock,
          streamThinking: payload.thinking
            ? state.streamThinking + payload.thinking
            : state.streamThinking
        }
      })
    })
    type SendResult = Awaited<
      ReturnType<NonNullable<ReturnType<typeof aiBridge>>['sendChatMessage']>
    >
    let result: SendResult | undefined
    let failure: string | null = null
    try {
      result = await aiBridge()?.sendChatMessage({
        scriptId,
        threadId,
        providerId,
        files,
        message: text,
        requestId
      })
    } catch (err) {
      failure = err instanceof Error ? err.message : 'Failed to send message'
    } finally {
      stop?.()
    }

    // The user may have switched threads or started a new chat while this
    // request was in flight. If so, this response is stale: only the thread
    // list is still safe to merge in, since applying anything else would
    // silently snap the view back to a conversation the user has left.
    if (get().activeRequestId !== requestId) {
      if (result?.threads) set({ threads: result.threads })
      return
    }

    if (failure || !result || !result.ok) {
      const resultFailure = result && !result.ok ? result : null
      // The user's message is only ever persisted alongside a successful
      // reply (see saveChatExchange in ipc.ts), so a server-confirmed
      // `messages` list on any failure path never includes it — re-append
      // the optimistic entry here instead of letting it silently vanish.
      const messages = resultFailure?.messages
        ? [...resultFailure.messages, optimistic]
        : get().messages
      set({
        sending: false,
        thinking: false,
        streamText: '',
        streamThinking: '',
        streamBlock: null,
        activeRequestId: null,
        error: failure ?? resultFailure?.message ?? 'Not running in Electron',
        currentThreadId: resultFailure?.thread?.id ?? get().currentThreadId,
        messages,
        threads: resultFailure?.threads ?? get().threads,
        selectedProviderId: pickValidProviderId(providerId, useAiProvidersStore.getState().providers)
      })
      return
    }
    set({
      sending: false,
      thinking: false,
      streamText: '',
      streamThinking: '',
      streamBlock: null,
      activeRequestId: null,
      currentThreadId: result.thread.id,
      messages: result.messages,
      threads: result.threads,
      error: null
    })
  }
}))
