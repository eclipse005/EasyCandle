import {
  DrawingManager,
  type Drawing,
  type DrawingManagerOptions
} from 'lightweight-charts-drawing'
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import { roundPriceToPrecision } from '@shared/pricePrecision'
import type { Drawing as LegacyDrawing } from '@/lib/chart/drawingGeometry'

/**
 * Owns the DrawingManager instances (one per chart pane) plus the undo/redo
 * stacks for the gesture-level history. The managers are imperative objects
 * created by CandleChart; the React layer reads state changes through the
 * drawingUiStore revision counter.
 */

type PaneId = 'primary' | 'secondary'

const managers: Record<PaneId, DrawingManager | null> = { primary: null, secondary: null }

/** Undo/redo of drawing-state snapshots (lib exportJSON strings). */
const undoStack: string[] = []
const redoStack: string[] = []
let lastCommitted = '[]'
let syncing = false

/**
 * Decimals of the active market data. Drawing anchors are market prices, so
 * the bridge snaps them here before committing/saving — the display may pad
 * zeros but must never reveal pixel-derived digits.
 */
let priceSnapProvider: (() => number) | null = null

export function setDrawingPriceSnapProvider(provider: (() => number) | null): void {
  priceSnapProvider = provider
}

function snapPrecision(): number | null {
  const precision = priceSnapProvider?.()
  return precision != null && Number.isFinite(precision) ? precision : null
}

function snapPointPrices(
  points: Drawing['points'],
  precision: number
): Drawing['points'] | null {
  let changed = false
  const next = points.map((point) => {
    if (typeof point.price !== 'number' || !Number.isFinite(point.price)) return point
    const price = roundPriceToPrecision(point.price, precision)
    if (price === point.price) return point
    changed = true
    return { ...point, price }
  })
  return changed ? next : null
}

function normalizeJSON(json: string, precision: number): string {
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) return json
    let changed = false
    const next = parsed.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry
      const record = entry as { points?: Drawing['points'] }
      if (!Array.isArray(record.points)) return entry
      const points = snapPointPrices(record.points, precision)
      if (!points) return entry
      changed = true
      return { ...record, points }
    })
    return changed ? JSON.stringify(next) : json
  } catch {
    return json
  }
}

function normalizeManager(manager: DrawingManager): void {
  const precision = snapPrecision()
  if (precision == null || syncing) return
  const updates: Drawing[] = []
  for (const drawing of manager.drawings()) {
    const points = snapPointPrices(drawing.points, precision)
    if (points) updates.push({ ...drawing, points } as Drawing)
  }
  if (!updates.length) return
  syncing = true
  try {
    for (const drawing of updates) manager.update(drawing)
  } finally {
    syncing = false
  }
  // The normalized update was suppressed while syncing; push it to the peer pane.
  const peer = manager === managers.primary ? managers.secondary : null
  if (peer) {
    syncing = true
    try {
      peer.importJSON(manager.exportJSON())
    } finally {
      syncing = false
    }
  }
}

export const UNDO_LIMIT = 60

function pushUndo(snapshot: string): void {
  if (undoStack.length >= UNDO_LIMIT) undoStack.shift()
  undoStack.push(snapshot)
  redoStack.length = 0
}

export function attachPane(
  id: PaneId,
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  options?: DrawingManagerOptions
): DrawingManager {
  detachPane(id)
  const manager = new DrawingManager(chart, series, options)
  managers[id] = manager

  // New drawings are committed with pixel-derived prices; snap them once the
  // placement finishes (never mid-gesture).
  manager.on('add', () => {
    queueMicrotask(() => normalizeManager(manager))
  })

  manager.on('change', () => {
    const json = manager.exportJSON()
    // Undo/redo imports fire 'change' too; recording them would push the
    // restored snapshot onto the undo stack and clear the redo stack.
    if (!syncing && json !== lastCommitted) {
      pushUndo(lastCommitted)
      lastCommitted = json
    }
    // Mirror the primary pane's drawings into the secondary pane so both
    // panes always render the same set (time-anchored, TF-independent).
    if (!syncing) {
      syncing = true
      try {
        const other = managers[id === 'primary' ? 'secondary' : 'primary']
        if (other) other.importJSON(json)
      } finally {
        syncing = false
      }
    }
  })

  return manager
}

export function detachPane(id: PaneId): void {
  managers[id]?.destroy()
  managers[id] = null
}

export function detachAll(): void {
  detachPane('primary')
  detachPane('secondary')
}

