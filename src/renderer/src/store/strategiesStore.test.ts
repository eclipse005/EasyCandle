import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStrategiesStore } from '@/store/strategiesStore'

const STORAGE_KEY = 'bar-replay:strategies'

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
  useStrategiesStore.setState({ strategies: [] })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('strategiesStore', () => {
  it('adds a named strategy and persists it', () => {
    const created = useStrategiesStore.getState().add('ORB v2')
    expect(created).not.toBeNull()
    expect(useStrategiesStore.getState().strategies[0]?.name).toBe('ORB v2')
    expect(JSON.parse(backing[STORAGE_KEY]).strategies).toHaveLength(1)
  })

  it('trims names and rejects blank ones', () => {
    expect(useStrategiesStore.getState().add('   ')).toBeNull()
    expect(useStrategiesStore.getState().strategies).toHaveLength(0)
    const created = useStrategiesStore.getState().add('  Breakout  ')
    expect(created?.name).toBe('Breakout')
  })

  it('deduplicates case-insensitively by returning the existing entry', () => {
    const first = useStrategiesStore.getState().add('London Open')
    const second = useStrategiesStore.getState().add('london open')
    expect(second?.id).toBe(first?.id)
    expect(useStrategiesStore.getState().strategies).toHaveLength(1)
  })

  it('renames and removes', () => {
    const created = useStrategiesStore.getState().add('Old name')
    const id = created?.id ?? ''
    useStrategiesStore.getState().rename(id, 'New name')
    expect(useStrategiesStore.getState().strategies[0]?.name).toBe('New name')
    useStrategiesStore.getState().remove(id)
    expect(useStrategiesStore.getState().strategies).toHaveLength(0)
    expect(JSON.parse(backing[STORAGE_KEY]).strategies).toHaveLength(0)
  })
})
