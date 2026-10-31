import { describe, expect, it } from 'vitest'
import type { Session } from '@/store/sessionStore'
import type { ClosedTrade } from '@/lib/paperTrade'
import {
  aggregateClosedTrades,
  computeLocalPerformance,
  formatDurationMs,
  formatWinRatePct
} from './localPerformance'

function trade(partial: Partial<ClosedTrade> & Pick<ClosedTrade, 'id' | 'pnl' | 'side'>): ClosedTrade {
  return {
    entryPrice: 1,
    entryTime: 100,
    exitPrice: 1.1,
    exitTime: 200,
    lots: 0.1,
    exitReason: 'manual',
    takeProfit: null,
    stopLoss: null,
    ...partial
  }
}

function session(partial: Partial<Session> & Pick<Session, 'id' | 'closedTrades'>): Session {
  return {
    name: 'S',
    symbol: 'EURUSD',
    timeframe: 'M5',
    createdAt: 0,
    updatedAt: 60_000,
    autoSave: true,
    drawingsJSON: '[]',
    positions: [],
    pendingOrders: [],
    orderHistory: [],
    tradeMarkers: [],
    mode: 'replay',
    replayTime: null,
    speed: 1,
    dataSource: 'imported',
    importId: 'imp',
    startingBalance: 100000,
    ...partial
  }
}

describe('localPerformance', () => {
  it('returns zeros for empty sessions', () => {
    const stats = computeLocalPerformance([])
    expect(stats.sessionCount).toBe(0)
    expect(stats.tradesTaken).toBe(0)
    expect(stats.winRate).toBeNull()
    expect(formatWinRatePct(stats.winRate)).toBe('0%')
  })

  it('aggregates wins, buys, and durations', () => {
    const sessions = [
      session({
        id: 'a',
        createdAt: 0,
        updatedAt: 19 * 60_000,
        closedTrades: [
          trade({ id: '1', side: 'long', pnl: 10, entryTime: 0, exitTime: 3600 }),
          trade({ id: '2', side: 'short', pnl: -5, entryTime: 100, exitTime: 7200 })
        ]
      })
    ]
    const stats = computeLocalPerformance(sessions)
    expect(stats.tradesTaken).toBe(2)
    expect(stats.wins).toBe(1)
    expect(stats.buyCount).toBe(1)
    expect(stats.sellCount).toBe(1)
    expect(stats.winRate).toBeCloseTo(0.5)
    expect(stats.historicalReplayedSec).toBe(7200)
    expect(formatDurationMs(stats.timeInvestedMs)).toBe('19 min')
    expect(stats.monthlyTimeInvested.length).toBe(4)
  })

  it('flattens closed trades newest-first', () => {
    const rows = aggregateClosedTrades([
      session({
        id: 'a',
        name: 'Alpha',
        closedTrades: [trade({ id: '1', side: 'long', pnl: 1, exitTime: 10 })]
      }),
      session({
        id: 'b',
        name: 'Beta',
        closedTrades: [trade({ id: '2', side: 'short', pnl: -1, exitTime: 20 })]
      })
    ])
    expect(rows.map((r) => r.id)).toEqual(['2', '1'])
    expect(rows[0].sessionName).toBe('Beta')
  })
})
