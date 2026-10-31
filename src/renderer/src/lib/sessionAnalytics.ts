import type { ClosedTrade } from '@/lib/paperTrade'
import { cumulativeRealizedPnl, equityCurve, sideReport, type EquityPoint } from '@/lib/paperTrade'
import type { Session } from '@/store/sessionStore'

export type PeriodBucket = {
  key: string
  label: string
  pnl: number
  /** Closed trades that contributed to this bucket (incl. break-even). */
  tradeCount?: number
}

export type SessionAnalytics = {
  balance: number
  totalPnl: number
  winRate: number | null
  /** Avg win / |avg loss|; null when insufficient data. */
  riskReward: number | null
  equity: EquityPoint[]
  monthly: PeriodBucket[]
  daily: PeriodBucket[]
  monthPnl: number
  weekPnl: number
  dayPnl: number
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Analytics for one session's closed trades (FXR Sessions charts / chips). */
export function computeSessionAnalytics(
  session: Session | null | undefined,
  now = Date.now()
): SessionAnalytics {
  const starting =
    session && Number.isFinite(session.startingBalance) && session.startingBalance > 0
      ? session.startingBalance
      : 100000
  const trades = Array.isArray(session?.closedTrades) ? session!.closedTrades : []
  const totalPnl = cumulativeRealizedPnl(trades)
  const report = sideReport(trades)
  const equity = equityCurve(starting, trades)

  return {
    balance: starting + totalPnl,
    totalPnl,
    winRate: report.winRate,
    riskReward: averageRiskReward(trades),
    equity,
    monthly: monthlyPnlBuckets(trades, 6, now),
    daily: weekdayPnlBuckets(trades),
    monthPnl: periodPnl(trades, startOfLocalMonth(now), now),
    weekPnl: periodPnl(trades, startOfLocalWeek(now), now),
    dayPnl: periodPnl(trades, startOfLocalDay(now), now)
  }
}

/** Avg winner / |avg loser| from closed trades. */
export function averageRiskReward(trades: ClosedTrade[]): number | null {
  const list = Array.isArray(trades) ? trades : []
  let winSum = 0
  let winN = 0
  let lossSum = 0
  let lossN = 0
  for (const t of list) {
    if (!Number.isFinite(t.pnl)) continue
    if (t.pnl > 0) {
      winSum += t.pnl
      winN += 1
    } else if (t.pnl < 0) {
      lossSum += t.pnl
      lossN += 1
    }
  }
  if (winN === 0 || lossN === 0) return null
  const avgWin = winSum / winN
  const avgLoss = Math.abs(lossSum / lossN)
  if (!(avgLoss > 0)) return null
  return avgWin / avgLoss
}

export function monthlyPnlBuckets(
  trades: ClosedTrade[],
  count = 6,
  now = Date.now()
): PeriodBucket[] {
  const list = Array.isArray(trades) ? trades : []
  // Anchor to latest closed trade so historical replay months show bars
  // (Daily weekday buckets already include all trades regardless of calendar year).
  let endMs = now
  let latest = Number.NEGATIVE_INFINITY
  for (const t of list) {
    if (Number.isFinite(t.exitTime)) latest = Math.max(latest, t.exitTime * 1000)
  }
  if (Number.isFinite(latest) && latest > 0) endMs = latest
  const end = new Date(endMs)
  const buckets: PeriodBucket[] = []
  const index = new Map<string, number>()
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    index.set(key, buckets.length)
    buckets.push({ key, label: MONTH_LABELS[d.getMonth()] ?? key, pnl: 0, tradeCount: 0 })
  }
  for (const t of list) {
    if (!Number.isFinite(t.exitTime) || !Number.isFinite(t.pnl)) continue
    const d = new Date(t.exitTime * 1000)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const i = index.get(key)
    if (i == null) continue
    buckets[i].pnl += t.pnl
    buckets[i].tradeCount = (buckets[i].tradeCount ?? 0) + 1
  }
  return buckets
}

/** Aggregate PnL by weekday name (Sunday→Saturday), for Daily Performance bars. */
export function weekdayPnlBuckets(trades: ClosedTrade[]): PeriodBucket[] {
  const buckets: PeriodBucket[] = DOW_LABELS.map((label, i) => ({
    key: String(i),
    label,
    pnl: 0,
    tradeCount: 0
  }))
  for (const t of Array.isArray(trades) ? trades : []) {
    if (!Number.isFinite(t.exitTime) || !Number.isFinite(t.pnl)) continue
    const dow = new Date(t.exitTime * 1000).getDay()
    buckets[dow].pnl += t.pnl
    buckets[dow].tradeCount = (buckets[dow].tradeCount ?? 0) + 1
  }
  return buckets
}

