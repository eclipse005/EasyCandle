import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import {
  CircleDollarSign,
  Database,
  FlaskConical,
  GitBranch,
  LayoutDashboard,
  LineChart,
  ListVideo,
  Search,
  Settings,
  Table2
} from 'lucide-react'
import { APP_NAME } from '@shared/appName'
import { useReplayStore } from '@/store/replayStore'
import {
  useUiLayoutStore,
  type SidebarNav,
  type TestingTab
} from '@/store/uiLayoutStore'
import SessionsTab from '@/components/dashboard/SessionsTab'
import DatasetsTab from '@/components/dashboard/DatasetsTab'
import SymbolsTab from '@/components/dashboard/SymbolsTab'
import StrategiesTab from '@/components/dashboard/StrategiesTab'
import TestingDashboardTab from '@/components/dashboard/TestingDashboardTab'
import TradesTab from '@/components/dashboard/TradesTab'
import AnalyticsTab from '@/components/dashboard/AnalyticsTab'
import SettingsPanel from '@/components/dashboard/SettingsPanel'
import CreateSessionDialog from '@/components/dashboard/CreateSessionDialog'
import SessionReportDialog from '@/components/SessionReportDialog'
import AboutDialog from '@/components/AboutDialog'
import Tooltip from '@/components/Tooltip'
import Kbd from '@/components/Kbd'
import { SoftInput } from '@/components/ui/SoftInput'
import iconUrl from '@/assets/barreplay-icon.svg'
import { cn } from '@/components/ui/cn'
import { softMotion, softNav, softType } from '@/components/ui/softTokens'
import { useT } from '@/i18n/useT'
import type { MessageKey } from '@/i18n/messages'

const SIDEBAR_PRIMARY: { id: SidebarNav; labelKey: MessageKey; icon: typeof FlaskConical }[] = [
  { id: 'testing', labelKey: 'nav.testing', icon: FlaskConical },
  { id: 'strategies', labelKey: 'nav.strategies', icon: GitBranch }
]

const SIDEBAR_SECONDARY: { id: SidebarNav; labelKey: MessageKey; icon: typeof Database }[] = [
  { id: 'datasets', labelKey: 'nav.datasets', icon: Database },
  { id: 'symbols', labelKey: 'nav.symbols', icon: CircleDollarSign }
]

const TESTING_TABS: { id: TestingTab; labelKey: MessageKey; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', labelKey: 'testing.dashboard', icon: LayoutDashboard },
  { id: 'sessions', labelKey: 'testing.sessions', icon: ListVideo },
  { id: 'trades', labelKey: 'testing.trades', icon: Table2 },
  { id: 'analytics', labelKey: 'testing.analytics', icon: LineChart }
]

const PAGE_TITLE_KEYS: Record<SidebarNav, MessageKey> = {
  testing: 'nav.testing',
  strategies: 'nav.strategies',
  datasets: 'nav.datasets',
  symbols: 'nav.symbols',
  settings: 'nav.settings'
}

type NavTarget = {
  id: string
  labelKey: MessageKey
  icon: typeof FlaskConical
  sidebar: SidebarNav
  testingTab?: TestingTab
}

const NAV_SEARCH_TARGETS: NavTarget[] = [
  ...SIDEBAR_PRIMARY.map((i) => ({ ...i, sidebar: i.id })),
  ...SIDEBAR_SECONDARY.map((i) => ({ ...i, sidebar: i.id })),
  { id: 'settings', labelKey: 'nav.settings', icon: Settings, sidebar: 'settings' },
  ...TESTING_TABS.map((tab) => ({
    id: `testing:${tab.id}`,
    labelKey: tab.labelKey,
    icon: tab.icon,
    sidebar: 'testing' as SidebarNav,
    testingTab: tab.id
  }))
]

function SidebarNavButton({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean
  icon: typeof FlaskConical
  label: string
  onClick: () => void
}): ReactNode {
  return (
    <Tooltip text={label} side="right" sideOffset={10}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative flex h-11 w-11 items-center justify-center rounded-xl',
          softMotion.colorsFast,
          active ? softNav.pillActive : softNav.pillIdle
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-zinc-100',
            softMotion.indicator,
            active ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-50'
          )}
        />
        <Icon className="h-5 w-5 shrink-0 opacity-80" aria-hidden />
      </button>
    </Tooltip>
  )
}

