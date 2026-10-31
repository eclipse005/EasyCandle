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
    totalPnl
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

/** Flatten closed trades across sessions for the Trades table. */
export type AggregatedTradeRow = ClosedTrade & {
  sessionId: string
  sessionName: string
  symbol: string
}

export function aggregateClosedTrades(sessions: Session[]): AggregatedTradeRow[] {
  const rows: AggregatedTradeRow[] = []
  for (const session of Array.isArray(sessions) ? sessions : []) {
    for (const trade of session.closedTrades ?? []) {
      rows.push({
        ...trade,
        sessionId: session.id,
        sessionName: session.name,
        symbol: session.symbol
      })
    }
  }
  rows.sort((a, b) => b.exitTime - a.exitTime)
  return rows
}