function periodPnl(trades: ClosedTrade[], fromMs: number, toMs: number): number {
  let sum = 0
  for (const t of Array.isArray(trades) ? trades : []) {
    if (!Number.isFinite(t.exitTime) || !Number.isFinite(t.pnl)) continue
    const ms = t.exitTime * 1000
    if (ms >= fromMs && ms <= toMs) sum += t.pnl
  }
  return sum
}

function startOfLocalDay(now: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function startOfLocalWeek(now: number): number {
  const d = new Date(now)
  const day = d.getDay()
  // Monday-start week (FXR-ish)
  const diff = day === 0 ? 6 : day - 1
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - diff)
  return d.getTime()
}

function startOfLocalMonth(now: number): number {
  const d = new Date(now)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function formatRiskRewardRatio(rr: number | null): string {
  if (rr == null || !Number.isFinite(rr) || rr <= 0) return '—'
  const rounded = Math.round(rr * 100) / 100
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)}`
}

/** Calendar days left in the dataset from the current playhead (or start). */
export function daysRemaining(
  playheadSec: number | null | undefined,
  datasetLastSec: number | null | undefined,
  datasetFirstSec: number | null | undefined
): number | null {
  if (datasetLastSec == null || !Number.isFinite(datasetLastSec)) return null
  const from =
    playheadSec != null && Number.isFinite(playheadSec)
      ? playheadSec
      : datasetFirstSec != null && Number.isFinite(datasetFirstSec)
        ? datasetFirstSec
        : null
  if (from == null) return null
  const delta = datasetLastSec - from
  if (!(delta > 0)) return 0
  return Math.floor(delta / 86400)
}

export function formatShortDate(unixSec: number | null | undefined): string {
  if (unixSec == null || !Number.isFinite(unixSec)) return '—'
  const d = new Date(unixSec * 1000)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Average PnL per closed trade (expectancy). */
export function expectancy(trades: ClosedTrade[]): number | null {
  const list = Array.isArray(trades) ? trades.filter((t) => Number.isFinite(t.pnl)) : []
  if (list.length === 0) return null
  let sum = 0
  for (const t of list) sum += t.pnl
  return sum / list.length
}

/** Gross wins ÷ |gross losses|; null when no losses. */
export function profitFactor(trades: ClosedTrade[]): number | null {
  const list = Array.isArray(trades) ? trades : []
  let wins = 0
  let losses = 0
  for (const t of list) {
    if (!Number.isFinite(t.pnl)) continue
    if (t.pnl > 0) wins += t.pnl
    else if (t.pnl < 0) losses += t.pnl
  }
  if (!(losses < 0)) return null
  const absLoss = Math.abs(losses)
  if (!(absLoss > 0)) return null
  return wins / absLoss
}

export type DrawdownPoint = { index: number; equity: number; drawdown: number }

/** Equity + underwater drawdown from starting balance + closed trades (exit order). */
export function drawdownSeries(
  startingBalance: number,
  trades: ClosedTrade[]
): { points: DrawdownPoint[]; maxDrawdown: number; maxDrawdownPct: number | null } {
  const start =
    Number.isFinite(startingBalance) && startingBalance > 0 ? startingBalance : 100000
  const ordered = [...(Array.isArray(trades) ? trades : [])].sort(
    (a, b) => a.exitTime - b.exitTime || a.entryTime - b.entryTime
  )
  const points: DrawdownPoint[] = [{ index: 0, equity: start, drawdown: 0 }]
  let equity = start
  let peak = start
  let maxDd = 0
  ordered.forEach((t, i) => {
    if (!Number.isFinite(t.pnl)) return
    equity += t.pnl
    if (equity > peak) peak = equity
    const dd = peak - equity
    if (dd > maxDd) maxDd = dd
    points.push({ index: i + 1, equity, drawdown: dd })
  })
  return {
    points,
    maxDrawdown: maxDd,
    maxDrawdownPct: peak > 0 ? maxDd / peak : null
  }
}
