import type { ClosedTrade } from '@/lib/paperTrade'
import { cumulativeRealizedPnl, equityCurve, sideReport, type EquityPoint } from '@/lib/paperTrade'
import type { Session } from '@/store/sessionStore'
import {
  DEFAULT_CHART_TIMEZONE,
  parseSessionParts,
  sessionDateTimeParts
} from '@/lib/chartTimezone'

/**
 * Fixed zone for Analytics / Trades date filters and monthly·daily buckets.
 * Matches FXR / chart default (America/New_York). Paper times are fixed — no
 * per-filter timezone switch.
 */
export const ANALYTICS_TIMEZONE = DEFAULT_CHART_TIMEZONE

/** `YYYY-MM-DD` From/To → inclusive unix-second bounds in {@link ANALYTICS_TIMEZONE}. */
export function analyticsDayBounds(
  from: string,
  to: string
): { fromSec: number | null; toSec: number | null } {
  const fromSec = from ? parseSessionParts(from, '00:00:00', ANALYTICS_TIMEZONE) : null
  const toSec = to ? parseSessionParts(to, '23:59:59', ANALYTICS_TIMEZONE) : null
  return {
    fromSec: fromSec != null && Number.isFinite(fromSec) ? fromSec : null,
    toSec: toSec != null && Number.isFinite(toSec) ? toSec : null
  }
}

/** Start of the current civil day in {@link ANALYTICS_TIMEZONE}, as unix seconds. */
export function analyticsTodayStartSec(nowMs = Date.now()): number {
  const p = sessionDateTimeParts(Math.floor(nowMs / 1000), ANALYTICS_TIMEZONE)
  if (!p) {
    const d = new Date(nowMs)
    d.setUTCHours(0, 0, 0, 0)
    return Math.floor(d.getTime() / 1000)
  }
  const date = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
  const sec = parseSessionParts(date, '00:00:00', ANALYTICS_TIMEZONE)
  return sec != null ? sec : Math.floor(nowMs / 1000)
}

function wallParts(unixSeconds: number) {
  return sessionDateTimeParts(unixSeconds, ANALYTICS_TIMEZONE)
}

function wallMonthKey(unixSeconds: number): string | null {
  const p = wallParts(unixSeconds)
  if (!p) return null
  return `${p.year}-${String(p.month).padStart(2, '0')}`
}

/** Civil weekday (Sun=0) for the wall-calendar day in {@link ANALYTICS_TIMEZONE}. */
function wallWeekday(unixSeconds: number): number | null {
  const p = wallParts(unixSeconds)
  if (!p) return null
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()
}

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
  const endParts = wallParts(Math.floor(endMs / 1000))
  const endYear = endParts?.year ?? new Date(endMs).getUTCFullYear()
  const endMonthIndex = (endParts?.month ?? new Date(endMs).getUTCMonth() + 1) - 1
  const buckets: PeriodBucket[] = []
  const index = new Map<string, number>()
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(endYear, endMonthIndex - i, 1))
    const year = d.getUTCFullYear()
    const m = d.getUTCMonth()
    const key = `${year}-${String(m + 1).padStart(2, '0')}`
    index.set(key, buckets.length)
    buckets.push({ key, label: MONTH_LABELS[m] ?? key, pnl: 0, tradeCount: 0 })
  }
  for (const t of list) {
    if (!Number.isFinite(t.exitTime) || !Number.isFinite(t.pnl)) continue
    const key = wallMonthKey(t.exitTime)
    if (!key) continue
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
    const dow = wallWeekday(t.exitTime)
    if (dow == null) continue
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
  const p = wallParts(Math.floor(now / 1000))
  if (!p) return now
  const date = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
  const sec = parseSessionParts(date, '00:00:00', ANALYTICS_TIMEZONE)
  return sec != null ? sec * 1000 : now
}

function startOfLocalWeek(now: number): number {
  const p = wallParts(Math.floor(now / 1000))
  if (!p) return now
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()
  // Monday-start week (FXR-ish)
  const diff = dow === 0 ? 6 : dow - 1
  const monday = new Date(Date.UTC(p.year, p.month - 1, p.day - diff))
  const date = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`
  const sec = parseSessionParts(date, '00:00:00', ANALYTICS_TIMEZONE)
  return sec != null ? sec * 1000 : now
}

function startOfLocalMonth(now: number): number {
  const p = wallParts(Math.floor(now / 1000))
  if (!p) return now
  const date = `${p.year}-${String(p.month).padStart(2, '0')}-01`
  const sec = parseSessionParts(date, '00:00:00', ANALYTICS_TIMEZONE)
  return sec != null ? sec * 1000 : now
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
