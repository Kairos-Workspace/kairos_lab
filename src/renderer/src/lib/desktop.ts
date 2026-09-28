import { DEFAULT_DESK_PREFS } from '@core/desk/prefs'
import type { DeskPrefs } from '@shared/types'

type DesktopApi = Window['quantify'] & {
  prefs?: Window['quantify']['prefs']
}

export function desktop(): DesktopApi | undefined {
  if (typeof window === 'undefined') return undefined
  const world = window as Window & { aureum?: DesktopApi; kairos?: DesktopApi }
  return world.kairos ?? world.quantify ?? world.aureum
}

export function requireDesktop(): DesktopApi {
  const api = desktop()
  if (!api) throw new Error(desktopMissingMessage())
  return api
}

export function inElectron(): boolean {
  if (typeof navigator === 'undefined') return false
  return navigator.userAgent.includes('Electron')
}

export function desktopMissingMessage(): string {
  return inElectron()
    ? 'Restart Kairos so it can reconnect to the local database.'
    : 'Open this app through Electron so the local database can connect.'
}

export async function loadDeskPrefs(): Promise<DeskPrefs> {
  const api = desktop()
  if (!api?.prefs) return { ...DEFAULT_DESK_PREFS }
  try {
    return await api.prefs.load()
  } catch {
    return { ...DEFAULT_DESK_PREFS }
  }
}
