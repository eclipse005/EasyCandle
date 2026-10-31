/**
 * Account-timezone display helpers for Sessions / Trades / Analytics / blotter.
 * Storage stays UTC unix seconds; chart bottom-right TZ is separate (display-only axis).
 * Never append a bare "UTC" / "UTC±N" suffix on these user-facing strings.
 */

import {
  formatSessionCandleTime,
  sanitizeTimezone,
  sessionDateTimeParts,
  toSessionParts
} from '@/lib/chartTimezone'

export type DisplayTimeOptions = {
  /** Include seconds (default true). */
  seconds?: boolean
}

/** Wall-clock in account TZ, e.g. `2026-01-02 06:00:00` — no UTC suffix. */
export function formatAccountDateTime(
  unixSeconds: number | null | undefined,
  timeZone: string,
  options: DisplayTimeOptions = {}
): string {
  return formatSessionCandleTime(unixSeconds, sanitizeTimezone(timeZone), {
    seconds: options.seconds !== false,
    offset: false
  })
}

/** Short date in account TZ, e.g. `Jan 2, 2026`. */
export function formatAccountShortDate(
  unixSeconds: number | null | undefined,
  timeZone: string,
  locale = 'en-US'
): string {
  if (unixSeconds == null || !Number.isFinite(unixSeconds)) return '—'
  const parts = sessionDateTimeParts(unixSeconds, sanitizeTimezone(timeZone))
  if (!parts) return '—'
  // Build from parts so we don't leak browser-local TZ via Date methods.
  const utcMs = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0)
  return new Date(utcMs).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

/** `YYYY-MM-DD` calendar day in account TZ. */
export function formatAccountDayKey(
  unixSeconds: number | null | undefined,
  timeZone: string
): string {
  const parts = toSessionParts(
    unixSeconds == null || !Number.isFinite(unixSeconds) ? 0 : unixSeconds,
    sanitizeTimezone(timeZone)
  )
  return parts.date || '—'
}
