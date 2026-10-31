import { useEffect } from 'react'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { useChartSettingsStore } from '@/store/chartSettingsStore'
import { useDrawingUiStore } from '@/store/drawingUiStore'
import {
  cloneDrawing,
  copyDrawing,
  pasteDrawing,
  removeDrawing
} from '@/lib/drawings/drawingActions'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
}

/**
 * UI keyboard shortcuts (live + replay):
 * - F → toggle chart fullscreen
 * - Alt+I → toggle invert price scale
 * - Escape → cancel TP/SL chart pick, pending trend line, or return to select tool
 * - Delete / Backspace → delete the selected LCD (or legacy) drawing
 * - Ctrl/Cmd+C / D / V → copy / clone / paste drawing
 */
export function useUiHotkeys(): void {
  const toggleChartFullscreen = useUiLayoutStore((s) => s.toggleChartFullscreen)
  const toggleInvertScale = useChartSettingsStore((s) => s.toggleInvertScale)
  const setDrawTool = useReplayStore((s) => s.setDrawTool)
  const deleteDrawing = useReplayStore((s) => s.deleteDrawing)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (isEditableTarget(event.target)) return

      if (event.altKey && (event.key === 'i' || event.key === 'I')) {
        event.preventDefault()
        if (event.repeat) return
        toggleInvertScale()
        return
      }

      const mod = event.ctrlKey || event.metaKey
      if (mod && !event.altKey) {
        const key = event.key.toLowerCase()
        const selected = useDrawingUiStore.getState().selectedIds
        const id = selected[0]
        if (key === 'c' && id) {
          event.preventDefault()
          copyDrawing(id)
          return
        }
        if (key === 'd' && id) {
          event.preventDefault()
          cloneDrawing(id)
          return
        }
        if (key === 'v') {
          event.preventDefault()
          pasteDrawing()
          return
        }
        return
      }

      if (event.ctrlKey || event.metaKey || event.altKey) return

      if (event.key === 'Escape') {
        const state = useReplayStore.getState()
        if (state.pricePick) {
          event.preventDefault()
          state.setPricePick(null)
          return
        }
        if (state.pendingTrend || state.pendingTrendEnd || state.drawTool !== 'select') {
          event.preventDefault()
          setDrawTool('select')
        }
        const ui = useDrawingUiStore.getState()
        if (ui.armedTool != null) {
          event.preventDefault()
          ui.setArmedTool(null)
        }
        if (ui.objectDialogId) {
          event.preventDefault()
          ui.openObjectDialog(null)
        }
        return
      }

      if (event.repeat) return

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const lcdIds = useDrawingUiStore.getState().selectedIds
        if (lcdIds.length > 0) {
          event.preventDefault()
          for (const id of lcdIds) removeDrawing(id)
          return
        }
        const state = useReplayStore.getState()
        if (state.selectedDrawingId != null) {
          event.preventDefault()
          deleteDrawing(state.selectedDrawingId)
        }
        return
      }

      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        toggleChartFullscreen()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleChartFullscreen, toggleInvertScale, setDrawTool, deleteDrawing])
}
