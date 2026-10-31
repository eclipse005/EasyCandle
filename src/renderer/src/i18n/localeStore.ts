import { create } from 'zustand'
import {
  detectDefaultLocale,
  LOCALE_STORAGE_KEY,
  type Locale,
  translate,
  type MessageKey
} from '@/i18n/messages'

function persistLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // ignore quota / private mode
  }
  try {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  } catch {
    // ignore
  }
}

type LocaleState = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
}

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: detectDefaultLocale(),
  setLocale: (locale) => {
    if (locale === get().locale) return
    persistLocale(locale)
    set({ locale })
  },
  t: (key, vars) => translate(get().locale, key, vars)
}))

/** Apply <html lang> once on boot (store may hydrate before first paint). */
export function applyStoredLocale(): void {
  persistLocale(useLocaleStore.getState().locale)
}
