/** Settings Account timezone — reuses shared TimezonePicker (~24 whole-hour cities). */
import type { ReactNode } from 'react'
import TimezonePicker, { timezoneOptionLabel } from '@/components/TimezonePicker'
import { useAccountPrefsStore } from '@/store/accountPrefsStore'
import { useT } from '@/i18n/useT'

/** @deprecated Prefer timezoneOptionLabel from TimezonePicker. */
export const accountTimezoneOptionLabel = timezoneOptionLabel

export default function AccountTimezoneSelect(): ReactNode {
  const { t } = useT()
  const accountTimezone = useAccountPrefsStore((s) => s.accountTimezone)
  const setAccountTimezone = useAccountPrefsStore((s) => s.setAccountTimezone)

  return (
    <TimezonePicker
      className="max-w-sm"
      value={accountTimezone}
      onChange={setAccountTimezone}
      ariaLabel={t('settings.accountTimezone')}
    />
  )
}
