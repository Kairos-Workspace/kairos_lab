import { create } from 'zustand'
import type { EaChatMessage } from '@shared/types'
import { desktop } from '../lib/desktop'
import { useAiProvidersStore } from './useAiProvidersStore'

function aiBridge() {
  return desktop()?.ai
}

interface EaChatState {
  messages: EaChatMessage[]
  sending: boolean
  error: string | null
  selectedProviderId: string | null
  currentScriptId: string | null
  loadMessages: (scriptId: string) => Promise<void>
  setSelectedProviderId: (id: string) => void
  sendMessage: (scriptId: string, currentCode: string, text: string) => Promise<void>
  clearChat: (scriptId: string) => Promise<void>
}

export const useEaChatStore = create<EaChatState>((set, get) => ({
  messages: [],
  sending: false,
  error: null,
  selectedProviderId: null,
  currentScriptId: null,

  loadMessages: async (scriptId) => {
    set({ currentScriptId: scriptId })
    const messages = (await aiBridge()?.listChatMessages(scriptId)) ?? []
    if (get().currentScriptId !== scriptId) return
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    const fallback = useAiProvidersStore.getState().providers[0]?.id ?? null
    set({ messages, error: null, selectedProviderId: lastAssistant?.providerId ?? fallback })
  },

  setSelectedProviderId: (id) => {
    set({ selectedProviderId: id, error: null })
  },

  sendMessage: async (scriptId, currentCode, text) => {
    const providerId = get().selectedProviderId
    if (!providerId) {
      set({ error: 'Add an AI provider in Settings first' })
      return
    }
    set({ sending: true, error: null })
    const result = await aiBridge()?.sendChatMessage({
      scriptId,
      providerId,
      currentCode,
      message: text
    })
    if (get().currentScriptId !== scriptId) {
      set({ sending: false })
      return
    }
    if (!result || !result.ok) {
      const stillExists = useAiProvidersStore
        .getState()
        .providers.some((p) => p.id === providerId)
      set({
        sending: false,
        error: result?.message ?? 'Not running in Electron',
        selectedProviderId: stillExists
          ? providerId
          : (useAiProvidersStore.getState().providers[0]?.id ?? null)
      })
      return
    }
    set({ sending: false, messages: result.messages, error: null })
  },

  clearChat: async (scriptId) => {
    const messages = (await aiBridge()?.clearChat(scriptId)) ?? []
    if (get().currentScriptId !== scriptId) return
    set({ messages, error: null })
  }
}))
