/** Lightweight message catalogs — shell + Testing / Datasets / Symbols / Strategies / new-session. */

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
  'settings.languageHint': 'Choose the UI language for shell and main console screens.',
  'settings.appearance': 'Appearance',
  'settings.appearanceHint': 'Soft dark canvas by default. Theme also applies inside chart sessions.',
  'settings.dark': 'Dark',
  'settings.light': 'Light',
  'settings.about': 'About',
  'settings.aboutBody':
    '{app} is a pure-frontend candle replay and paper-trading app. All data stays in your browser (IndexedDB + localStorage).',
  'settings.aboutButton': 'About {app}',
  'settings.github': 'GitHub',
  'settings.version': 'Version {version}',

  'dashboard.backtestingSession': 'Backtesting session',
  'dashboard.startSession': 'Start a session.',
  'dashboard.tutorials': 'Tutorials',
  'dashboard.tutorialsHint': 'Local help on GitHub.',
  'dashboard.performance': 'Performance',
  'dashboard.sessionsLocal': '{count} session{suffix} · local only',

  'datasets.title': 'Symbols with data',
  'datasets.subtitle': 'One row per symbol. Edit to manage CSV files, coverage, and imports.',
  'datasets.empty':
    'No datasets yet — import a MT4/MT5 1-minute CSV. Catalog symbols without data stay on the Symbols page.',
  'datasets.edit': 'Edit',
  'datasets.refresh': 'refresh',
  'datasets.symbolCount': '{count} symbol{suffix} with data',
  'datasets.deleteTitle': 'Delete datasets',
  'datasets.deleteOne': 'Delete the file for {symbol}? This cannot be undone.',
  'datasets.deleteMany': 'Delete all {count} files for {symbol}? This cannot be undone.',

  'symbols.title': 'Per-symbol defaults',
  'symbols.subtitle':
    'Contract size is units per 1.0 lot. Spread (full bid–ask in price) and round-turn commission per lot apply to paper fills. Explicit values always win over name-derived defaults.',
  'symbols.emptyOther': 'No non-catalog imports yet.',
  'symbols.emptyCategory': 'No symbols in this category.',
  'symbols.contract': 'Contract',
  'symbols.spread': 'Spread',
  'symbols.comm': 'Comm',
  'symbols.noData': 'No data',

  'strategies.my': 'My strategies',
  'strategies.new': 'New strategy',
  'strategies.searchPlaceholder': 'Search strategies…',
  'strategies.empty':
    'No strategies yet — create one and tag sessions with it to see win rate, drawdown, and equity.',
  'strategies.noMatch': 'No strategies match “{query}”.',
  'strategies.deleteTitle': 'Delete strategy',
  'strategies.deleteBody': 'Delete the strategy “{name}”? This cannot be undone.',
  'strategies.createTitle': 'New strategy',
  'strategies.createHint':
    'Local tag for sessions — performance aggregates from tagged closed trades.',
  'strategies.name': 'Name',
  'strategies.namePlaceholder': 'e.g. Breakout M15',
  'strategies.create': 'Create',
  'strategies.cancel': 'Cancel',
  'strategies.noData': 'No data',
  'strategies.noPerf': 'No performance data yet',
  'strategies.winRate': 'Win rate',
  'strategies.trades': 'Trades',
  'strategies.maxDd': 'Max DD',
  'strategies.rr': 'R:R',

  'session.newTitle': 'New backtesting session',
  'session.newHint': 'Pick a symbol — the engine merges all of its imported CSV files.',
  'session.symbol': 'Symbol',
  'session.symbolRequired': 'Symbol *',
  'session.importFirst': 'Symbol — import a CSV first',
  'session.noSymbols': 'No symbols with data',
  'session.startDate': 'Start date',
  'session.pickDay': 'Pick a day with data',
  'session.balance': 'Initial balance',
  'session.strategy': 'Strategy (optional)',
  'session.noStrategy': 'No strategy',
  'session.name': 'Name (optional)',
  'session.cancel': 'Cancel',
  'session.start': 'Start session',
  'session.preparing': 'Preparing…',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete'
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
  'settings.languageHint': '选择界面语言（壳层与主控制台页面）。',
  'settings.appearance': '外观',
  'settings.appearanceHint': '默认柔和深色画布。主题同样作用于图表会话。',
  'settings.dark': '深色',
  'settings.light': '浅色',
  'settings.about': '关于',
  'settings.aboutBody':
    '{app} 是纯前端的 K 线回放与模拟交易应用。所有数据保存在本机浏览器（IndexedDB + localStorage）。',
  'settings.aboutButton': '关于 {app}',
  'settings.github': 'GitHub',
  'settings.version': '版本 {version}',

  'dashboard.backtestingSession': '回测会话',
  'dashboard.startSession': '开始一个会话。',
  'dashboard.tutorials': '教程',
  'dashboard.tutorialsHint': 'GitHub 上的本地帮助。',
  'dashboard.performance': '表现',
  'dashboard.sessionsLocal': '{count} 个会话 · 仅本地',

  'datasets.title': '已有数据的品种',
  'datasets.subtitle': '每个品种一行。点编辑管理 CSV、覆盖范围与导入。',
  'datasets.empty':
    '还没有数据集 — 请导入 MT4/MT5 的 1 分钟 CSV。没有数据的品种仍在「品种」页。',
  'datasets.edit': '编辑',
  'datasets.refresh': '刷新',
  'datasets.symbolCount': '{count} 个有数据的品种',
  'datasets.deleteTitle': '删除数据集',
  'datasets.deleteOne': '删除 {symbol} 的文件？此操作无法撤销。',
  'datasets.deleteMany': '删除 {symbol} 的全部 {count} 个文件？此操作无法撤销。',

  'symbols.title': '品种默认参数',
  'symbols.subtitle':
    '合约大小为每 1.0 手的基础单位数量。点差（完整买卖价差）与每手往返佣金用于模拟成交。显式填写的值优先于按名称推导的默认值。',
  'symbols.emptyOther': '暂无非目录导入。',
  'symbols.emptyCategory': '此分类暂无品种。',
  'symbols.contract': '合约',
  'symbols.spread': '点差',
  'symbols.comm': '佣金',
  'symbols.noData': '无数据',

  'strategies.my': '我的策略',
  'strategies.new': '新建策略',
  'strategies.searchPlaceholder': '搜索策略…',
  'strategies.empty':
    '还没有策略 — 创建一个并在会话上标记，即可看到胜率、回撤与权益曲线。',
  'strategies.noMatch': '没有匹配“{query}”的策略。',
  'strategies.deleteTitle': '删除策略',
  'strategies.deleteBody': '删除策略“{name}”？此操作无法撤销。',
  'strategies.createTitle': '新建策略',
  'strategies.createHint': '本地会话标签 — 表现来自已标记会话的平仓交易。',
  'strategies.name': '名称',
  'strategies.namePlaceholder': '例如 Breakout M15',
  'strategies.create': '创建',
  'strategies.cancel': '取消',
  'strategies.noData': '无数据',
  'strategies.noPerf': '暂无表现数据',
  'strategies.winRate': '胜率',
  'strategies.trades': '笔数',
  'strategies.maxDd': '最大回撤',
  'strategies.rr': '盈亏比',

  'session.newTitle': '新建回测会话',
  'session.newHint': '选择品种 — 引擎会合并该品种下全部已导入的 CSV。',
  'session.symbol': '品种',
  'session.symbolRequired': '品种 *',
  'session.importFirst': '品种 — 请先导入 CSV',
  'session.noSymbols': '没有已导入数据的品种',
  'session.startDate': '开始日期',
  'session.pickDay': '选择有数据的日期',
  'session.balance': '初始资金',
  'session.strategy': '策略（可选）',
  'session.noStrategy': '无策略',
  'session.name': '名称（可选）',
  'session.cancel': '取消',
  'session.start': '开始会话',
  'session.preparing': '准备中…',
  'common.cancel': '取消',
  'common.delete': '删除'
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
