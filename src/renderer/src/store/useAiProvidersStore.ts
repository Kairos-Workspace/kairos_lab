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
  modelsById: Record<string, string[]>
  modelsError: string | null
  loadingModels: boolean
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
  setProviderModel: (id: string, model: string) => Promise<void>
  loadModels: (id: string) => Promise<void>
  deleteProvider: (id: string) => Promise<void>
  testConnection: (id: string) => Promise<void>
  clearTestResult: () => void
}

export const useAiProvidersStore = create<AiProvidersState>((set, get) => ({
  providers: [],
  testing: false,
  testResult: null,
  modelsById: {},
  modelsError: null,
  loadingModels: false,

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
    if (!keyError) await get().loadModels(profile.id)
  },

  setProviderModel: async (id, model) => {
    const profile = get().providers.find((p) => p.id === id)
    if (!profile) return
    const providers = (await aiBridge()?.saveProvider({
      id: profile.id,
      name: profile.name,
      provider: profile.provider,
      model,
      baseUrl: profile.baseUrl
    })) ?? get().providers.map((p) => (p.id === id ? { ...p, model } : p))
    set({ providers })
  },

  loadModels: async (id) => {
    set({ loadingModels: true, modelsError: null })
    const result = await aiBridge()?.listModels(id)
    if (!result) {
      set({ loadingModels: false, modelsError: 'Not running in Electron' })
      return
    }
    set({
      loadingModels: false,
      modelsById: { ...get().modelsById, [id]: result.models },
      modelsError: result.ok ? null : (result.message ?? 'Could not load models')
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
