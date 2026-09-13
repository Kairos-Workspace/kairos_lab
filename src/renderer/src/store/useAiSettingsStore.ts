import { create } from 'zustand'
import type { AiSettings } from '@shared/types'
import { desktop } from '../lib/desktop'

function aiBridge() {
  return desktop()?.ai
}

interface TestResult {
  ok: boolean
  message: string
}

interface AiSettingsState {
  settings: AiSettings | null
  testing: boolean
  testResult: TestResult | null
  loadSettings: () => Promise<void>
  saveSettings: (
    patch: { provider: AiSettings['provider']; model: string; baseUrl: string | null },
    apiKey: string
  ) => Promise<void>
  testConnection: () => Promise<void>
}

export const useAiSettingsStore = create<AiSettingsState>((set) => ({
  settings: null,
  testing: false,
  testResult: null,

  loadSettings: async () => {
    const settings = (await aiBridge()?.getSettings()) ?? null
    set({ settings })
  },

  saveSettings: async (patch, apiKey) => {
    await aiBridge()?.saveSettings(patch)
    if (apiKey.trim()) {
      await aiBridge()?.setApiKey(apiKey.trim())
    }
    const settings = (await aiBridge()?.getSettings()) ?? null
    set({ settings, testResult: null })
  },

  testConnection: async () => {
    set({ testing: true, testResult: null })
    const result = (await aiBridge()?.testConnection()) ?? {
      ok: false,
      message: 'Not running in Electron'
    }
    set({ testing: false, testResult: result })
  }
}))
