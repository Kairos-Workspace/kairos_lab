import { useEffect } from 'react'
import { SPEED_OPTIONS } from '@shared/types'
import { useAppStore } from '../store/useAppStore'

export function useKeyboard(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return
      }
      const store = useAppStore.getState()
      if (store.screen !== 'workspace') {
        if (event.key === 'Escape') return
        return
      }
      switch (event.key) {
        case ' ':
          event.preventDefault()
          store.togglePlay()
          break
        case 'ArrowRight':
          store.step(event.shiftKey ? 10 : 1)
          break
        case 'ArrowLeft':
          store.step(event.shiftKey ? -10 : -1)
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
