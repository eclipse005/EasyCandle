import { useEffect } from 'react'
import { PriceScaleMode } from 'lightweight-charts'
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
 * - Alt+P → percent scale, Alt+L → logarithmic scale, Alt+R → reset price scale
 * - Escape → disarm tool / close object dialog / exit chart fullscreen ONLY.
 *   NEVER leaves or closes the trading session (no closeActiveSession / exitReplay).
 * - Delete / Backspace → delete the selected LCD (or legacy) drawing
 * - Ctrl/Cmd+Z / Shift+Ctrl/Cmd+Z / Ctrl+Y → undo / redo drawing edits
 * - Ctrl/Cmd+C / D / V → copy / clone / paste drawing
 */
export function useUiHotkeys(): void {
  const toggleChartFullscreen = useUiLayoutStore((s) => s.toggleChartFullscreen)
  const toggleInvertScale = useChartSettingsStore((s) => s.toggleInvertScale)
  const setPriceScale = useChartSettingsStore((s) => s.setPriceScale)
  const resetPriceScale = useChartSettingsStore((s) => s.resetPriceScale)
  const setDrawTool = useReplayStore((s) => s.setDrawTool)
  const deleteDrawing = useReplayStore((s) => s.deleteDrawing)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (isEditableTarget(event.target)) return

      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.repeat) {
        const key = event.key.toLowerCase()
        if (key === 'i') {
          event.preventDefault()
          toggleInvertScale()
          return
        }
        if (key === 'p') {
          event.preventDefault()
          const mode = useChartSettingsStore.getState().priceScale.mode
          setPriceScale({
            mode: mode === PriceScaleMode.Percentage ? PriceScaleMode.Normal : PriceScaleMode.Percentage
          })
          return
        }
        if (key === 'l') {
          event.preventDefault()
          const mode = useChartSettingsStore.getState().priceScale.mode
          setPriceScale({
            mode: mode === PriceScaleMode.Logarithmic ? PriceScaleMode.Normal : PriceScaleMode.Logarithmic
          })
          return
        }
        if (key === 'r') {
          event.preventDefault()
          resetPriceScale()
          return
        }
      }

      const mod = event.ctrlKey || event.metaKey
      if (mod && !event.altKey) {
        const key = event.key.toLowerCase()
        const ui = useDrawingUiStore.getState()
        const selected = ui.selectedIds
        const id = selected[0]
        if (key === 'z' && !event.shiftKey && ui.canUndo) {
          event.preventDefault()
          ui.undo()
          return
        }
        if (((key === 'z' && event.shiftKey) || key === 'y') && ui.canRedo) {
          event.preventDefault()
          ui.redo()
          return
        }
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
        if (state.rewindPick) {
          state.setRewindPick(false)
          return
        }

        const ui = useDrawingUiStore.getState()
        if (ui.objectDialogId) {
          ui.openObjectDialog(null)
          return
        }
        if (useUiLayoutStore.getState().rightDock === 'objects') {
          useUiLayoutStore.getState().setRightDock(null)
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

        // Last: leave browser fullscreen (still inside the session).
        if (useUiLayoutStore.getState().chartFullscreen) {
          toggleChartFullscreen()
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
  }, [toggleChartFullscreen, toggleInvertScale, setPriceScale, resetPriceScale, setDrawTool, deleteDrawing])
}
