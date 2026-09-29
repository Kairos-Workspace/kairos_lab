import { useEffect } from 'react'
import { SPEED_OPTIONS } from '@shared/types'
import { useAppStore } from '../store/useAppStore'

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target.tagName === 'TEXTAREA') return true
  if (target.tagName === 'SELECT') return true
  if (target.tagName === 'INPUT') {
    const type = (target as HTMLInputElement).type
    return (
      type === 'text' ||
      type === 'search' ||
      type === 'password' ||
      type === 'email' ||
      type === 'url' ||
      type === 'number' ||
      type === ''
    )
  }
  return false
}

export function useKeyboard(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const store = useAppStore.getState()
      if (store.screen !== 'workspace') {
        if (event.key === 'Escape') return
        return
      }

      // Space: toggle replay even when focus is on buttons / datetime controls.
      if (event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar') {
        if (isTextEntryTarget(target)) return
        event.preventDefault()
        store.togglePlay()
        return
      }

      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return
      }

      switch (event.key) {
        case 'ArrowRight':
          store.manualStep(event.shiftKey ? 10 : 1)
          break
        case 'ArrowLeft':
          store.manualStep(event.shiftKey ? -10 : -1)
          break
        case 'f':
        case 'F':
          store.toggleChartFull()
          break
        case 'Escape':
          if (store.chartFull) store.setChartFull(false)
          else if (store.activeTool) store.setActiveTool(null)
          else if (store.selectedDrawingId) store.selectDrawing(null)
          break
        case 'r':
        case 'R':
          store.resetReplay()
          break
        case 'Delete':
        case 'Backspace':
          if (store.selectedDrawingId) store.removeDrawing(store.selectedDrawingId)
          break
        case 'z':
        case 'Z':
          if (!(event.metaKey || event.ctrlKey)) break
          event.preventDefault()
          if (event.shiftKey) store.redoDrawing()
          else store.undoDrawing()
          break
        case 'y':
        case 'Y':
          if (!(event.metaKey || event.ctrlKey)) break
          event.preventDefault()
          store.redoDrawing()
          break
        case 't':
        case 'T':
          if (store.pendingSetup) store.takeSetup()
          break
        case 's':
        case 'S':
          if (store.pendingSetup) store.skipSetup()
          break
        case '+':
        case '=': {
          const idx = SPEED_OPTIONS.indexOf(store.speed as (typeof SPEED_OPTIONS)[number])
          store.setSpeed(SPEED_OPTIONS[Math.min(SPEED_OPTIONS.length - 1, idx + 1)] ?? store.speed)
          break
        }
        case '-':
        case '_': {
          const idx = SPEED_OPTIONS.indexOf(store.speed as (typeof SPEED_OPTIONS)[number])
          store.setSpeed(SPEED_OPTIONS[Math.max(0, idx - 1)] ?? store.speed)
          break
        }
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
