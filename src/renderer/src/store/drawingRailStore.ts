import { create } from 'zustand'
import { groupTools, type ToolGroup } from '@/lib/drawings/toolGroups'
import type { PanelPos } from '@/store/uiLayoutStore'

const STORAGE_KEY = 'bar-replay:drawing-rail'

type RailState = {
  favorites: string[]
  lastUsed: Record<string, string>
  favoritesPos: PanelPos | null
  toggleFavorite: (kind: string) => void
  remember: (groupId: string, kind: string) => void
  setFavoritesPos: (pos: PanelPos) => void
  isFavorite: (kind: string) => boolean
}

type Saved = { favorites?: string[]; lastUsed?: Record<string, string>; favoritesPos?: PanelPos }

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Saved
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function save(state: Pick<RailState, 'favorites' | 'lastUsed' | 'favoritesPos'>): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        favorites: state.favorites,
        lastUsed: state.lastUsed,
        favoritesPos: state.favoritesPos
      })
    )
  } catch {
    // ignore quota / private mode
  }
}

function validPos(value: unknown): PanelPos | null {
  if (!value || typeof value !== 'object') return null
  const pos = value as PanelPos
  return Number.isFinite(pos.x) && Number.isFinite(pos.y) ? { x: pos.x, y: pos.y } : null
}

const initial = load()

export function lastToolOf(group: ToolGroup, lastUsed: Record<string, string>): string {
  const saved = lastUsed[group.id]
  if (saved && groupTools(group).some((tool) => tool.kind === saved)) return saved
  return groupTools(group)[0]?.kind ?? 'trend-line'
}

export const useDrawingRailStore = create<RailState>((set, get) => ({
  favorites: Array.isArray(initial.favorites) ? initial.favorites.filter((kind) => typeof kind === 'string') : [],
  lastUsed: initial.lastUsed && typeof initial.lastUsed === 'object' ? initial.lastUsed : {},
  favoritesPos: validPos(initial.favoritesPos),

  toggleFavorite(kind) {
    const current = get().favorites
    const favorites = current.includes(kind) ? current.filter((id) => id !== kind) : [...current, kind]
    const next = { favorites, lastUsed: get().lastUsed, favoritesPos: get().favoritesPos }
    set(next)
    save(next)
  },

  remember(groupId, kind) {
    const lastUsed = { ...get().lastUsed, [groupId]: kind }
    const next = { favorites: get().favorites, lastUsed, favoritesPos: get().favoritesPos }
    set({ lastUsed })
    save(next)
  },

  setFavoritesPos(pos) {
    const next = { favorites: get().favorites, lastUsed: get().lastUsed, favoritesPos: pos }
    set({ favoritesPos: pos })
    save(next)
  },

  isFavorite(kind) {
    return get().favorites.includes(kind)
  }
}))

