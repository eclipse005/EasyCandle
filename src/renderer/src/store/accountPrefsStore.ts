import { create } from 'zustand'
import { DEFAULT_CHART_TIMEZONE, sanitizeTimezone } from '@/lib/chartTimezone'

export const ACCOUNT_TIMEZONE_STORAGE_KEY = 'bar-replay:account-timezone'

/** Default account timezone — FXR-style America/New_York. */
export const DEFAULT_ACCOUNT_TIMEZONE = DEFAULT_CHART_TIMEZONE

/** Common account zones for Settings SoftSelect (full IANA available via sanitize). */
export const ACCOUNT_TIMEZONE_OPTIONS: readonly { id: string; label: string }[] = [
  { id: 'America/New_York', label: 'New York (ET)' },
  { id: 'America/Chicago', label: 'Chicago (CT)' },
  { id: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
  { id: 'Europe/London', label: 'London' },
  { id: 'Europe/Berlin', label: 'Berlin / CET' },
  { id: 'Europe/Zurich', label: 'Zurich' },
  { id: 'Asia/Dubai', label: 'Dubai' },
  { id: 'Asia/Shanghai', label: 'Shanghai' },
  { id: 'Asia/Hong_Kong', label: 'Hong Kong' },
  { id: 'Asia/Tokyo', label: 'Tokyo' },
  { id: 'Australia/Sydney', label: 'Sydney' },
  { id: 'UTC', label: 'UTC' }
]

function readStoredAccountTimezone(): string {
  try {
    const raw = localStorage.getItem(ACCOUNT_TIMEZONE_STORAGE_KEY)
    if (raw) return sanitizeTimezone(raw)
  } catch {
    // ignore
  }
  return DEFAULT_ACCOUNT_TIMEZONE
}

function persistAccountTimezone(timezone: string): void {
  try {
    localStorage.setItem(ACCOUNT_TIMEZONE_STORAGE_KEY, timezone)
  } catch {
    // ignore quota / private mode
  }
}

type AccountPrefsState = {
  /** Analytics / trades day-cut zone (not chart display). */
  accountTimezone: string
  setAccountTimezone: (timezone: string) => void
}

export const useAccountPrefsStore = create<AccountPrefsState>((set, get) => ({
  accountTimezone: readStoredAccountTimezone(),
  setAccountTimezone: (timezone) => {
    const next = sanitizeTimezone(timezone)
    if (next === get().accountTimezone) return
    persistAccountTimezone(next)
    set({ accountTimezone: next })
  }
}))
