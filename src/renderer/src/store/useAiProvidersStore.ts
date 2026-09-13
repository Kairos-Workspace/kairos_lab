import { create } from 'zustand'
import type { AiProviderProfile } from '@shared/types'
import { desktop } from '../lib/desktop'

function aiBridge() {
  return desktop()?.ai
}

interface TestResult {
  ok: boolean
  message: string
}

interface AiProvidersState {
  providers: AiProviderProfile[]
  testing: boolean
  testResult: TestResult | null
  loadProviders: () => Promise<void>
  saveProvider: (
    profile: {
      id: string
      name: string
      provider: AiProviderProfile['provider']
      model: string
      baseUrl: string | null
    },
    apiKey: string
  ) => Promise<void>
  deleteProvider: (id: string) => Promise<void>
  testConnection: (id: string) => Promise<void>
  clearTestResult: () => void
}

export const useAiProvidersStore = create<AiProvidersState>((set, get) => ({
  providers: [],
  testing: false,
  testResult: null,

  loadProviders: async () => {
    const providers = (await aiBridge()?.listProviders()) ?? []
    set({ providers })
  },

  saveProvider: async (profile, apiKey) => {
    await aiBridge()?.saveProvider(profile)
    let keyError: string | null = null
    if (apiKey.trim()) {
      const result = await aiBridge()?.setProviderApiKey(profile.id, apiKey.trim())
      if (result && !result.ok) keyError = result.error ?? 'Failed to save the API key'
    }
    const providers = (await aiBridge()?.listProviders()) ?? get().providers
    set({
      providers,
      testResult: keyError ? { ok: false, message: keyError } : null
    })
  },

  deleteProvider: async (id) => {
    const providers = (await aiBridge()?.deleteProvider(id)) ?? get().providers.filter((p) => p.id !== id)
    set({ providers })
  },

  testConnection: async (id) => {
    set({ testing: true, testResult: null })
    const result = (await aiBridge()?.testConnection(id)) ?? {
      ok: false,
      message: 'Not running in Electron'
    }
    set({ testing: false, testResult: result })
  },

  clearTestResult: () => {
    set({ testResult: null })
  }
}))
