import { create } from 'zustand'
import { DEFAULT_CHART_TIMEZONE, sanitizeTimezone } from '@/lib/chartTimezone'

export const ACCOUNT_TIMEZONE_STORAGE_KEY = 'bar-replay:account-timezone'

/** Default account timezone — FXR-style America/New_York. */
export const DEFAULT_ACCOUNT_TIMEZONE = DEFAULT_CHART_TIMEZONE

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
