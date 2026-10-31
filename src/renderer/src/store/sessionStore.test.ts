import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore, type Session } from '@/store/sessionStore'
import { useReplayStore } from '@/store/replayStore'

const STORAGE_KEY = 'bar-replay:sessions'

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

function seedReplayIn(replayStore: typeof useReplayStore, closedTrades?: Session['closedTrades']): void {
  replayStore.setState({
    symbol: 'BTCUSDT',
    timeframe: '15m',
    drawTool: 'select',
    pendingTrend: null,
    pendingTrendEnd: null,
    selectedDrawingId: null,
    positions: [],
    pendingOrders: [],
    selectedWorkingId: null,
    closedTrades: closedTrades ?? [],
    orderHistory: [],
    tradeMarkers: []
  })
}

function seedReplay(closedTrades?: Session['closedTrades']): void {
  seedReplayIn(useReplayStore, closedTrades)
}

function freshStore(): void {
  useSessionStore.setState({ sessions: [], activeSessionId: null })
  seedReplay()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createSession', () => {
  it('captures the current chart orders and empty drawings', () => {
    freshStore()
    seedReplay([
      {
        id: 't-1',
        side: 'long',
        entryPrice: 99,
        entryTime: 100,
        exitPrice: 102,
        exitTime: 200,
        lots: 1,
        pnl: 3,
        exitReason: 'tp',
        takeProfit: 102,
        stopLoss: 98
      }
    ])
    const id = useSessionStore.getState().createSession('  Morning Replay  ')
    const state = useSessionStore.getState()
    expect(id).not.toBeNull()
    expect(state.activeSessionId).toBe(id)
    const session = state.sessions.find((item) => item.id === id)
    expect(session?.name).toBe('Morning Replay')
    expect(session?.symbol).toBe('BTCUSDT')
    expect(session?.timeframe).toBe('15m')
    // No DrawingManager attached in tests → empty drawings.
    expect(session?.drawingsJSON).toBe('[]')
    expect(session?.closedTrades).toHaveLength(1)
    expect(session?.orderHistory).toEqual([])
    expect(session?.autoSave).toBe(true)
    expect(session?.startingBalance).toBe(100000)
    expect(session?.positions).toEqual([])
    expect(session?.pendingOrders).toEqual([])
  })

  it('captures canceled orders in order history', () => {
    freshStore()
    seedReplay()
    useReplayStore.setState({
      orderHistory: [
        {
          id: 'o-1',
          side: 'long',
          type: 'limit',
          status: 'canceled',
          price: 95,
          lots: 1,
          placedTime: 10,
          updateTime: 20,
          takeProfit: 110,
          stopLoss: 90
        }
      ]
    })
    const id = useSessionStore.getState().createSession('Canceled Limit')
    const session = useSessionStore.getState().sessions.find((item) => item.id === id)
    expect(session?.orderHistory).toHaveLength(1)
    expect(session?.orderHistory[0]).toMatchObject({ status: 'canceled', type: 'limit', price: 95 })
  })

  it('rejects blank names', () => {
    freshStore()
    expect(useSessionStore.getState().createSession('   ')).toBeNull()
    expect(useSessionStore.getState().sessions).toHaveLength(0)
  })

  it('persists the new session to localStorage', async () => {
    const store: Record<string, string> = {}
    stubLocalStorage(store)
    vi.resetModules()
    const mod = await import('@/store/sessionStore')
    seedReplay()
    const id = mod.useSessionStore.getState().createSession('Saved')
    const parsed = JSON.parse(store[STORAGE_KEY] ?? '{}') as { sessions: Session[] }
    expect(parsed.sessions).toHaveLength(1)
    expect(parsed.sessions[0].id).toBe(id)
  })
})

describe('renameSession', () => {
  it('renames a session with trimming', () => {
    freshStore()
    const id = useSessionStore.getState().createSession('Old Name')!
    useSessionStore.getState().renameSession(id, '  New Name  ')
    expect(useSessionStore.getState().sessions[0].name).toBe('New Name')
  })

  it('ignores blank renames', () => {
    freshStore()
    const id = useSessionStore.getState().createSession('Keep')!
    useSessionStore.getState().renameSession(id, '   ')
    expect(useSessionStore.getState().sessions[0].name).toBe('Keep')
  })
})

describe('deleteSession', () => {
  it('removes the session and clears the active id when it was active', () => {
    freshStore()
    const id = useSessionStore.getState().createSession('Gone')!
    useSessionStore.getState().deleteSession(id)
    expect(useSessionStore.getState().sessions).toHaveLength(0)
    expect(useSessionStore.getState().activeSessionId).toBeNull()
  })
})

describe('setSessionAutoSave', () => {
  it('toggles auto-save and persists it', async () => {
    const store: Record<string, string> = {}
    stubLocalStorage(store)
    vi.resetModules()
    const mod = await import('@/store/sessionStore')
    seedReplay()
    const id = mod.useSessionStore.getState().createSession('Toggle')!
    mod.useSessionStore.getState().setSessionAutoSave(id, false)
    expect(mod.useSessionStore.getState().sessions[0].autoSave).toBe(false)
    const parsed = JSON.parse(store[STORAGE_KEY] ?? '{}') as { sessions: Session[] }
    expect(parsed.sessions[0].autoSave).toBe(false)
  })
})

describe('saveActiveSession', () => {
  it('updates the active session with the latest chart state', () => {
    freshStore()
    useSessionStore.getState().createSession('Updating')
    expect(useSessionStore.getState().saveActiveSession()).toBe(true)
    expect(useSessionStore.getState().sessions[0].drawingsJSON).toBe('[]')
  })

  it('returns false without an active session', () => {
    freshStore()
    expect(useSessionStore.getState().saveActiveSession()).toBe(false)
  })
})

