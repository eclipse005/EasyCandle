import { describe, expect, it } from 'vitest'
import type { ClosedTrade } from '@/lib/paperTrade'
import type { Session } from '@/store/sessionStore'
import {
  ANALYTICS_TIMEZONE,
  analyticsDayBounds,
  averageRiskReward,
  computeSessionAnalytics,
  daysRemaining,
  drawdownSeries,
  expectancy,
  formatRiskRewardRatio,
  monthlyPnlBuckets,
  profitFactor,
  weekdayPnlBuckets
} from './sessionAnalytics'

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

describe('sessionAnalytics', () => {
  it('computes balance and empty charts with no trades', () => {
    const stats = computeSessionAnalytics(session({ id: 'a', closedTrades: [] }))
    expect(stats.balance).toBe(100000)
    expect(stats.totalPnl).toBe(0)
    expect(stats.winRate).toBeNull()
    expect(stats.riskReward).toBeNull()
    expect(stats.equity).toEqual([])
  })

  it('builds equity and RR from wins and losses', () => {
    const trades = [
      trade({ id: '1', side: 'long', pnl: 200, exitTime: 1_700_000_000 }),
      trade({ id: '2', side: 'short', pnl: -100, exitTime: 1_700_086_400 })
    ]
    const stats = computeSessionAnalytics(session({ id: 'a', closedTrades: trades }))
    expect(stats.totalPnl).toBe(100)
    expect(stats.balance).toBe(100100)
    expect(stats.winRate).toBeCloseTo(0.5)
    expect(stats.riskReward).toBeCloseTo(2)
    expect(formatRiskRewardRatio(stats.riskReward)).toBe('2')
    expect(stats.equity.length).toBeGreaterThanOrEqual(2)
  })

  it('buckets monthly and weekday pnl', () => {
    // Fixed timestamps: 2026-03-23 Monday UTC ~ and 2026-03-24 Tuesday
    const mon = Date.UTC(2026, 2, 23, 12) / 1000
    const tue = Date.UTC(2026, 2, 24, 12) / 1000
    const trades = [
      trade({ id: '1', side: 'long', pnl: 50, exitTime: mon }),
      trade({ id: '2', side: 'long', pnl: 25, exitTime: tue })
    ]
    const monthly = monthlyPnlBuckets(trades, 3, Date.UTC(2026, 2, 31))
    const mar = monthly.find((m) => m.label === 'Mar')
    expect(mar?.pnl).toBe(75)
    const daily = weekdayPnlBuckets(trades)
    expect(daily.find((d) => d.label === 'Monday')?.pnl).toBe(50)
    expect(daily.find((d) => d.label === 'Tuesday')?.pnl).toBe(25)
  })


  it('anchors monthly buckets to latest trade (historical replay)', () => {
    // Trades in March 2024; "now" is Oct 2026 — must still show Mar bars
    const mar2024 = Date.UTC(2024, 2, 15, 12) / 1000
    const trades = [trade({ id: '1', side: 'long', pnl: 40, exitTime: mar2024 })]
    const monthly = monthlyPnlBuckets(trades, 3, Date.UTC(2026, 9, 31))
    const mar = monthly.find((m) => m.label === 'Mar')
    expect(mar?.pnl).toBe(40)
    expect(mar?.tradeCount).toBe(1)
  })

  it('daysRemaining from playhead', () => {
    expect(daysRemaining(100, 100 + 3 * 86400, 0)).toBe(3)
    expect(daysRemaining(null, 200, 100)).toBe(0) // 100 sec span → 0 days
    expect(daysRemaining(null, 100 + 2.5 * 86400, 100)).toBe(2)
    expect(averageRiskReward([])).toBeNull()
  })
})


describe('analytics metrics', () => {
  it('computes expectancy and profit factor', () => {
    const trades = [
      trade({ id: '1', side: 'long', pnl: 100 }),
      trade({ id: '2', side: 'long', pnl: -50 }),
      trade({ id: '3', side: 'long', pnl: 0 })
    ]
    expect(expectancy(trades)).toBeCloseTo(50 / 3)
    expect(profitFactor(trades)).toBeCloseTo(2)
  })

  it('tracks max drawdown', () => {
    const trades = [
      trade({ id: '1', side: 'long', pnl: 100, exitTime: 10 }),
      trade({ id: '2', side: 'long', pnl: -40, exitTime: 20 }),
      trade({ id: '3', side: 'long', pnl: -30, exitTime: 30 })
    ]
    const dd = drawdownSeries(1000, trades)
    expect(dd.maxDrawdown).toBeCloseTo(70)
    expect(dd.points[dd.points.length - 1].equity).toBeCloseTo(1030)
  })
})


describe('analytics timezone (America/New_York default)', () => {
  it('defaults account analytics zone to New York', () => {
    expect(ANALYTICS_TIMEZONE).toBe('America/New_York')
  })

  it('day bounds use New York midnight, not browser local', () => {
    const { fromSec, toSec } = analyticsDayBounds('2024-07-15', '2024-07-15')
    // 2024-07-15 00:00 EDT = 04:00 UTC; 23:59:59 EDT = 03:59:59 UTC next day
    expect(fromSec).toBe(Date.UTC(2024, 6, 15, 4, 0, 0) / 1000)
    expect(toSec).toBe(Date.UTC(2024, 6, 16, 3, 59, 59) / 1000)
  })

  it('weekday buckets follow New York wall calendar across UTC midnight', () => {
    // Monday 2024-07-15 22:00 UTC = Monday 18:00 EDT
    const monEdt = Date.UTC(2024, 6, 15, 22, 0, 0) / 1000
    // Tuesday 2024-07-16 03:30 UTC = Monday 23:30 EDT (still Monday in NY)
    const stillMon = Date.UTC(2024, 6, 16, 3, 30, 0) / 1000
    // Tuesday 2024-07-16 05:00 UTC = Tuesday 01:00 EDT
    const tueEdt = Date.UTC(2024, 6, 16, 5, 0, 0) / 1000
    const trades = [
      trade({ id: '1', side: 'long', pnl: 10, exitTime: monEdt }),
      trade({ id: '2', side: 'long', pnl: 20, exitTime: stillMon }),
      trade({ id: '3', side: 'long', pnl: 5, exitTime: tueEdt })
    ]
    const daily = weekdayPnlBuckets(trades)
    expect(daily.find((d) => d.label === 'Monday')?.pnl).toBe(30)
    expect(daily.find((d) => d.label === 'Tuesday')?.pnl).toBe(5)
  })
})
