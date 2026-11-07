import { DEFAULT_DESK_PREFS } from '@core/desk/prefs'
import { PRODUCT_NAME } from '@shared/constants'
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

/** True when the UI is running inside the Kairos desktop shell. */
export function inDesktopApp(): boolean {
  return true
}

/** @deprecated Prefer inDesktopApp() */
export function inElectron(): boolean {
  return true
}

export function desktopMissingMessage(): string {
  return `Restart ${PRODUCT_NAME} so it can reconnect to the local database.`
}

/** Main process was restarted without IPC handlers (stale desktop session). */
export function isIpcHandlerMissing(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  return /no handler registered/i.test(msg)
}

export function ipcRestartMessage(feature = 'this feature'): string {
  return `Restart ${PRODUCT_NAME} fully (quit the app, then open it again) so ${feature} can connect.`
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
