import { TIMEFRAMES } from './timeframes'

/** US DST in UTC: 2nd Sunday of March 07:00 → 1st Sunday of November 06:00. */
const DST_START_UTC_HOUR = 7
const DST_END_UTC_HOUR = 6
const HOUR = 3600
const DAY = 86400

const EDT_OFFSET_SECONDS = 21 * HOUR
const EST_OFFSET_SECONDS = 22 * HOUR

/** TFs that bucket on the NY 17:00 forex close (fixed-step). Week/month use dedicated floors. */
export const FOREX_SESSION_TIMEFRAMES = ['4h', '6h', '1d'] as const

function nthUtcSunday(year: number, monthIndex: number, n: number): number {
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay()
  const firstSundayDate = firstWeekday === 0 ? 1 : 8 - firstWeekday
  const date = firstSundayDate + (n - 1) * 7
  return Date.UTC(year, monthIndex, date) / 1000
}

function isUsDst(timeSeconds: number): boolean {
  const year = new Date(timeSeconds * 1000).getUTCFullYear()
  const dstStart = nthUtcSunday(year, 2, 2) + DST_START_UTC_HOUR * HOUR
  const dstEnd = nthUtcSunday(year, 10, 1) + DST_END_UTC_HOUR * HOUR
  return timeSeconds >= dstStart && timeSeconds < dstEnd
}

/** Seconds after UTC midnight for the NY 17:00 forex close at `timeSeconds`. */
export function forexNyCloseOffsetSeconds(timeSeconds: number): number {
  return isUsDst(timeSeconds) ? EDT_OFFSET_SECONDS : EST_OFFSET_SECONDS
}

/**
 * Floor `timeSeconds` onto an interval grid shifted by `offsetSeconds`.
 * Offset `0` equals `Math.floor(t / step) * step`.
 */
export function floorToInterval(
  timeSeconds: number,
  intervalSeconds: number,
  offsetSeconds = 0
): number {
  const t = Math.floor(Number(timeSeconds))
  const step = Math.max(1, Math.floor(Number(intervalSeconds)) || 1)
  const off = Math.floor(Number(offsetSeconds)) || 0
  if (!Number.isFinite(t)) return 0
  return Math.floor((t - off) / step) * step + off
}

/**
 * Floor onto NY Sunday 17:00 → next Sunday 17:00 (forex week / TradingView coverage).
 * Uses the same NY-close offset as daily bars; session-calendar Sunday is week open.
 */
export function floorToForexWeekOpen(timeSeconds: number): number {
  const t = Math.floor(Number(timeSeconds))
  if (!Number.isFinite(t)) return 0
  const offset = forexNyCloseOffsetSeconds(t)
  const shifted = t - offset
  const dayIndex = Math.floor(shifted / DAY)
  // Epoch day 0 (1970-01-01) is Thursday → weekday 4 when Sun=0.
  const weekday = (((dayIndex % 7) + 7) % 7 + 4) % 7
  // Days since Sunday = weekday (Sun=0 … Sat=6).
  const weekStartDay = dayIndex - weekday
  const approx = weekStartDay * DAY
  const startOffset = forexNyCloseOffsetSeconds(approx + 12 * HOUR)
  return approx + startOffset
}

/**
 * Floor onto NY calendar-month open at NY 17:00.
 * Session dates share a month with their (t − NY-close-offset) UTC calendar month;
 * month open is the NY 17:00 that starts the 1st session day of that month.
 */
export function floorToForexMonthOpen(timeSeconds: number): number {
  const t = Math.floor(Number(timeSeconds))
  if (!Number.isFinite(t)) return 0
  const offset = forexNyCloseOffsetSeconds(t)
  const shifted = t - offset
  const d = new Date(shifted * 1000)
  const monthStartShifted = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000
  const startOffset = forexNyCloseOffsetSeconds(monthStartShifted + 12 * HOUR)
  return monthStartShifted + startOffset
}

/** Open of the forex month after the month that opens at `monthOpen`. */
export function nextForexMonthOpen(monthOpen: number): number {
  const open = Math.floor(Number(monthOpen))
  if (!Number.isFinite(open)) return 0
  const offset = forexNyCloseOffsetSeconds(open)
  const shifted = open - offset
  const d = new Date(shifted * 1000)
  const nextStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000
  return nextStart + forexNyCloseOffsetSeconds(nextStart + 12 * HOUR)
}

function intervalSeconds(timeframe: string): number {
  return TIMEFRAMES[timeframe]?.seconds ?? 60
}

/**
 * Candle open for any app timeframe (UTC grid, NY-close grid, or week/month).
 */
export function floorOpenForTimeframe(timeframe: string, timeSeconds: number): number {
  if (timeframe === '1w') return floorToForexWeekOpen(timeSeconds)
  if (timeframe === '1M') return floorToForexMonthOpen(timeSeconds)
  const step = intervalSeconds(timeframe)
  const offsetFn = importedForexSessionOffset(timeframe)
  if (offsetFn) return floorToInterval(timeSeconds, step, offsetFn(timeSeconds))
  return floorToInterval(timeSeconds, step, 0)
}

/** Last UTC second covered by the candle that opens at `openTime` for `timeframe`. */
export function coverEndForTimeframe(openTime: number, timeframe: string): number {
  const open = Math.floor(Number(openTime))
  if (!Number.isFinite(open)) return 0
  if (timeframe === '1w') return open + 7 * DAY - 1
  if (timeframe === '1M') return nextForexMonthOpen(open) - 1
  return open + intervalSeconds(timeframe) - 1
}

