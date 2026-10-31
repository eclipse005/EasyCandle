import { create } from 'zustand'
import { normalizeSymbolKey } from '@shared/pricePrecision'

const STORAGE_KEY = 'easy-candle:symbol-params'

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
}

type ParamsMap = Record<string, SymbolParams>

type SymbolParamsState = {
  params: ParamsMap
  paramsFor: (symbol: string) => SymbolParams
  setContractSize: (symbol: string, size: number | null) => void
  setPrecision: (symbol: string, precision: number | null) => void
  reset: () => void
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
    set((state) => {
      const current = state.params[key] ?? {}
      const next: SymbolParams = { ...current }
      if (size != null && Number.isFinite(size) && size > 0) {
        next.contractSize = size
      } else {
        delete next.contractSize
      }
      const map: ParamsMap = { ...state.params }
      if (Object.keys(next).length === 0) delete map[key]
      else map[key] = next
      persist(map)
      return { params: map }
    })
  },

  setPrecision(symbol, precision) {
    const key = normalizeSymbolKey(symbol)
    if (!key) return
    set((state) => {
      const current = state.params[key] ?? {}
      const next: SymbolParams = { ...current }
      if (precision != null && Number.isFinite(precision) && precision >= 0) {
        next.precision = Math.min(8, Math.round(precision))
      } else {
        delete next.precision
      }
      const map: ParamsMap = { ...state.params }
      if (Object.keys(next).length === 0) delete map[key]
      else map[key] = next
      persist(map)
      return { params: map }
    })
  },

  reset() {
    set({ params: {} })
    persist({})
  }
}))
