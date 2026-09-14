import { create } from 'zustand'
import type { EaChatAttachedFile, EaChatMessage, EaChatThread } from '@shared/types'
import { desktop } from '../lib/desktop'
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
  error: string | null
  selectedProviderId: string | null
  currentScriptId: string | null
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
  error: null,
  selectedProviderId: null,
  currentScriptId: null,

  loadHistory: async () => {
    const threads = (await aiBridge()?.listChatThreads()) ?? []
    const latest = threads[0]
    if (!latest) {
      set({ threads, currentThreadId: null, messages: [], error: null })
      return
    }
    const messages = (await aiBridge()?.listChatMessages(latest.id)) ?? []
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
      thinking: false,
      streamText: '',
      streamThinking: '',
      selectedProviderId: lastStillExists ? lastId : (fallback ?? lastId ?? get().selectedProviderId)
    })
  },

  openThread: async (threadId) => {
    const messages = (await aiBridge()?.listChatMessages(threadId)) ?? []
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    const providers = useAiProvidersStore.getState().providers
    const lastId = lastAssistant?.providerId ?? null
    const lastStillExists = lastId !== null && providers.some((p) => p.id === lastId)
    set({
      currentThreadId: threadId,
      messages,
      error: null,
      thinking: false,
      streamText: '',
      streamThinking: '',
      selectedProviderId: lastStillExists
        ? lastId
        : (get().selectedProviderId ?? providers[0]?.id ?? null)
    })
  },

  newChat: () => {
    set({
      currentThreadId: null,
      messages: [],
      error: null,
      thinking: false,
      sending: false,
      streamText: '',
      streamThinking: ''
    })
  },

  deleteThread: async (threadId) => {
    const threads = (await aiBridge()?.deleteChatThread(threadId)) ?? []
    if (get().currentThreadId === threadId) {
      set({
        threads,
        currentThreadId: null,
        messages: [],
        error: null,
        streamText: '',
        streamThinking: ''
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
      createdAt: Date.now()
    }
    set({
      sending: true,
      thinking: true,
      streamText: '',
      streamThinking: '',
      error: null,
      messages: [...get().messages, optimistic]
    })
    const stop = aiBridge()?.onChatChunk?.((payload) => {
      if (payload.requestId !== requestId) return
      set((state) => ({
        thinking: false,
        streamText: payload.text ? state.streamText + payload.text : state.streamText,
        streamThinking: payload.thinking
          ? state.streamThinking + payload.thinking
          : state.streamThinking
      }))
    })
    const result = await aiBridge()?.sendChatMessage({
      scriptId,
      threadId,
      providerId,
      files,
      message: text,
      requestId
    })
    stop?.()
    if (!result || !result.ok) {
      const stillExists = useAiProvidersStore
        .getState()
        .providers.some((p) => p.id === providerId)
      set({
        sending: false,
        thinking: false,
        streamText: '',
        streamThinking: '',
        error: result?.message ?? 'Not running in Electron',
        currentThreadId: result?.thread?.id ?? get().currentThreadId,
        messages:
          result && 'messages' in result && result.messages ? result.messages : get().messages,
        threads: result?.threads ?? get().threads,
        selectedProviderId: stillExists
          ? providerId
          : (useAiProvidersStore.getState().providers[0]?.id ?? null)
      })
      return
    }
    set({
      sending: false,
      thinking: false,
      streamText: '',
      streamThinking: '',
      currentThreadId: result.thread.id,
      messages: result.messages,
      threads: result.threads,
      error: null
    })
  }
}))
