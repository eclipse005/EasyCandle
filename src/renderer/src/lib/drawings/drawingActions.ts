import {
  defaultStyleFor,
  factoryStyleFor,
  type Drawing,
  type DrawingStyle,
  type NewDrawing
} from 'lightweight-charts-drawing'
import * as bridge from '@/lib/drawings/drawingBridge'
import { cloneStyle, type DrawingSnapshot } from '@/lib/drawings/drawingProperties'
import {
  lcdDefaultsForKind,
  legacyFibLevelsForNewDrawing,
  stylePatchOnAdd,
  visibilityFromTimeframes
} from '@/lib/drawings/drawingStyleBridge'
import { hasKindDefault, useDrawingTemplateStore } from '@/store/drawingTemplateStore'
import { useDrawingSettingsStore } from '@/store/drawingSettingsStore'
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

export function setDrawingStyle(id: string, style: DrawingStyle): void {
  const mgr = primary()
  const d = mgr?.get(id)
  if (!mgr || !d) return
  mgr.update({ ...d, style: cloneStyle(style) })
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

function findDrawing(id: string): Drawing | undefined {
  return primary()?.get(id)
}

/** Apply left-bar defaults onto a freshly placed LCD drawing.
 *  A saved LCD kind default is already baked in by the library. Paste / clone
 *  keep their own style when the stroke no longer matches the factory.
 *  An untouched fib list leaves the library ladder in place. A customized
 *  list replaces it. */
export function applyToolDefaultsOnAdd(drawing: Drawing): void {
  const mgr = primary()
  if (!mgr) return
  try {
    const factory = defaultStyleFor(drawing.kind)
    const s = drawing.style
    const stroke = lcdDefaultsForKind(drawing.kind)
    const fallback = stroke?.color ?? s.color ?? factory.color ?? '#787b86'
    const levels = legacyFibLevelsForNewDrawing(
      drawing.kind,
      useDrawingSettingsStore.getState().fibLevels,
      factory.levels,
      fallback
    )
    const patch = stylePatchOnAdd({
      hasKindDefault: hasKindDefault(drawing.kind),
      stillFactoryStroke:
        s.color === factory.color && s.width === factory.width && s.lineStyle === factory.lineStyle,
      stroke,
      levels
    })
    if (!patch) return
    mgr.update({ ...drawing, style: { ...drawing.style, ...patch } })
  } catch {
    /* ignore */
  }
}

export function saveTemplateAs(drawingId: string, name: string): boolean {
  const d = findDrawing(drawingId)
  if (!d) return false
  const ok = useDrawingTemplateStore.getState().saveTemplate(d.kind, name, d.style)
  if (ok) afterMutation()
  return ok
}

export function applySavedTemplate(drawingId: string, presetId: string): boolean {
  const mgr = primary()
  const d = findDrawing(drawingId)
  if (!mgr || !d) return false
  const preset = (useDrawingTemplateStore.getState().templates[d.kind] ?? []).find(
    (item) => item.id === presetId
  )
  if (!preset) return false
  try {
    mgr.update({ ...d, style: cloneStyle(preset.style) })
    afterMutation()
    return true
  } catch {
    return false
  }
}

export function resetDrawingStyle(drawingId: string): boolean {
  const mgr = primary()
  const d = findDrawing(drawingId)
  if (!mgr || !d) return false
  try {
    mgr.update({ ...d, style: factoryStyleFor(d.kind) })
    afterMutation()
    return true
  } catch {
    return false
  }
}

export function restoreDrawingSnapshot(drawingId: string, snap: DrawingSnapshot): boolean {
  const mgr = primary()
  const d = findDrawing(drawingId)
  if (!mgr || !d) return false
  try {
    mgr.update({
      ...d,
      style: cloneStyle(snap.style),
      points: snap.points,
      name: snap.name,
      text: snap.text,
      locked: snap.locked,
      hidden: snap.hidden,
      visibility: snap.visibility
    } as Drawing)
    afterMutation()
    return true
  } catch {
    return false
  }
}

export function setDrawingVisibility(
  drawingId: string,
  enabledTimeframes: readonly string[]
): boolean {
  const mgr = primary()
  const d = findDrawing(drawingId)
  if (!mgr || !d) return false
  const visibility = visibilityFromTimeframes(enabledTimeframes)
  try {
    mgr.update({ ...d, visibility: visibility as never })
    afterMutation()
    return true
  } catch {
    return false
  }
}

export function listPresetsForDrawing(drawingId: string): Array<{ id: string; name: string }> {
  const d = findDrawing(drawingId)
  if (!d) return []
  return (useDrawingTemplateStore.getState().templates[d.kind] ?? []).map((preset) => ({
    id: preset.id,
    name: preset.name
  }))
}

export function listAllDrawings(): readonly Drawing[] {
  return primary()?.drawings() ?? []
}

