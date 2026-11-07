import type { DeskTheme } from '@shared/types'

export function applyDeskTheme(theme: DeskTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
}

export function readCssToken(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

export function chartSkin(): {
  background: string
  text: string
  grid: string
  bull: string
  bear: string
  brand: string
  warn: string
} {
  return {
    background: readCssToken('--ink', '#0b0d10'),
    text: readCssToken('--muted', '#9aa3ad'),
    grid: readCssToken('--rule', '#2f353d'),
    bull: readCssToken('--bull', '#3dd68c'),
    bear: readCssToken('--bear', '#f07167'),
    brand: readCssToken('--brand', '#f4f4f5'),
    warn: readCssToken('--warn', '#e0b35c')
  }
}
