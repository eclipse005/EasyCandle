import type { ClosedTrade } from '@/lib/paperTrade'
import { cumulativeRealizedPnl, sideReport } from '@/lib/paperTrade'
import type { Session } from '@/store/sessionStore'

export type LocalPerformance = {
  sessionCount: number
  tradesTaken: number
  wins: number
  losses: number
  winRate: number | null
  buyCount: number
  sellCount: number
  buyPct: number | null
  sellPct: number | null
  /** Wall-clock time spent with sessions open (ms), capped per session. */
  timeInvestedMs: number
  /** Sum of (last exit − first entry) across sessions that have trades (seconds). */
  historicalReplayedSec: number
  totalPnl: number
  /** Last N calendar months of time invested (ms), oldest→newest. */
  monthlyTimeInvested: { key: string; label: string; ms: number }[]
}

const MAX_SESSION_INVESTED_MS = 8 * 60 * 60 * 1000

export function computeLocalPerformance(sessions: Session[]): LocalPerformance {
  const list = Array.isArray(sessions) ? sessions : []
  let tradesTaken = 0
  let wins = 0
  let losses = 0
  let buyCount = 0
  let sellCount = 0
  let timeInvestedMs = 0
  let historicalReplayedSec = 0
  let totalPnl = 0

  for (const session of list) {
    const span = Math.max(0, (session.updatedAt ?? 0) - (session.createdAt ?? 0))
    timeInvestedMs += Math.min(span, MAX_SESSION_INVESTED_MS)

    const trades = Array.isArray(session.closedTrades) ? session.closedTrades : []
    tradesTaken += trades.length
    totalPnl += cumulativeRealizedPnl(trades)
    const report = sideReport(trades)
    wins += report.wins
    losses += report.losses
    for (const t of trades) {
      if (t.side === 'long') buyCount += 1
      else sellCount += 1
    }
    historicalReplayedSec += sessionHistoricalSpanSec(trades)
  }

  const decided = buyCount + sellCount
  return {
    sessionCount: list.length,
    tradesTaken,
    wins,
    losses,
    winRate: tradesTaken ? wins / tradesTaken : null,
    buyCount,
    sellCount,
    buyPct: decided ? buyCount / decided : null,
    sellPct: decided ? sellCount / decided : null,
    timeInvestedMs,
    historicalReplayedSec,
    totalPnl,
    monthlyTimeInvested: monthlyTimeInvestedBuckets(list)
  }
}

function sessionHistoricalSpanSec(trades: ClosedTrade[]): number {
  if (!trades.length) return 0
  let minEntry = Infinity
  let maxExit = -Infinity
  for (const t of trades) {
    if (Number.isFinite(t.entryTime)) minEntry = Math.min(minEntry, t.entryTime)
    if (Number.isFinite(t.exitTime)) maxExit = Math.max(maxExit, t.exitTime)
  }
  if (!Number.isFinite(minEntry) || !Number.isFinite(maxExit) || maxExit <= minEntry) return 0
  return maxExit - minEntry
}


const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Bucket session wall time into calendar months (by updatedAt), last `count` months. */
export function monthlyTimeInvestedBuckets(
  sessions: Session[],
  count = 4,
  now = Date.now()
): { key: string; label: string; ms: number }[] {
  const end = new Date(now)
  const buckets: { key: string; label: string; ms: number; year: number; month: number }[] = []
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1)
    const year = d.getFullYear()
    const month = d.getMonth()
    buckets.push({
      key: `${year}-${String(month + 1).padStart(2, '0')}`,
      label: MONTH_LABELS[month] ?? String(month + 1),
      ms: 0,
      year,
      month
    })
  }
  const index = new Map(buckets.map((b, i) => [b.key, i]))
  for (const session of Array.isArray(sessions) ? sessions : []) {
    const updated = session.updatedAt ?? 0
    if (!Number.isFinite(updated) || updated <= 0) continue
    const d = new Date(updated)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const i = index.get(key)
    if (i == null) continue
    const span = Math.max(0, (session.updatedAt ?? 0) - (session.createdAt ?? 0))
    buckets[i].ms += Math.min(span, MAX_SESSION_INVESTED_MS)
  }
  return buckets.map(({ key, label, ms }) => ({ key, label, ms }))
}