describe('loadSession', () => {
  it('restores orders onto the chart and sets it active', async () => {
    freshStore()
    seedReplay([
      {
        id: 't-9',
        side: 'short',
        entryPrice: 50,
        entryTime: 5,
        exitPrice: 48,
        exitTime: 8,
        lots: 2,
        pnl: 4,
        exitReason: 'sl',
        takeProfit: 45,
        stopLoss: 52
      }
    ])
    useReplayStore.setState({
      orderHistory: [
        {
          id: 'o-9',
          side: 'short',
          type: 'limit',
          status: 'canceled',
          price: 52,
          lots: 2,
          placedTime: 3,
          updateTime: 4,
          takeProfit: 45,
          stopLoss: 55
        }
      ]
    })
    const id = useSessionStore.getState().createSession('Load Me')!
    seedReplay()
    expect(await useSessionStore.getState().loadSession(id)).toBe(true)
    const chart = useReplayStore.getState()
    expect(chart.drawTool).toBe('select')
    expect(chart.closedTrades).toHaveLength(1)
    expect(chart.orderHistory).toHaveLength(1)
    expect(chart.orderHistory[0].status).toBe('canceled')
    expect(useSessionStore.getState().activeSessionId).toBe(id)
  })

  it('returns false for an unknown session', async () => {
    freshStore()
    expect(await useSessionStore.getState().loadSession('missing')).toBe(false)
  })
})

describe('auto-save', () => {
  it('writes chart edits into the active auto-saving session after debounce', async () => {
    vi.useFakeTimers()
    try {
      freshStore()
      const id = useSessionStore.getState().createSession('Auto')!
      seedReplay()
      vi.advanceTimersByTime(900)
      expect(useSessionStore.getState().sessions[0].drawingsJSON).toBe('[]')
      expect(useSessionStore.getState().activeSessionId).toBe(id)
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips auto-save when the active session has auto-save off', async () => {
    vi.useFakeTimers()
    try {
      freshStore()
      const id = useSessionStore.getState().createSession('Manual')!
      useSessionStore.getState().setSessionAutoSave(id, false)
      seedReplay()
      vi.advanceTimersByTime(900)
      expect(useSessionStore.getState().sessions[0].drawingsJSON).toBe('[]')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('legacy drawing migration', () => {
  it('converts old-format drawings into lib JSON on load', async () => {
    const store = {
      [STORAGE_KEY]: JSON.stringify({
        sessions: [
          {
            id: 's-1',
            name: 'Good',
            symbol: 'ETHUSDT',
            timeframe: '1h',
            createdAt: 1,
            updatedAt: 2,
            autoSave: false,
            replayTime: 42,
            drawings: [{ id: 'd-1', type: 'hline', price: 42 }],
            position: null,
            pendingOrder: null,
            closedTrades: [],
            orderHistory: [],
            tradeMarkers: []
          },
          { id: 's-2', name: '', drawings: [] },
          'garbage'
        ]
      })
    }
    stubLocalStorage(store)
    vi.resetModules()
    const mod = await import('@/store/sessionStore')
    const state = mod.useSessionStore.getState()
    expect(state.sessions).toHaveLength(1)
    expect(state.sessions[0].name).toBe('Good')
    const parsed = JSON.parse(state.sessions[0].drawingsJSON) as Array<Record<string, unknown>>
    expect(parsed).toHaveLength(1)
    expect(parsed[0].kind).toBe('horizontal-line')
    expect(state.activeSessionId).toBeNull()
  })

  it('drops legacy long/short planning sketches (they live in positions)', async () => {
    const store = {
      [STORAGE_KEY]: JSON.stringify({
        sessions: [
          {
            id: 's-1',
            name: 'Sketches',
            symbol: 'BTCUSDT',
            timeframe: '15m',
            createdAt: 1,
            updatedAt: 2,
            drawings: [
              { id: 'd-1', type: 'long', t: 10, entry: 100, target: 110, stop: 95, span: 6 },
              { id: 'd-2', type: 'trendline', t1: 1, p1: 2, t2: 3, p2: 4 }
            ],
            closedTrades: [],
            orderHistory: [],
            tradeMarkers: []
          }
        ]
      })
    }
    stubLocalStorage(store)
    vi.resetModules()
    const mod = await import('@/store/sessionStore')
    const parsed = JSON.parse(mod.useSessionStore.getState().sessions[0].drawingsJSON) as Array<{
      kind: string
    }>
    expect(parsed).toHaveLength(1)
    expect(parsed[0].kind).toBe('trend-line')
  })

  it('passes lib-format drawingsJSON through untouched', async () => {
    const libJson = JSON.stringify([
      { kind: 'trend-line', points: [{ time: 100, price: 1 }, { time: 200, price: 2 }] }
    ])
    const store = {
      [STORAGE_KEY]: JSON.stringify({
        sessions: [
          {
            id: 's-1',
            name: 'Lib',
            symbol: 'BTCUSDT',
            timeframe: '15m',
            createdAt: 1,
            updatedAt: 2,
            drawingsJSON: libJson,
            closedTrades: [],
            orderHistory: [],
            tradeMarkers: []
          }
        ]
      })
    }
    stubLocalStorage(store)
    vi.resetModules()
    const mod = await import('@/store/sessionStore')
    expect(mod.useSessionStore.getState().sessions[0].drawingsJSON).toBe(libJson)
  })
})