function TestingTabList({
  testingTab,
  setTestingTab
}: {
  testingTab: TestingTab
  setTestingTab: (t: TestingTab) => void
}): ReactNode {
  const { t } = useT()
  const listRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [underline, setUnderline] = useState({ left: 0, width: 0, ready: false })

  const measure = useCallback(() => {
    const list = listRef.current
    const idx = TESTING_TABS.findIndex((t) => t.id === testingTab)
    const btn = btnRefs.current[idx]
    if (!list || !btn) return
    const listRect = list.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    setUnderline({
      left: btnRect.left - listRect.left + list.scrollLeft,
      width: btnRect.width,
      ready: true
    })
  }, [testingTab])

  useLayoutEffect(() => {
    measure()
  }, [measure])

  useEffect(() => {
    const list = listRef.current
    if (!list || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(list)
    for (const btn of btnRefs.current) {
      if (btn) ro.observe(btn)
    }
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  return (
    <div
      ref={listRef}
      className="relative mt-6 flex items-center gap-8 border-b border-white/[0.06]"
      role="tablist"
      aria-label="Testing sections"
    >
      {TESTING_TABS.map((tab, i) => {
        const active = testingTab === tab.id
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            ref={(el) => {
              btnRefs.current[i] = el
            }}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setTestingTab(tab.id)}
            className={cn(
              'relative -mb-px inline-flex items-center gap-2.5 pb-3.5',
              softMotion.colorsFast,
              softType.tab,
              active ? softNav.tabActive : softNav.tabIdle
            )}
          >
            <Icon className="h-5 w-5 opacity-80" aria-hidden />
            {t(tab.labelKey)}
          </button>
        )
      })}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-zinc-100',
          softMotion.underline,
          underline.ready ? 'opacity-100' : 'opacity-0'
        )}
        style={{ left: underline.left, width: underline.width }}
      />
    </div>
  )
}

/**
 * Management console — FX Replay–style left sidebar + main column.
 * Entering a backtesting session switches to the chart (AppShell).
 */
