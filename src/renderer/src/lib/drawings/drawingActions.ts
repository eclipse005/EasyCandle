import type { Drawing, DrawingStyle, NewDrawing } from 'lightweight-charts-drawing'
import * as bridge from '@/lib/drawings/drawingBridge'
import { useDrawingUiStore } from '@/store/drawingUiStore'

/** In-memory clipboard for Copy / Paste of a single LCD drawing (JSON without id). */
let clipboardJson: string | null = null

function primary() {
  return bridge.getPrimary()
}

function afterMutation(): void {
  const ui = useDrawingUiStore.getState()
  ui.bumpRevision()
  ui.refreshUndoRedo()
}

export function hasDrawingClipboard(): boolean {
  return clipboardJson != null
}

export function copyDrawing(id: string): boolean {
  const d = primary()?.get(id)
  if (!d) return false
  const { id: _id, ...rest } = d
  clipboardJson = JSON.stringify(rest)
  try {
    void navigator.clipboard.writeText(clipboardJson).catch(() => {})
  } catch {
    /* ignore */
  }
  return true
}

export function pasteDrawing(): string | null {
  const mgr = primary()
  if (!mgr || !clipboardJson) return null
  try {
    const raw = JSON.parse(clipboardJson) as NewDrawing
    const id = mgr.add(raw)
    afterMutation()
    mgr.select([id])
    return id
  } catch {
    return null
  }
}

export function cloneDrawing(id: string): string | null {
  const mgr = primary()
  const d = mgr?.get(id)
  if (!mgr || !d) return null
  const { id: _id, locked: _l, hidden: _h, ...rest } = d
  // Nudge price so the clone is visibly offset from the original.
  const points = ((rest as { points?: { time: unknown; price: number }[] }).points ?? []).map(
    (p) => ({
      ...p,
      price: typeof p.price === 'number' ? p.price * 1.0002 : p.price
    })
  )
  const idNew = mgr.add({ ...(rest as object), points } as NewDrawing)
  afterMutation()
  mgr.select([idNew])
  return idNew
}

export function removeDrawing(id: string): void {
  primary()?.remove(id)
  afterMutation()
}

export function setDrawingLocked(id: string, locked: boolean): void {
  const mgr = primary()
  const d = mgr?.get(id)
  if (!mgr || !d) return
  mgr.update({ ...d, locked })
  afterMutation()
}

export function setDrawingHidden(id: string, hidden: boolean): void {
  primary()?.setHidden(id, hidden)
  afterMutation()
}

export function bringDrawingToFront(id: string): void {
  primary()?.bringToFront(id)
  afterMutation()
}

export function sendDrawingToBack(id: string): void {
  primary()?.sendToBack(id)
  afterMutation()
}

export function patchDrawingStyle(id: string, stylePatch: Partial<DrawingStyle>): void {
  const mgr = primary()
  const d = mgr?.get(id)
  if (!mgr || !d) return
  mgr.update({ ...d, style: { ...d.style, ...stylePatch } })
  afterMutation()
}

export function patchDrawing(
  id: string,
  patch: Partial<Omit<Drawing, 'id' | 'kind'>> & {
    style?: Partial<DrawingStyle>
  }
): void {
  const mgr = primary()
  const d = mgr?.get(id)
  if (!mgr || !d) return
  const next = {
    ...d,
    ...patch,
    style: patch.style ? { ...d.style, ...patch.style } : d.style
  } as Drawing
  mgr.update(next)
  afterMutation()
}

export function lockAllDrawings(locked: boolean): void {
  const mgr = primary()
  if (!mgr) return
  for (const d of mgr.drawings()) {
    if (Boolean(d.locked) !== locked) mgr.update({ ...d, locked })
  }
  afterMutation()
}

export function clearAllDrawings(): void {
  primary()?.clear()
  bridge.getSecondary()?.clear()
  afterMutation()
}

export function getSelectedDrawing(): Drawing | undefined {
  const ids = useDrawingUiStore.getState().selectedIds
  if (ids.length === 0) return undefined
  return primary()?.get(ids[0])
}
