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
 * - Escape → disarm tool / close object dialog / exit chart fullscreen ONLY.
 *   NEVER leaves or closes the trading session (no closeActiveSession / exitReplay).
 * - Delete / Backspace → delete the selected LCD (or legacy) drawing
 * - Ctrl/Cmd+C / D / V → copy / clone / paste drawing
 */
export function useUiHotkeys(): void {
  const toggleChartFullscreen = useUiLayoutStore((s) => s.toggleChartFullscreen)
  const setChartFullscreen = useUiLayoutStore((s) => s.setChartFullscreen)
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
        // Hard rule: Esc never closes the session. Only disarm / dismiss chrome.
        event.preventDefault()
        event.stopPropagation()

        const state = useReplayStore.getState()
        if (state.pricePick) {
          state.setPricePick(null)
          return
        }

        const ui = useDrawingUiStore.getState()
        if (ui.objectDialogId) {
          ui.openObjectDialog(null)
          return
        }
        if (ui.objectTreeOpen) {
          ui.setObjectTreeOpen(false)
          return
        }
        if (ui.armedTool != null) {
          ui.setArmedTool(null)
          return
        }
        if (state.pendingTrend || state.pendingTrendEnd || state.drawTool !== 'select') {
          setDrawTool('select')
          return
        }
        if (state.selectedDrawingId != null) {
          state.selectDrawing(null)
          return
        }
        if (ui.selectedIds.length > 0) {
          ui.setSelectedIds([])
          return
        }

        // Last: leave chart-only fullscreen chrome (still inside the session).
        if (useUiLayoutStore.getState().chartFullscreen) {
          setChartFullscreen(false)
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
  }, [toggleChartFullscreen, setChartFullscreen, toggleInvertScale, setDrawTool, deleteDrawing])
}