/**
 * True when `timeSeconds` sits in the forex week: Sunday 17:00 New York
 * inclusive through Friday 17:00 New York exclusive.
 * Dukascopy fills the closed gap with flat volume-0 bars; those are outside.
 */
export function isForexWeekSessionOpen(timeSeconds: number): boolean {
  const t = Math.floor(Number(timeSeconds))
  if (!Number.isFinite(t)) return false
  const weekOpen = floorToForexWeekOpen(t)
  return t >= weekOpen && t < weekOpen + 5 * DAY
}

/**
 * FX Replay Custom Settings defaults, New York wall clock.
 * Asian 19:00, London 02:00, New York 07:00, day open 17:00.
 * Friday 17:00 is the week close, so the next day open is Sunday 17:00.
 */
export const FXR_DAY_OPEN_NY_HOUR = 17
export const FXR_ASIAN_NY_HOUR = 19
export const FXR_LONDON_NY_HOUR = 2
export const FXR_NEW_YORK_NY_HOUR = 7

export type ForexGoToKind = 'dayOpen' | 'nextSession' | 'newYork' | 'asian' | 'london'

const GO_TO_SEARCH_DAYS = 8

/** Seconds to add to a New York civil timestamp (encoded with Date.UTC) to get UTC. */
function nyUtcOffsetSeconds(timeSeconds: number): number {
  return forexNyCloseOffsetSeconds(timeSeconds) - 17 * HOUR
}

function nyCivilToUtc(civilUtc: number): number {
  const offset = nyUtcOffsetSeconds(civilUtc)
  const utc = civilUtc + offset
  const corrected = nyUtcOffsetSeconds(utc)
  return corrected === offset ? utc : civilUtc + corrected
}

function nyCivilYmd(timeSeconds: number): { year: number; month: number; day: number } {
  const ny = new Date((timeSeconds - nyUtcOffsetSeconds(timeSeconds)) * 1000)
  return { year: ny.getUTCFullYear(), month: ny.getUTCMonth(), day: ny.getUTCDate() }
}

/**
 * Next New York wall-clock `hour:minute` strictly after `afterSeconds`
 * that `accept` allows. Defaults to an open forex-week instant, so Friday
 * 17:00 / 19:00 and the closed weekend are skipped.
 */
export function nextNyWallClock(
  afterSeconds: number,
  hour: number,
  minute = 0,
  accept: (timeSeconds: number) => boolean = isForexWeekSessionOpen
): number | null {
  const after = Math.floor(Number(afterSeconds))
  if (!Number.isFinite(after)) return null
  const start = nyCivilYmd(after)
  for (let day = 0; day <= GO_TO_SEARCH_DAYS; day++) {
    const civil = Date.UTC(start.year, start.month, start.day + day, hour, minute, 0) / 1000
    const utc = nyCivilToUtc(civil)
    if (utc > after && accept(utc)) return utc
  }
  return null
}

/** Next FX Replay go-to instant. Next Session is the soonest of Asian, London, and New York. */
export function nextForexGoTo(afterSeconds: number, kind: ForexGoToKind): number | null {
  if (kind === 'dayOpen') return nextNyWallClock(afterSeconds, FXR_DAY_OPEN_NY_HOUR)
  if (kind === 'asian') return nextNyWallClock(afterSeconds, FXR_ASIAN_NY_HOUR)
  if (kind === 'london') return nextNyWallClock(afterSeconds, FXR_LONDON_NY_HOUR)
  if (kind === 'newYork') return nextNyWallClock(afterSeconds, FXR_NEW_YORK_NY_HOUR)
  const candidates = [
    nextNyWallClock(afterSeconds, FXR_ASIAN_NY_HOUR),
    nextNyWallClock(afterSeconds, FXR_LONDON_NY_HOUR),
    nextNyWallClock(afterSeconds, FXR_NEW_YORK_NY_HOUR)
  ].filter((time): time is number => time != null)
  if (candidates.length === 0) return null
  return Math.min(...candidates)
}

/**
 * NY 17:00 open of the forex session day that contains `timeSeconds`.
 * Null on the closed weekend (Friday 17:00 New York through Sunday 17:00).
 */
export function forexSessionDayOpen(timeSeconds: number): number | null {
  const t = Math.floor(Number(timeSeconds))
  if (!Number.isFinite(t)) return null
  const open = floorToInterval(t, DAY, forexNyCloseOffsetSeconds(t))
  return isForexWeekSessionOpen(open) ? open : null
}

/** Drop bars outside the forex week. In-session flat bars (volume 0) stay. */
export function omitForexWeekendCandles<T extends { time: number }>(candles: readonly T[]): T[] {
  let closed = false
  for (const candle of candles) {
    if (!isForexWeekSessionOpen(candle.time)) {
      closed = true
      break
    }
  }
  if (!closed) return candles as T[]
  return candles.filter((candle) => isForexWeekSessionOpen(candle.time))
}

/** NY-close offset function for imported 4h/6h/1d; `undefined` for UTC / week / month. */
export function importedForexSessionOffset(timeframe: string): ((t: number) => number) | undefined {
  return (FOREX_SESSION_TIMEFRAMES as readonly string[]).includes(timeframe)
    ? forexNyCloseOffsetSeconds
    : undefined
}
