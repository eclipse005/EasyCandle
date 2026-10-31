import type { Candle } from './candleUtils'
import { isAccountTimezoneId } from './accountTimezoneIds'

/**
 * CSV timestamps are wall-clock strings from the broker/export.
 * The parser packs those walls via Date.UTC as *provisional* seconds only —
 * that is an intermediate encoding, not a product claim that the file is UTC.
 * Import Confirm must choose an explicit data timezone before save; save remaps
 * provisional seconds into true UTC unix for storage.
 */

/** Same curated whole-hour city list as Settings Account timezone. */
export function isCsvDataTimezone(id: string): boolean {
  return isAccountTimezoneId(id)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

type WallParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function partNumber(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  return Number(parts.find((part) => part.type === type)?.value)
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      hour12: false
    })
    formatters.set(timeZone, f)
  }
  return f
}

function wallPartsAt(unixSeconds: number, timeZone: string): WallParts | null {
  if (!Number.isFinite(unixSeconds)) return null
  const date = new Date(unixSeconds * 1000)
  if (Number.isNaN(date.getTime())) return null
  try {
    const parts = formatter(timeZone).formatToParts(date)
    const hour = partNumber(parts, 'hour')
    const result: WallParts = {
      year: partNumber(parts, 'year'),
      month: partNumber(parts, 'month'),
      day: partNumber(parts, 'day'),
      hour: hour === 24 ? 0 : hour,
      minute: partNumber(parts, 'minute'),
      second: partNumber(parts, 'second')
    }
    if (
      ![result.year, result.month, result.day, result.hour, result.minute, result.second].every(
        Number.isFinite
      )
    ) {
      return null
    }
    return result
  } catch {
    return null
  }
}

function offsetSecondsAt(unixSeconds: number, timeZone: string): number {
  const parts = wallPartsAt(unixSeconds, timeZone)
  if (!parts) return 0
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
  return Math.round((asUtc - unixSeconds * 1000) / 1000)
}

/** Wall clock `YYYY-MM-DD` + `HH:mm:ss` in `timeZone` → true UTC unix seconds. */
export function wallClockToUnixSeconds(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): number | null {
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null
  if (timeZone === 'UTC' || timeZone === 'Etc/UTC') {
    const ms = Date.UTC(year, month - 1, day, hour, minute, second)
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
  }
  const asUtcMs = Date.UTC(year, month - 1, day, hour, minute, second)
  if (!Number.isFinite(asUtcMs)) return null
  const guessSeconds = Math.floor(asUtcMs / 1000)
  const offset1 = offsetSecondsAt(guessSeconds, timeZone)
  let utcSeconds = guessSeconds - offset1
  const offset2 = offsetSecondsAt(utcSeconds, timeZone)
  if (offset2 !== offset1) utcSeconds = guessSeconds - offset2
  return utcSeconds
}

/**
 * Remap one provisional CSV second (wall packed via Date.UTC) into true UTC unix
 * for the chosen data timezone.
 */
export function remapProvisionalCsvSeconds(
  provisionalSec: number,
  dataTimezone: string
): number {
  if (!Number.isFinite(provisionalSec)) return provisionalSec
  if (!dataTimezone || dataTimezone === 'UTC' || dataTimezone === 'Etc/UTC') {
    return provisionalSec
  }
  const d = new Date(provisionalSec * 1000)
  if (Number.isNaN(d.getTime())) return provisionalSec
  const remapped = wallClockToUnixSeconds(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    dataTimezone
  )
  return remapped != null ? remapped : provisionalSec
}

/** Remap an entire 1m series; returns same array reference when timezone is UTC. */
export function remapCandlesCsvTimezone(candles: Candle[], dataTimezone: string): Candle[] {
  if (!Array.isArray(candles) || candles.length === 0) return candles
  if (!dataTimezone || dataTimezone === 'UTC' || dataTimezone === 'Etc/UTC') return candles
  return candles.map((c) => ({
    ...c,
    time: remapProvisionalCsvSeconds(c.time, dataTimezone)
  }))
}

/** Format provisional CSV wall clock for confirm UI (as written in the file). */
export function formatCsvWallClock(provisionalSec: number | null | undefined): string {
  if (provisionalSec == null || !Number.isFinite(provisionalSec)) return '—'
  const d = new Date(provisionalSec * 1000)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`
}

/** Format remapped true-UTC time for confirm preview. */
export function formatRemappedUtc(provisionalSec: number, dataTimezone: string): string {
  const sec = remapProvisionalCsvSeconds(provisionalSec, dataTimezone)
  const d = new Date(sec * 1000)
  return `${d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')} UTC`
}
