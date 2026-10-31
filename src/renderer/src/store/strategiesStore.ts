import { create } from 'zustand'

const STORAGE_KEY = 'easy-candle:strategies'

export const STRATEGY_NAME_MAX_LENGTH = 48

/** A named trading strategy that backtesting sessions can be tagged with. */
export type Strategy = {
  id: string
  name: string
  createdAt: number
}

type StrategiesState = {
  strategies: Strategy[]
  add: (name: string) => Strategy | null
  rename: (id: string, name: string) => void
  remove: (id: string) => void
}

function loadPersisted(): Strategy[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return []
    const record = parsed as Record<string, unknown>
    if (!Array.isArray(record.strategies)) return []
    const out: Strategy[] = []
    for (const item of record.strategies) {
      if (!item || typeof item !== 'object') continue
      const rec = item as Record<string, unknown>
      if (typeof rec.id !== 'string' || typeof rec.name !== 'string' || !rec.name.trim()) continue
      out.push({
        id: rec.id,
        name: rec.name.slice(0, STRATEGY_NAME_MAX_LENGTH),
        createdAt: typeof rec.createdAt === 'number' ? rec.createdAt : Date.now()
      })
    }
    return out
  } catch {
    return []
  }
}

function persist(strategies: Strategy[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ strategies }))
  } catch {
    // ignore quota / private mode
  }
}

export const useStrategiesStore = create<StrategiesState>((set, get) => ({
  strategies: loadPersisted(),

  add(name) {
    const trimmed = name.trim().slice(0, STRATEGY_NAME_MAX_LENGTH)
    if (!trimmed) return null
    if (get().strategies.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      return get().strategies.find((s) => s.name.toLowerCase() === trimmed.toLowerCase()) ?? null
    }
    const strategy: Strategy = { id: crypto.randomUUID(), name: trimmed, createdAt: Date.now() }
    set((state) => ({ strategies: [...state.strategies, strategy] }))
    persist(get().strategies)
    return strategy
  },

  rename(id, name) {
    const trimmed = name.trim().slice(0, STRATEGY_NAME_MAX_LENGTH)
    if (!trimmed) return
    const strategies = get().strategies.map((s) => (s.id === id ? { ...s, name: trimmed } : s))
    set({ strategies })
    persist(strategies)
  },

  remove(id) {
    const strategies = get().strategies.filter((s) => s.id !== id)
    if (strategies.length === get().strategies.length) return
    set({ strategies })
    persist(strategies)
  }
}))
