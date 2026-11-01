import { create } from 'zustand'
import { setDefaultStyleOverride, type DrawingStyle } from 'lightweight-charts-drawing'
import { cloneStyle } from '@/lib/drawings/drawingProperties'

const STORAGE_KEY = 'bar-replay:lcd-drawing-templates'
const NAME_MAX = 48

export type LcdTemplate = {
  id: string
  name: string
  savedAt: number
  style: DrawingStyle
}

type Persisted = {
  templates: Record<string, LcdTemplate[]>
  defaults: Record<string, DrawingStyle>
}

type DrawingTemplateState = Persisted & {
  saveTemplate: (kind: string, name: string, style: DrawingStyle) => boolean
  deleteTemplate: (kind: string, id: string) => void
  setKindDefault: (kind: string, style: DrawingStyle | null) => void
}

function newId(): string {
  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function isStyle(value: unknown): value is DrawingStyle {
  if (!value || typeof value !== 'object') return false
  const style = value as Partial<DrawingStyle>
  return typeof style.color === 'string' && typeof style.width === 'number'
}

function sanitizeTemplates(raw: unknown): Record<string, LcdTemplate[]> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, LcdTemplate[]> = {}
  for (const [kind, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue
    const templates: LcdTemplate[] = []
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const row = item as Partial<LcdTemplate>
      if (typeof row.id !== 'string' || typeof row.name !== 'string' || !isStyle(row.style)) continue
      templates.push({
        id: row.id,
        name: row.name.slice(0, NAME_MAX),
        savedAt: typeof row.savedAt === 'number' ? row.savedAt : 0,
        style: cloneStyle(row.style)
      })
    }
    if (templates.length > 0) out[kind] = templates
  }
  return out
}

function sanitizeDefaults(raw: unknown): Record<string, DrawingStyle> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, DrawingStyle> = {}
  for (const [kind, style] of Object.entries(raw as Record<string, unknown>)) {
    if (isStyle(style)) out[kind] = cloneStyle(style)
  }
  return out
}

function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { templates: {}, defaults: {} }
    const parsed = JSON.parse(raw) as Partial<Persisted>
    return {
      templates: sanitizeTemplates(parsed.templates),
      defaults: sanitizeDefaults(parsed.defaults)
    }
  } catch {
    return { templates: {}, defaults: {} }
  }
}

function persist(state: Persisted): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ templates: state.templates, defaults: state.defaults })
    )
  } catch {
    /* ignore quota */
  }
}

const initial = loadPersisted()

export const useDrawingTemplateStore = create<DrawingTemplateState>((set, get) => ({
  templates: initial.templates,
  defaults: initial.defaults,
  saveTemplate(kind, name, style) {
    const trimmed = name.trim().slice(0, NAME_MAX)
    if (!kind || !trimmed || !isStyle(style)) return false
    const current = get().templates[kind] ?? []
    const existing = current.find((item) => item.name.toLowerCase() === trimmed.toLowerCase())
    const next: LcdTemplate = {
      id: existing?.id ?? newId(),
      name: trimmed,
      savedAt: Date.now(),
      style: cloneStyle(style)
    }
    const templates = {
      ...get().templates,
      [kind]: existing
        ? current.map((item) => (item.id === existing.id ? next : item))
        : [...current, next]
    }
    set({ templates })
    persist(get())
    return true
  },
  deleteTemplate(kind, id) {
    const current = get().templates[kind] ?? []
    const next = current.filter((item) => item.id !== id)
    if (next.length === current.length) return
    const templates = { ...get().templates, [kind]: next }
    set({ templates })
    persist(get())
  },
  setKindDefault(kind, style) {
    const defaults = { ...get().defaults }
    if (style && isStyle(style)) defaults[kind] = cloneStyle(style)
    else delete defaults[kind]
    set({ defaults })
    persist(get())
  }
}))

setDefaultStyleOverride((kind) => {
  const style = useDrawingTemplateStore.getState().defaults[kind]
  return style ? cloneStyle(style) : undefined
})

export function hasKindDefault(kind: string): boolean {
  return useDrawingTemplateStore.getState().defaults[kind] != null
}
