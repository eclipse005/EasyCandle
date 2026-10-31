import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSymbolParamsStore } from '@/store/symbolParamsStore'

const STORAGE_KEY = 'bar-replay:symbol-params'

function stubLocalStorage(store: Record<string, string>): void {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) =>
      Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    }
  })
}

let backing: Record<string, string>

beforeEach(() => {
  backing = {}
  stubLocalStorage(backing)
  useSymbolParamsStore.setState({ params: {} })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('symbolParamsStore', () => {
  it('starts empty and paramsFor falls back to an empty object', () => {
    expect(useSymbolParamsStore.getState().params).toEqual({})
    expect(useSymbolParamsStore.getState().paramsFor('EURUSD')).toEqual({})
  })

  it('normalizes the symbol key for storage and lookup', () => {
    useSymbolParamsStore.getState().setContractSize('eur/usd', 50000)
    expect(useSymbolParamsStore.getState().paramsFor('EURUSD').contractSize).toBe(50000)
    expect(JSON.parse(backing[STORAGE_KEY])).toEqual({
      EURUSD: { contractSize: 50000 }
    })
  })

  it('rejects non-positive contract sizes and clears with null', () => {
    const store = useSymbolParamsStore.getState()
    store.setContractSize('USDJPY', 0)
    expect(store.paramsFor('USDJPY').contractSize).toBeUndefined()
    store.setContractSize('USDJPY', 100000)
    expect(store.paramsFor('USDJPY').contractSize).toBe(100000)
    store.setContractSize('USDJPY', null)
    expect(store.paramsFor('USDJPY').contractSize).toBeUndefined()
    // Entry disappears entirely once all overrides are cleared.
    expect(useSymbolParamsStore.getState().params['USDJPY']).toBeUndefined()
  })

  it('keeps contractSize and precision overrides independent', () => {
    const store = useSymbolParamsStore.getState()
    store.setContractSize('XAUUSD', 1)
    store.setPrecision('XAUUSD', 2)
    const params = store.paramsFor('XAUUSD')
    expect(params.contractSize).toBe(1)
    expect(params.precision).toBe(2)
    store.setPrecision('XAUUSD', null)
    expect(store.paramsFor('XAUUSD')).toEqual({ contractSize: 1 })
  })

  it('persists to localStorage for the next load', () => {
    useSymbolParamsStore.getState().setPrecision('EURUSD', 4)
    expect(JSON.parse(backing[STORAGE_KEY]).EURUSD.precision).toBe(4)
  })

  it('stores spread and commission overrides', () => {
    const store = useSymbolParamsStore.getState()
    store.setSpread('EURUSD', 0.0002)
    store.setCommissionPerLot('EURUSD', 7)
    expect(store.paramsFor('EURUSD').spread).toBe(0.0002)
    expect(store.paramsFor('EURUSD').commissionPerLot).toBe(7)
    store.setSpread('EURUSD', null)
    expect(store.paramsFor('EURUSD').spread).toBeUndefined()
    expect(store.paramsFor('EURUSD').commissionPerLot).toBe(7)
  })
})
