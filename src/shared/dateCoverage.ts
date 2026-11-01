/**
 * Day-level coverage helpers for the symbol-first data model.
 *
 * v1 approximates "days with any 1m bar" as the inclusive UTC day span of each
 * dataset's firstTime..lastTime (union across files). Weekends inside a span
 * may light up even without bars — scanning every candle is deferred.
 */

import type { ImportedDatasetMeta } from './importTypes'
import { normalizeSymbolKey } from './pricePrecision'

const DAY_SECONDS = 86_400

/** UTC calendar day `YYYY-MM-DD` for a unix-seconds timestamp. */
export function utcDayKey(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds)) return ''
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10)
}

/** Inclusive list of UTC day keys from first..last (capped). */
export function utcDaysInRange(firstTime: number, lastTime: number): string[] {
  if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime)) return []
  const start = Math.min(firstTime, lastTime)
  const end = Math.max(firstTime, lastTime)
  const startDay = Math.floor(start / DAY_SECONDS) * DAY_SECONDS
  const endDay = Math.floor(end / DAY_SECONDS) * DAY_SECONDS
  const out: string[] = []
  // Guard runaway ranges (e.g. corrupt meta) — ~40 years of days.
  const maxDays = 15_000
  for (let t = startDay, n = 0; t <= endDay && n < maxDays; t += DAY_SECONDS, n += 1) {
    out.push(utcDayKey(t))
  }
  return out
}

/** Union of lit UTC days across one or more dataset metas (1m span). */
export function coverageDaysFromMetas(metas: readonly ImportedDatasetMeta[]): Set<string> {
  const days = new Set<string>()
  for (const meta of metas) {
    const stats = meta.timeframes?.['1m']
    const first = stats?.firstTime ?? meta.firstTime
    const last = stats?.lastTime ?? meta.lastTime
    for (const day of utcDaysInRange(first, last)) {
      if (day) days.add(day)
    }
  }
  return days
}

export type SymbolDatasetGroup = {
  symbol: string
  key: string
  files: ImportedDatasetMeta[]
  fileCount: number
  candleCount: number
  firstTime: number
  lastTime: number
  coverageDays: Set<string>
}

/** Group imported metas by normalized symbol (uppercase alnum). */
export function groupImportsBySymbol(
  imports: readonly ImportedDatasetMeta[]
): SymbolDatasetGroup[] {
  const map = new Map<string, ImportedDatasetMeta[]>()
  for (const meta of imports) {
    const key = normalizeSymbolKey(meta.symbol)
    if (!key) continue
    const list = map.get(key)
    if (list) list.push(meta)
    else map.set(key, [meta])
  }

  const groups: SymbolDatasetGroup[] = []
  for (const [key, files] of map) {
    const sorted = [...files].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    let candleCount = 0
    let firstTime = Number.POSITIVE_INFINITY
    let lastTime = 0
    for (const f of sorted) {
      candleCount += f.candleCount
      if (f.firstTime < firstTime) firstTime = f.firstTime
      if (f.lastTime > lastTime) lastTime = f.lastTime
    }
    groups.push({
      symbol: sorted[0]?.symbol ?? key,
      key,
      files: sorted,
      fileCount: sorted.length,
      candleCount,
      firstTime: Number.isFinite(firstTime) ? firstTime : 0,
      lastTime,
      coverageDays: coverageDaysFromMetas(sorted)
    })
  }

  return groups.sort((a, b) => (a.symbol < b.symbol ? -1 : 1))
}

/** Earliest lit day key, or '' when empty. */
export function earliestCoverageDay(days: Set<string> | ReadonlySet<string>): string {
  let min = ''
  for (const day of days) {
    if (!min || day < min) min = day
  }
  return min
}

/** Latest lit day key, or '' when empty. */
export function latestCoverageDay(days: Set<string> | ReadonlySet<string>): string {
  let max = ''
  for (const day of days) {
    if (!max || day > max) max = day
  }
  return max
}

/** Compact coverage span for triggers: `No coverage` | `YYYY-MM-DD` | `first → last`. */
export function coverageSpanLabel(days: Set<string> | ReadonlySet<string>): string {
  if (days.size === 0) return 'No coverage'
  const first = earliestCoverageDay(days)
  const last = latestCoverageDay(days)
  if (!first) return 'No coverage'
  if (first === last) return first
  return `${first} → ${last}`
}

/** True when `YYYY-MM-DD` is in the coverage set. */
export function isDayCovered(days: Set<string> | ReadonlySet<string>, dayKey: string): boolean {
  return days.has(dayKey)
}

export type CoveragePeriodIndex = {
  /** Calendar years that contain at least one covered day. */
  years: Set<number>
  /** `YYYY-MM` keys that contain at least one covered day. */
  months: Set<string>
}

/** Years and months that contain at least one covered UTC day. */
export function coveragePeriodIndex(days: ReadonlySet<string>): CoveragePeriodIndex {
  const years = new Set<number>()
  const months = new Set<string>()
  for (const day of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue
    years.add(Number(day.slice(0, 4)))
    months.add(day.slice(0, 7))
  }
  return { years, months }
}
