/** Lightweight message catalogs — Settings + shell first; expand keys as screens localize. */

export type Locale = 'en' | 'zh'

export const LOCALE_STORAGE_KEY = 'bar-replay:locale'

export const LOCALE_OPTIONS: { id: Locale; label: string; nativeLabel: string }[] = [
  { id: 'en', label: 'English', nativeLabel: 'EN' },
  { id: 'zh', label: '中文', nativeLabel: '中文' }
]

const en = {
  'nav.testing': 'Testing',
  'nav.strategies': 'Strategies',
  'nav.datasets': 'Datasets',
  'nav.symbols': 'Symbols',
  'nav.settings': 'Settings',
  'testing.dashboard': 'Dashboard',
  'testing.sessions': 'Sessions',
  'testing.trades': 'Trades',
  'testing.analytics': 'Analytics',
  'settings.language': 'Language',
  'settings.languageHint': 'Choose the UI language. More screens will follow.',
  'settings.appearance': 'Appearance',
  'settings.appearanceHint': 'Soft dark canvas by default. Theme also applies inside chart sessions.',
  'settings.dark': 'Dark',
  'settings.light': 'Light',
  'settings.about': 'About',
  'settings.aboutBody':
    '{app} is a pure-frontend candle replay and paper-trading app. All data stays in your browser (IndexedDB + localStorage).',
  'settings.aboutButton': 'About {app}',
  'settings.github': 'GitHub',
  'settings.version': 'Version {version}'
} as const

export type MessageKey = keyof typeof en

const zh: Record<MessageKey, string> = {
  'nav.testing': '测试',
  'nav.strategies': '策略',
  'nav.datasets': '数据集',
  'nav.symbols': '品种',
  'nav.settings': '设置',
  'testing.dashboard': '仪表盘',
  'testing.sessions': '会话',
  'testing.trades': '成交',
  'testing.analytics': '分析',
  'settings.language': '语言',
  'settings.languageHint': '选择界面语言。更多页面将陆续支持。',
  'settings.appearance': '外观',
  'settings.appearanceHint': '默认柔和深色画布。主题同样作用于图表会话。',
  'settings.dark': '深色',
  'settings.light': '浅色',
  'settings.about': '关于',
  'settings.aboutBody':
    '{app} 是纯前端的 K 线回放与模拟交易应用。所有数据保存在本机浏览器（IndexedDB + localStorage）。',
  'settings.aboutButton': '关于 {app}',
  'settings.github': 'GitHub',
  'settings.version': '版本 {version}'
}

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = {
  en: { ...en },
  zh
}

export function detectDefaultLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored === 'en' || stored === 'zh') return stored
  } catch {
    // ignore
  }
  try {
    const lang = (navigator.language || 'en').toLowerCase()
    if (lang.startsWith('zh')) return 'zh'
  } catch {
    // ignore
  }
  return 'en'
}

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>
): string {
  const catalog = MESSAGES[locale] ?? MESSAGES.en
  let text = catalog[key] ?? MESSAGES.en[key] ?? key
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}
