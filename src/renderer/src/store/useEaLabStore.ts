import { create } from 'zustand'
import { notifyError, notifyInfo, notifySuccess } from '@/lib/notify'
import type { EaScript } from '@shared/types'
import { desktop } from '../lib/desktop'
import { useEaChatStore } from './useEaChatStore'

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
  selectScript: (id: string) => Promise<void>
  updateDraftCode: (code: string) => void
  applyCodeToScript: (id: string, code: string, opts?: { quiet?: boolean }) => void
  saveActiveScript: (opts?: { quiet?: boolean }) => Promise<void>
  renameScript: (id: string, name: string) => Promise<void>
  deleteScript: (id: string) => Promise<void>
}

export const useEaLabStore = create<EaLabState>((set, get) => ({
  scripts: [],
  activeScriptId: null,
  draftCode: '',
  dirty: false,

  loadScripts: async () => {
    const listed = await eaScriptBridge()?.list()
    if (!listed) return
    const currentId = get().activeScriptId
    const stillThere = currentId !== null && listed.some((s) => s.id === currentId)
    if (stillThere) {
      set({ scripts: listed })
      return
    }
    const next = listed[0]
    set({
      scripts: listed,
      activeScriptId: next?.id ?? null,
      draftCode: next?.code ?? '',
      dirty: false
    })
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

  selectScript: async (id) => {
    const { activeScriptId, dirty } = get()
    if (id === activeScriptId) return
    // Never autosave a half-streamed AI draft: switching scripts while the
    // chat is still writing into the active one would otherwise persist a
    // truncated script as if the user had finished and saved it.
    if (activeScriptId && dirty && !useEaChatStore.getState().sending) {
      await get().saveActiveScript({ quiet: true })
    }
    const script = get().scripts.find((s) => s.id === id)
    if (!script) return
    set({ activeScriptId: id, draftCode: script.code, dirty: false })
  },

  updateDraftCode: (code) => {
    set({ draftCode: code, dirty: true })
  },

  applyCodeToScript: (id, code, opts) => {
    const { activeScriptId, scripts } = get()
    if (id === activeScriptId) {
      set({ draftCode: code, dirty: true })
      return
    }
    const existing = scripts.find((s) => s.id === id)
    if (!existing) {
      // `id` isn't the active script and no longer exists (e.g. deleted
      // while the AI was mid-stream writing to it) — there is nothing left
      // to apply this code to, so do nothing rather than dumping it into
      // whatever unrelated script happens to be open right now.
      return
    }
    const next = { ...existing, code, updatedAt: Date.now() }
    eaScriptBridge()
      ?.save(next)
      ?.catch((err) => notifyError(`Failed to save ${next.name}`, err))
    set({ scripts: scripts.map((s) => (s.id === id ? next : s)) })
    if (!opts?.quiet) notifySuccess(`Applied to ${next.name}`)
  },

  saveActiveScript: async (opts) => {
    const { activeScriptId, scripts, draftCode } = get()
    const existing = scripts.find((s) => s.id === activeScriptId)
    if (!existing) return
    const next = { ...existing, code: draftCode, updatedAt: Date.now() }
    // Every call site fires this without awaiting the result (the debounced
    // autosave, the unmount cleanup, the Ctrl+S handler), so a rejected save
    // must be caught here rather than relying on each caller to remember to.
    let updated: EaScript[]
    try {
      updated = (await eaScriptBridge()?.save(next)) ?? [next, ...scripts.filter((s) => s.id !== next.id)]
    } catch (err) {
      notifyError(`Failed to save ${next.name}`, err)
      return
    }
    set({ scripts: updated, dirty: false })
    if (!opts?.quiet) notifySuccess(`${next.name} saved`)
  },

  renameScript: async (id, name) => {
    const { scripts, activeScriptId, draftCode } = get()
    const existing = scripts.find((s) => s.id === id)
    if (!existing) return
    const nextName = name.trim() || 'Untitled EA'
    const code = id === activeScriptId ? draftCode : existing.code
    if (existing.name === nextName && existing.code === code) return
    const next = { ...existing, name: nextName, code, updatedAt: Date.now() }
    const listed = (await eaScriptBridge()?.save(next)) ?? [
      next,
      ...scripts.filter((s) => s.id !== id)
    ]
    set({ scripts: listed })
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
