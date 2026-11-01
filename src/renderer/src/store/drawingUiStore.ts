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
  /** Toolbar Lock: every drawing's `locked` flag. */
  drawingsLocked: boolean
  /** LCD selection (primary pane). */
  selectedIds: string[]
  /** Open the per-object Style/Text/Coordinates/Visibility dialog. */
  objectDialogId: string | null
  /** Bumped on every drawing-list change so React + auto-save can react. */
  revision: number
  canUndo: boolean
  canRedo: boolean
  setArmedTool: (kind: DrawingKind | null, glyph?: string) => void
  setMagnet: (mode: MagnetMode) => void
  toggleStayInDrawingMode: () => void
  setDrawingsVisible: (visible: boolean) => void
  setDrawingsLocked: (locked: boolean) => void
  setSelectedIds: (ids: readonly string[]) => void
  openObjectDialog: (id: string | null) => void
  bumpRevision: () => void
  undo: () => void
  redo: () => void
  refreshUndoRedo: () => void
  /** Clear the workspace + UI when a session closes or a new one opens. */
  resetWorkspace: () => void
}

function applyLockAll(locked: boolean): void {
  const mgr = bridge.getPrimary()
  if (!mgr) return
  for (const d of mgr.drawings()) {
    if (Boolean(d.locked) !== locked) mgr.update({ ...d, locked })
  }
}

export const useDrawingUiStore = create<DrawingUiState>((set, get) => ({
  armedTool: null,
  magnet: 'off',
  stayInDrawingMode: false,
  drawingsVisible: true,
  drawingsLocked: false,
  selectedIds: [],
  objectDialogId: null,
  revision: 0,
  canUndo: false,
  canRedo: false,

  setArmedTool(kind, glyph) {
    set({ armedTool: kind })
    const options = glyph ? { glyph } : undefined
    bridge.getPrimary()?.setTool(kind, options)
    bridge.getSecondary()?.setTool(kind, options)
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

  setDrawingsLocked(locked) {
    set({ drawingsLocked: locked })
    applyLockAll(locked)
    get().bumpRevision()
    get().refreshUndoRedo()
  },

  setSelectedIds(ids) {
    set({ selectedIds: [...ids] })
  },

  openObjectDialog(id) {
    set({ objectDialogId: id })
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
    set({
      armedTool: null,
      drawingsVisible: true,
      drawingsLocked: false,
      selectedIds: [],
      objectDialogId: null,
      canUndo: false,
      canRedo: false
    })
    bridge.resetWorkspace()
  }
}))