export function getPane(id: PaneId): DrawingManager | null {
  return managers[id]
}

export function getPrimary(): DrawingManager | null {
  return managers.primary
}

export function getSecondary(): DrawingManager | null {
  return managers.secondary
}

/** Export the primary pane's drawings (source of truth for persistence). */
export function exportDrawings(): string {
  return managers.primary?.exportJSON() ?? '[]'
}

/** Last committed drawing JSON (kept in sync by the change listeners). */
export function lastJSON(): string {
  return lastCommitted
}

/** Import drawings into every attached pane (checked + migrated by the lib). */
export function importDrawings(json: string): number {
  const precision = snapPrecision()
  const normalized = precision == null ? json : normalizeJSON(json, precision)
  let loaded = 0
  syncing = true
  try {
    for (const manager of [managers.primary, managers.secondary]) {
      if (manager) loaded = manager.importJSON(normalized)
    }
  } finally {
    syncing = false
  }
  // No pane may be attached yet (dashboard → session load). Keep the pending
  // snapshot so the freshly mounted DrawingManager can restore it.
  lastCommitted = managers.primary?.exportJSON() ?? normalized
  return loaded
}

/** Reset the workspace (new session / session close): clears everything. */
export function resetWorkspace(): void {
  undoStack.length = 0
  redoStack.length = 0
  lastCommitted = '[]'
  syncing = true
  try {
    for (const manager of [managers.primary, managers.secondary]) {
      manager?.clear()
    }
  } finally {
    syncing = false
  }
}

/** Call on `gestureEnd` (drag / placement finished) to seal an undo step. */
export function commitGesture(): void {
  const primary = managers.primary
  if (!primary) return
  normalizeManager(primary)
  const json = primary.exportJSON()
  if (managers.secondary) {
    syncing = true
    try {
      managers.secondary.importJSON(json)
    } finally {
      syncing = false
    }
  }
  lastCommitted = json
}

export function undo(): boolean {
  const snapshot = undoStack.pop()
  if (snapshot == null) return false
  const current = managers.primary?.exportJSON() ?? '[]'
  redoStack.push(current)
  importDrawings(snapshot)
  return true
}

export function redo(): boolean {
  const snapshot = redoStack.pop()
  if (snapshot == null) return false
  const current = managers.primary?.exportJSON() ?? '[]'
  undoStack.push(current)
  importDrawings(snapshot)
  return true
}

export function canUndo(): boolean {
  return undoStack.length > 0
}

export function canRedo(): boolean {
  return redoStack.length > 0
}

/**
 * Migrate a legacy session drawing (the hand-built SVG era format) into a
 * lightweight-charts-drawing JSON entry. Returns null for sketches that have
 * no faithful mapping (legacy long/short planning sketches — real positions
 * live in the session's positions/closedTrades, not in drawings).
 */
export function legacyDrawingToLib(
  legacy: LegacyDrawing,
  fallbackTime: number
): Record<string, unknown> | null {
  const pt = (time: number, price: number) => ({ time, price })
  switch (legacy.type) {
    case 'hline':
      return {
        kind: 'horizontal-line',
        points: [pt(fallbackTime, legacy.price)]
      }
    case 'trendline':
      return {
        kind: 'trend-line',
        points: [pt(legacy.t1, legacy.p1), pt(legacy.t2, legacy.p2)]
      }
    case 'rect':
      return {
        kind: 'rectangle',
        points: [pt(legacy.t1, legacy.p1), pt(legacy.t2, legacy.p2)]
      }
    case 'fib':
      return {
        kind: 'fib-retracement',
        points: [pt(legacy.t1, legacy.p1), pt(legacy.t2, legacy.p2)]
      }
    case 'fibchannel':
      return {
        kind: 'fib-channel',
        points: [pt(legacy.t1, legacy.p1), pt(legacy.t2, legacy.p2), pt(legacy.t3, legacy.p3)]
      }
    default:
      // 'long' | 'short' planning sketches: dropped (engine positions live
      // in the session's positions/closedTrades collections).
      return null
  }
}

/** Convert a legacy drawing array into lib JSON (drops unmappable kinds). */
export function legacyDrawingsToJSON(
  legacy: readonly LegacyDrawing[],
  fallbackTime: number
): string {
  const entries: Record<string, unknown>[] = []
  for (const item of legacy) {
    const converted = legacyDrawingToLib(item, fallbackTime)
    if (converted) entries.push(converted)
  }
  return JSON.stringify(entries)
}

export type { Drawing }
