import { create } from 'zustand'
import type { DrawingKind } from 'lightweight-charts-drawing'
import * as bridge from '@/lib/drawings/drawingBridge'

export type MagnetMode = 'off' | 'weak' | 'strong'

type DrawingUiState = {
  /** The armed drawing tool (lib DrawingKind) or null for the select cursor. */
  armedTool: DrawingKind | null
  magnet: MagnetMode
  /** TV "Keep drawing": keep the tool armed after a placement. */
  stayInDrawingMode: boolean
  /** TV "Hide all drawings". */
  drawingsVisible: boolean
  /** Bumped on every drawing-list change so React + auto-save can react. */
  revision: number
  canUndo: boolean
  canRedo: boolean
  setArmedTool: (kind: DrawingKind | null) => void
  setMagnet: (mode: MagnetMode) => void
  toggleStayInDrawingMode: () => void
  setDrawingsVisible: (visible: boolean) => void
  bumpRevision: () => void
  undo: () => void
  redo: () => void
  refreshUndoRedo: () => void
  /** Clear the workspace + UI when a session closes or a new one opens. */
  resetWorkspace: () => void
}

export const useDrawingUiStore = create<DrawingUiState>((set, get) => ({
  armedTool: null,
  magnet: 'off',
  stayInDrawingMode: false,
  drawingsVisible: true,
  revision: 0,
  canUndo: false,
  canRedo: false,

  setArmedTool(kind) {
    set({ armedTool: kind })
    // Apply to both panes; the managers are attached once the chart renders.
    bridge.getPrimary()?.setTool(kind)
    bridge.getSecondary()?.setTool(kind)
  },

  setMagnet(mode) {
    set({ magnet: mode })
    bridge.getPrimary()?.setMagnet(mode)
    bridge.getSecondary()?.setMagnet(mode)
  },

  toggleStayInDrawingMode() {
    const next = !get().stayInDrawingMode
    set({ stayInDrawingMode: next })
    bridge.getPrimary()?.setStayInDrawingMode(next)
    bridge.getSecondary()?.setStayInDrawingMode(next)
  },

  setDrawingsVisible(visible) {
    set({ drawingsVisible: visible })
    bridge.getPrimary()?.setDrawingsVisible(visible)
    bridge.getSecondary()?.setDrawingsVisible(visible)
  },

  bumpRevision() {
    set((s) => ({ revision: s.revision + 1 }))
  },

  undo() {
    if (bridge.undo()) {
      get().refreshUndoRedo()
      get().bumpRevision()
    }
  },

  redo() {
    if (bridge.redo()) {
      get().refreshUndoRedo()
      get().bumpRevision()
    }
  },

  refreshUndoRedo() {
    set({ canUndo: bridge.canUndo(), canRedo: bridge.canRedo() })
  },

  resetWorkspace() {
    set({ armedTool: null, drawingsVisible: true, canUndo: false, canRedo: false })
    bridge.resetWorkspace()
  }
}))