/** Format ms as "19 min" / "1d 17hr 58min" (FXR-ish). */
export function formatDurationMs(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000))
  if (totalMin < 60) return `${totalMin} min`
  const days = Math.floor(totalMin / (60 * 24))
  const hours = Math.floor((totalMin % (60 * 24)) / 60)
  const mins = totalMin % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}hr`)
  if (mins > 0 || parts.length === 0) parts.push(`${mins}min`)
  return parts.join(' ')
}

export function formatDurationSec(sec: number): string {
  return formatDurationMs(Math.max(0, sec) * 1000)
}

export function formatWinRatePct(rate: number | null): string {
  if (rate == null || !Number.isFinite(rate)) return '0%'
  return `${(rate * 100).toFixed(2)}%`
}

export function formatPct(rate: number | null): string {
  if (rate == null || !Number.isFinite(rate)) return '0%'
  return `${(rate * 100).toFixed(2)}%`
}

/** Working / closed trade row for the Testing → Trades table (FXR-ish). */
export type TradeRowStatus = 'open' | 'pending' | 'closed'

export type AggregatedTradeRow = {
  id: string
  sessionId: string
  sessionName: string
  symbol: string
  status: TradeRowStatus
  side: ClosedTrade['side']
  entryPrice: number
  entryTime: number
  exitPrice: number | null
  exitTime: number | null
  lots: number
  pnl: number | null
  exitReason: ClosedTrade['exitReason'] | null
  takeProfit: number | null
  stopLoss: number | null
  pendingKind?: ClosedTrade['pendingKind']
  note?: string
  commission?: number
}

/** Closed + open positions + pending orders across local sessions. */
export function aggregateTrades(sessions: Session[]): AggregatedTradeRow[] {
  const rows: AggregatedTradeRow[] = []
  for (const session of Array.isArray(sessions) ? sessions : []) {
    for (const trade of session.closedTrades ?? []) {
      rows.push({
        id: trade.id,
        sessionId: session.id,
        sessionName: session.name,
        symbol: session.symbol,
        status: 'closed',
        side: trade.side,
        entryPrice: trade.entryPrice,
        entryTime: trade.entryTime,
        exitPrice: trade.exitPrice,
        exitTime: trade.exitTime,
        lots: trade.lots,
        pnl: trade.pnl,
        exitReason: trade.exitReason,
        takeProfit: trade.takeProfit,
        stopLoss: trade.stopLoss,
        pendingKind: trade.pendingKind,
        note: trade.note,
        commission: trade.commission
      })
    }
    for (const pos of session.positions ?? []) {
      rows.push({
        id: pos.id,
        sessionId: session.id,
        sessionName: session.name,
        symbol: session.symbol,
        status: 'open',
        side: pos.side,
        entryPrice: pos.entryPrice,
        entryTime: pos.entryTime,
        exitPrice: null,
        exitTime: null,
        lots: pos.lots,
        pnl: null,
        exitReason: null,
        takeProfit: pos.takeProfit,
        stopLoss: pos.stopLoss,
        pendingKind: pos.pendingKind
      })
    }
    for (const pending of session.pendingOrders ?? []) {
      rows.push({
        id: pending.id,
        sessionId: session.id,
        sessionName: session.name,
        symbol: session.symbol,
        status: 'pending',
        side: pending.side,
        entryPrice: pending.price,
        entryTime: pending.placedTime,
        exitPrice: null,
        exitTime: null,
        lots: pending.lots,
        pnl: null,
        exitReason: null,
        takeProfit: pending.takeProfit,
        stopLoss: pending.stopLoss,
        pendingKind: pending.kind
      })
    }
  }
  rows.sort((a, b) => {
    const ta = a.exitTime ?? a.entryTime
    const tb = b.exitTime ?? b.entryTime
    return tb - ta
  })
  return rows
}

/** Closed trades only (newest exit first). */
export function aggregateClosedTrades(sessions: Session[]): AggregatedTradeRow[] {
  return aggregateTrades(sessions).filter((r) => r.status === 'closed')
}
