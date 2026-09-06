import type { DeskTheme } from '@shared/types'

export function applyDeskTheme(theme: DeskTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
}

export function readCssToken(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

export function chartSkin(): { background: string; text: string; grid: string } {
  return {
    background: readCssToken('--ink', '#050507'),
    text: readCssToken('--muted', '#9b9bb0'),
    grid: readCssToken('--rule', '#2a2a3c')
  }
}
