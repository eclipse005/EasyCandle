/**
 * Settings Account timezone + CSV Import Confirm — one well-known city per
 * whole-hour UTC offset (≈ UTC−11…UTC+12, plus +14). Half-hour zones omitted.
 * Keep this list the single source of truth for both pickers and import validation.
 */
export const ACCOUNT_TIMEZONE_IDS: readonly string[] = [
  'Pacific/Pago_Pago', // UTC-11
  'Pacific/Honolulu', // UTC-10
  'America/Anchorage', // UTC-9 / -8 DST
  'America/Los_Angeles', // UTC-8 / -7 DST
  'America/Denver', // UTC-7 / -6 DST
  'America/Chicago', // UTC-6 / -5 DST
  'America/New_York', // UTC-5 / -4 DST
  'America/Halifax', // UTC-4 / -3 DST
  'America/Sao_Paulo', // UTC-3
  'America/Noronha', // UTC-2
  'Atlantic/Cape_Verde', // UTC-1
  'UTC', // UTC+0
  'Europe/Paris', // UTC+1 / +2 DST
  'Africa/Cairo', // UTC+2
  'Europe/Moscow', // UTC+3
  'Asia/Dubai', // UTC+4
  'Asia/Karachi', // UTC+5
  'Asia/Dhaka', // UTC+6
  'Asia/Bangkok', // UTC+7
  'Asia/Shanghai', // UTC+8
  'Asia/Tokyo', // UTC+9
  'Australia/Brisbane', // UTC+10
  'Pacific/Noumea', // UTC+11
  'Pacific/Auckland', // UTC+12 / +13 DST
  'Pacific/Kiritimati' // UTC+14
]

const ALLOWED = new Set(ACCOUNT_TIMEZONE_IDS)

/** True for curated account/import timezone ids (plus Etc/UTC alias). */
export function isAccountTimezoneId(id: string): boolean {
  if (!id) return false
  if (id === 'Etc/UTC') return true
  if (!ALLOWED.has(id)) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: id === 'UTC' ? 'UTC' : id })
    return true
  } catch {
    return false
  }
}
