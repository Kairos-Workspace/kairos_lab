import { create } from 'zustand'
import { notifyInfo, notifySuccess } from '@/lib/notify'
import type { EaScript } from '@shared/types'
import { desktop } from '../lib/desktop'

function eaScriptBridge() {
  return desktop()?.eaScripts
}

function newId(): string {
  return crypto.randomUUID()
}

const STARTER_TEMPLATE = `void OnInit()
{
}

void OnTick()
{
}
`

interface EaLabState {
  scripts: EaScript[]
  activeScriptId: string | null
  draftCode: string
  dirty: boolean
  loadScripts: () => Promise<void>
  createScript: () => Promise<void>
  selectScript: (id: string) => void
  updateDraftCode: (code: string) => void
  saveActiveScript: () => Promise<void>
  renameScript: (id: string, name: string) => Promise<void>
  deleteScript: (id: string) => Promise<void>
}

export const useEaLabStore = create<EaLabState>((set, get) => ({
  scripts: [],
  activeScriptId: null,
  draftCode: '',
  dirty: false,

  loadScripts: async () => {
    const scripts = (await eaScriptBridge()?.list()) ?? []
    set({ scripts })
    if (!get().activeScriptId && scripts.length > 0) {
      get().selectScript(scripts[0].id)
    }
  },

  createScript: async () => {
    const now = Date.now()
    const script: EaScript = {
      id: newId(),
      name: 'Untitled EA',
      code: STARTER_TEMPLATE,
      createdAt: now,
      updatedAt: now
    }
    const scripts = (await eaScriptBridge()?.save(script)) ?? [script, ...get().scripts]
    set({ scripts, activeScriptId: script.id, draftCode: script.code, dirty: false })
  },

  selectScript: (id) => {
    const script = get().scripts.find((s) => s.id === id)
    if (!script) return
    set({ activeScriptId: id, draftCode: script.code, dirty: false })
  },

  updateDraftCode: (code) => {
    set({ draftCode: code, dirty: true })
  },

  saveActiveScript: async () => {
    const { activeScriptId, scripts, draftCode } = get()
    const existing = scripts.find((s) => s.id === activeScriptId)
    if (!existing) return
    const next = { ...existing, code: draftCode, updatedAt: Date.now() }
    const updated = (await eaScriptBridge()?.save(next)) ?? [
      next,
      ...scripts.filter((s) => s.id !== next.id)
    ]
    set({ scripts: updated, dirty: false })
    notifySuccess(`${next.name} saved`)
  },

  renameScript: async (id, name) => {
    const existing = get().scripts.find((s) => s.id === id)
    if (!existing) return
    const next = { ...existing, name: name.trim() || 'Untitled EA', updatedAt: Date.now() }
    const scripts = (await eaScriptBridge()?.save(next)) ?? [
      next,
      ...get().scripts.filter((s) => s.id !== id)
    ]
    set({ scripts })
  },

  deleteScript: async (id) => {
    const scripts = (await eaScriptBridge()?.delete(id)) ?? get().scripts.filter((s) => s.id !== id)
    const { activeScriptId } = get()
    if (activeScriptId === id) {
      const next = scripts[0]
      set({
        scripts,
        activeScriptId: next?.id ?? null,
        draftCode: next?.code ?? '',
        dirty: false
      })
    } else {
      set({ scripts })
    }
    notifyInfo('EA script removed')
  }
}))
