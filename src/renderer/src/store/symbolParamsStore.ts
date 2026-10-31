import { create } from 'zustand'
import { normalizeSymbolKey } from '@shared/pricePrecision'
import { listAllCatalogSymbolIds } from '@shared/symbols'

const STORAGE_KEY = 'bar-replay:symbol-params'

/**
 * User-managed per-symbol parameters (managed from the Dashboard "Symbols"
 * tab). Values here are explicit user intent and take priority over the
 * name-derived defaults and the imported dataset metadata:
 *   user params > importMeta.contractSize > symbol-name default
 *
 * Catalog symbols are ensured on load so the Symbols page is never empty
 * before the first import; empty `{}` entries still mean "use name defaults".
 */
export type SymbolParams = {
  /** Units per 1.0 lot. */
  contractSize?: number
  /** Decimal digits for price display; null falls back to instrument defaults. */
  precision?: number
  /** Full bid–ask spread in price units (applied half on market entry and exit). */
  spread?: number
  /** Round-turn commission in quote currency per 1.0 lot (deducted on close). */
  commissionPerLot?: number
}

type ParamsMap = Record<string, SymbolParams>

type SymbolParamsState = {
  params: ParamsMap
  paramsFor: (symbol: string) => SymbolParams
  /** Ensure a symbol key exists in the map (no-op if already present). */
  ensureSymbol: (symbol: string, seed?: SymbolParams) => void
  /** Prefill every catalog id that is missing from the map. */
  ensureCatalogDefaults: () => void
  setContractSize: (symbol: string, size: number | null) => void
  setPrecision: (symbol: string, precision: number | null) => void
  setSpread: (symbol: string, spread: number | null) => void
  setCommissionPerLot: (symbol: string, commission: number | null) => void
  reset: () => void
}

function patchParams(
  state: { params: ParamsMap },
  key: string,
  mutate: (next: SymbolParams) => void
): { params: ParamsMap } {
  const current = state.params[key] ?? {}
  const next: SymbolParams = { ...current }
  mutate(next)
  const map: ParamsMap = { ...state.params }
  if (Object.keys(next).length === 0) delete map[key]
  else map[key] = next
  persist(map)
  return { params: map }
}

function loadPersisted(): ParamsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as ParamsMap
  } catch {
    return {}
  }
}

function persist(map: ParamsMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Seed catalog keys into a params map without overwriting user overrides.
 * Empty `{}` markers mean "present, use name-derived defaults in the UI".
 */
export function mergeCatalogDefaults(existing: ParamsMap): ParamsMap {
  const next: ParamsMap = { ...existing }
  let changed = false
  for (const id of listAllCatalogSymbolIds()) {
    const key = normalizeSymbolKey(id)
    if (!key || Object.prototype.hasOwnProperty.call(next, key)) continue
    next[key] = {}
    changed = true
  }
  return changed ? next : existing
}

export const useSymbolParamsStore = create<SymbolParamsState>((set, get) => ({
  params: mergeCatalogDefaults(loadPersisted()),

  paramsFor(symbol) {
    const key = normalizeSymbolKey(symbol)
    return (key && get().params[key]) || {}
  },

  ensureSymbol(symbol, seed) {
    const key = normalizeSymbolKey(symbol)
    if (!key) return
    const current = get().params
    if (Object.prototype.hasOwnProperty.call(current, key)) {
      if (!seed || Object.keys(seed).length === 0) return
      // Only fill missing fields from seed — never overwrite user values.
      const existing = current[key] ?? {}
      const merged: SymbolParams = { ...seed, ...existing }
      if (JSON.stringify(merged) === JSON.stringify(existing)) return
      const map = { ...current, [key]: merged }
      persist(map)
      set({ params: map })
      return
    }
    const entry: SymbolParams = seed ? { ...seed } : {}
    // Empty means "use name-derived defaults" in the Symbols editors.
    const map = { ...current, [key]: entry }
    persist(map)
    set({ params: map })
  },

  ensureCatalogDefaults() {
    const merged = mergeCatalogDefaults(get().params)
    if (merged === get().params) return
    persist(merged)
    set({ params: merged })
  },

  setContractSize(symbol, size) {
    const key = normalizeSymbolKey(symbol)
    if (!key) return
    set((state) =>
      patchParams(state, key, (next) => {
        if (size != null && Number.isFinite(size) && size > 0) {
          next.contractSize = size
        } else {
          delete next.contractSize
        }
      })
    )
  },

  setPrecision(symbol, precision) {
    const key = normalizeSymbolKey(symbol)
    if (!key) return
    set((state) =>
      patchParams(state, key, (next) => {
        if (precision != null && Number.isFinite(precision) && precision >= 0) {
          next.precision = Math.min(8, Math.round(precision))
        } else {
          delete next.precision
        }
      })
    )
  },

  setSpread(symbol, spread) {
    const key = normalizeSymbolKey(symbol)
    if (!key) return
    set((state) =>
      patchParams(state, key, (next) => {
        if (spread != null && Number.isFinite(spread) && spread >= 0) {
          next.spread = spread
        } else {
          delete next.spread
        }
      })
    )
  },

  setCommissionPerLot(symbol, commission) {
    const key = normalizeSymbolKey(symbol)
    if (!key) return
    set((state) =>
      patchParams(state, key, (next) => {
        if (commission != null && Number.isFinite(commission) && commission >= 0) {
          next.commissionPerLot = commission
        } else {
          delete next.commissionPerLot
        }
      })
    )
  },

  reset() {
    const catalog = mergeCatalogDefaults({})
    set({ params: catalog })
    persist(catalog)
  }
}))

// Prefill catalog markers once on module load (browser only).
if (typeof window !== 'undefined') {
  try {
    useSymbolParamsStore.getState().ensureCatalogDefaults()
  } catch {
    /* ignore */
  }
}
