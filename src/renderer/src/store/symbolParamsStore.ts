import { create } from 'zustand'
import { normalizeSymbolKey } from '@shared/pricePrecision'

const STORAGE_KEY = 'bar-replay:symbol-params'

/**
 * User-managed per-symbol parameters (managed from the Dashboard "Symbols"
 * tab). Values here are explicit user intent and take priority over the
 * name-derived defaults and the imported dataset metadata:
 *   user params > importMeta.contractSize > symbol-name default
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

export const useSymbolParamsStore = create<SymbolParamsState>((set, get) => ({
  params: loadPersisted(),

  paramsFor(symbol) {
    const key = normalizeSymbolKey(symbol)
    return (key && get().params[key]) || {}
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
    set({ params: {} })
    persist({})
  }
}))
