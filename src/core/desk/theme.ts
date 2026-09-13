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
    background: readCssToken('--ink', '#101317'),
    text: readCssToken('--muted', '#8c96a3'),
    grid: readCssToken('--rule', '#262d35'),
    bull: readCssToken('--bull', '#4cc98a'),
    bear: readCssToken('--bear', '#e2604a'),
    brand: readCssToken('--brand', '#e0a63e'),
    warn: readCssToken('--warn', '#c9863a')
  }
}