export default function Dashboard(): ReactNode {
  const { t } = useT()
  const sidebarNav = useUiLayoutStore((s) => s.sidebarNav)
  const setSidebarNav = useUiLayoutStore((s) => s.setSidebarNav)
  const testingTab = useUiLayoutStore((s) => s.testingTab)
  const setTestingTab = useUiLayoutStore((s) => s.setTestingTab)
  const refreshImportedList = useReplayStore((s) => s.refreshImportedList)
  const [createOpen, setCreateOpen] = useState(false)
  const [version, setVersion] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void refreshImportedList()
  }, [refreshImportedList])

  useEffect(() => {
    void window.api.getAppVersion().then(setVersion)
  }, [])

  // Deep-link: ?nav=testing|strategies|datasets|symbols|settings & ?tab=dashboard|sessions|trades|analytics
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const nav = params.get('nav')
      const tab = params.get('tab')
      const navs = new Set(['testing', 'strategies', 'datasets', 'symbols', 'settings'])
      const tabs = new Set(['dashboard', 'sessions', 'trades', 'analytics'])
      if (nav && navs.has(nav)) setSidebarNav(nav as SidebarNav)
      if (tab && tabs.has(tab)) setTestingTab(tab as TestingTab)
    } catch {
      /* ignore */
    }
  }, [setSidebarNav, setTestingTab])

  const goTo = useCallback(
    (target: NavTarget) => {
      setSidebarNav(target.sidebar)
      if (target.testingTab) setTestingTab(target.testingTab)
      setSearchOpen(false)
      setSearchQuery('')
      setSearchIndex(0)
    },
    [setSidebarNav, setTestingTab]
  )

  const openSearch = useCallback(() => {
    setSearchOpen(true)
    setSearchIndex(0)
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchIndex(0)
  }, [])

  const searchResults = (() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return NAV_SEARCH_TARGETS
    return NAV_SEARCH_TARGETS.filter((item) => {
      const label = t(item.labelKey).toLowerCase()
      return label.includes(q) || item.id.toLowerCase().includes(q)
    })
  })()

  useEffect(() => {
    setSearchIndex((i) => (searchResults.length === 0 ? 0 : Math.min(i, searchResults.length - 1)))
  }, [searchResults.length])

  // ⌘K / Ctrl+K — open sidebar page search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (searchOpen) closeSearch()
        else openSearch()
        return
      }
      if (!searchOpen) return
      if (e.key === 'Escape') {
        e.preventDefault()
        closeSearch()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSearchIndex((i) => Math.min(i + 1, Math.max(searchResults.length - 1, 0)))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSearchIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' && searchResults[searchIndex]) {
        e.preventDefault()
        goTo(searchResults[searchIndex])
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [searchOpen, searchResults, searchIndex, openSearch, closeSearch, goTo])

  useEffect(() => {
    if (!searchOpen) return
    const onPointer = (e: MouseEvent) => {
      const panel = searchPanelRef.current
      if (panel && !panel.contains(e.target as Node)) closeSearch()
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [searchOpen, closeSearch])

  const openCreate = () => {
    setCreateOpen(true)
  }

  let mainBody: ReactNode = null
  if (sidebarNav === 'testing') {
    switch (testingTab) {
      case 'sessions':
        mainBody = <SessionsTab onNewSession={() => openCreate()} />
        break
      case 'trades':
        mainBody = <TradesTab />
        break
      case 'analytics':
        mainBody = <AnalyticsTab />
        break
      default:
        mainBody = <TestingDashboardTab onStartSession={() => openCreate()} />
    }
  } else if (sidebarNav === 'strategies') {
    mainBody = <StrategiesTab />
  } else if (sidebarNav === 'datasets') {
    mainBody = <DatasetsTab />
  } else if (sidebarNav === 'symbols') {
    mainBody = <SymbolsTab />
  } else {
    mainBody = <SettingsPanel />
  }

  const modKey = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    ? '⌘'
    : 'Ctrl'

  return (
    <div className="flex h-full overflow-hidden bg-zinc-950 font-sans text-zinc-200">
      <aside className="relative flex w-[4.25rem] shrink-0 flex-col items-center border-r border-white/[0.05] bg-zinc-950 px-2 py-5">
        <Tooltip text={APP_NAME} side="right" sideOffset={10}>
          <div className="mb-4 flex h-11 w-11 items-center justify-center">
            <img src={iconUrl} alt="" className="h-8 w-8 rounded-xl" aria-hidden />
          </div>
        </Tooltip>

        <Tooltip text={t('nav.searchShortcut')} side="right" sideOffset={10} kbds={[`${modKey}K`]}>
          <button
            type="button"
            aria-label={t('nav.search')}
            aria-expanded={searchOpen}
            onClick={() => (searchOpen ? closeSearch() : openSearch())}
            className={cn(
              'mb-3 flex h-11 w-11 items-center justify-center rounded-xl',
              softMotion.colorsFast,
              searchOpen ? softNav.pillActive : softNav.pillIdle
            )}
          >
            <Search className="h-5 w-5 opacity-80" aria-hidden />
          </button>
        </Tooltip>

        {searchOpen ? (
          <div
            ref={searchPanelRef}
            className="absolute left-[calc(100%+0.5rem)] top-4 z-40 w-[18rem] rounded-2xl border border-white/[0.08] bg-zinc-950/95 p-2 shadow-2xl shadow-black/50 backdrop-blur-md"
            role="dialog"
            aria-label={t('nav.search')}
          >
            <SoftInput
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setSearchIndex(0)
              }}
              placeholder={t('nav.searchPlaceholder')}
              aria-label={t('nav.search')}
              className="h-10"
              autoComplete="off"
            />
            <ul className="mt-1.5 max-h-[min(22rem,60vh)] overflow-y-auto" role="listbox">
              {searchResults.length === 0 ? (
                <li className={cn('px-3 py-3', softType.caption)}>{t('nav.searchEmpty')}</li>
              ) : (
                searchResults.map((item, i) => {
                  const Icon = item.icon
                  const active = i === searchIndex
                  return (
                    <li key={item.id} role="option" aria-selected={active}>
                      <button
                        type="button"
                        onMouseEnter={() => setSearchIndex(i)}
                        onClick={() => goTo(item)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-body',
                          softMotion.colorsFast,
                          active ? 'bg-zinc-800/90 text-zinc-50' : 'text-zinc-300 hover:bg-zinc-900'
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                        <span className="min-w-0 truncate">{t(item.labelKey)}</span>
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
            <p className={cn('flex items-center gap-1.5 px-2.5 pb-1 pt-1.5', softType.micro)}>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <span className="text-zinc-600">·</span>
              <Kbd>↵</Kbd>
              <span className="text-zinc-600">·</span>
              <Kbd>Esc</Kbd>
            </p>
          </div>
        ) : null}

        <nav className="flex flex-1 flex-col items-center gap-1" aria-label="Primary">
          {SIDEBAR_PRIMARY.map((item) => (
            <SidebarNavButton
              key={item.id}
              active={sidebarNav === item.id}
              icon={item.icon}
              label={t(item.labelKey)}
              onClick={() => setSidebarNav(item.id)}
            />
          ))}

          <div className="my-2 h-px w-8 bg-white/[0.05]" />

          {SIDEBAR_SECONDARY.map((item) => (
            <SidebarNavButton
              key={item.id}
              active={sidebarNav === item.id}
              icon={item.icon}
              label={t(item.labelKey)}
              onClick={() => setSidebarNav(item.id)}
            />
          ))}
        </nav>

        <div className="mt-auto flex flex-col items-center gap-1 border-t border-white/[0.05] pt-3">
          <SidebarNavButton
            active={sidebarNav === 'settings'}
            icon={Settings}
            label={t('nav.settings')}
            onClick={() => setSidebarNav('settings')}
          />
          {version ? (
            <span className={cn('tabular-nums', softType.micro)} title={`v${version}`}>
              v{version}
            </span>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <main className="min-h-0 flex-1 overflow-y-auto px-5 py-6 lg:px-6 lg:py-7">
          <div className="mx-auto w-full max-w-none">
            <h1 className={softType.pageTitle}>{t(PAGE_TITLE_KEYS[sidebarNav])}</h1>

            {sidebarNav === 'testing' ? (
              <TestingTabList testingTab={testingTab} setTestingTab={setTestingTab} />
            ) : (
              <div className="mt-5 border-b border-white/[0.04]" />
            )}

            <div
              key={`${sidebarNav}-${testingTab}`}
              className="motion-page-enter mt-8"
            >
              {mainBody}
            </div>
          </div>
        </main>
      </div>

      <CreateSessionDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      <SessionReportDialog />
      <AboutDialog />
    </div>
  )
}
