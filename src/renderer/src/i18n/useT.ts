import { useLocaleStore } from '@/i18n/localeStore'
import type { MessageKey } from '@/i18n/messages'

/** Subscribe to locale and return a stable-enough translator for the active language. */
export function useT(): {
  locale: 'en' | 'zh'
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
  setLocale: (locale: 'en' | 'zh') => void
} {
  const locale = useLocaleStore((s) => s.locale)
  const setLocale = useLocaleStore((s) => s.setLocale)
  // Re-bind when locale changes so callers don't close over a stale t.
  const t = (key: MessageKey, vars?: Record<string, string | number>): string =>
    useLocaleStore.getState().t(key, vars)
  return { locale, t, setLocale }
}
