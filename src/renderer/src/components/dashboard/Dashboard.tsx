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
import iconUrl from '@/assets/barreplay-icon.svg'
import { cn } from '@/components/ui/cn'
import { softMotion, softNav, softType } from '@/components/ui/softTokens'
import { useT } from '@/i18n/useT'
import type { MessageKey } from '@/i18n/messages'

const SIDEBAR_EXPANDED_KEY = 'bar-replay:sidebar-expanded'

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

function readSidebarExpanded(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_EXPANDED_KEY) === '1'
  } catch {
    return false
  }
}

function writeSidebarExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_EXPANDED_KEY, expanded ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function SidebarNavButton({
  active,
  icon: Icon,
  label,
  onClick,
  expanded,
  className
}: {
  active: boolean
  icon: typeof FlaskConical
  label: string
  onClick: () => void
  expanded: boolean
  className?: string
}): ReactNode {
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex items-center rounded-xl',
        softMotion.colorsFast,
        active ? softNav.pillActive : softNav.pillIdle,
        expanded
          ? 'w-full gap-3 overflow-hidden px-3.5 py-3 text-body font-medium'
          : 'h-11 w-11 justify-center',
        className
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
      {expanded ? <span className="min-w-0 truncate">{label}</span> : null}
    </button>
  )

  if (expanded) return button
  return (
    <Tooltip text={label} side="right" sideOffset={10}>
      {button}
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
  const [sidebarExpanded, setSidebarExpanded] = useState(readSidebarExpanded)

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

  const toggleSidebarExpanded = useCallback(() => {
    setSidebarExpanded((prev) => {
      const next = !prev
      writeSidebarExpanded(next)
      return next
    })
  }, [])

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

  const logoToggleLabel = sidebarExpanded ? t('nav.collapse') : t('nav.expand')

  return (
    <div className="flex h-full overflow-hidden bg-zinc-950 font-sans text-zinc-200">
      <aside
        className={cn(
          'relative flex shrink-0 flex-col border-r border-white/[0.05] bg-zinc-950 py-5',
          softMotion.colorsFast,
          sidebarExpanded ? 'w-[260px] items-stretch px-3.5' : 'w-[4.25rem] items-center px-2'
        )}
      >
        <Tooltip text={`${APP_NAME} — ${logoToggleLabel}`} side="right" sideOffset={10}>
          <button
            type="button"
            onClick={toggleSidebarExpanded}
            aria-label={logoToggleLabel}
            aria-expanded={sidebarExpanded}
            className={cn(
              'mb-4 flex items-center rounded-xl',
              softMotion.colorsFast,
              softNav.pillIdle,
              sidebarExpanded ? 'w-full gap-3 px-2 py-1.5' : 'h-11 w-11 justify-center'
            )}
          >
            <img src={iconUrl} alt="" className="h-8 w-8 shrink-0 rounded-xl" aria-hidden />
            {sidebarExpanded ? (
              <span className="min-w-0 truncate text-[14px] font-semibold uppercase tracking-[0.08em] text-zinc-100">
                {APP_NAME}
              </span>
            ) : null}
          </button>
        </Tooltip>

        <nav
          className={cn(
            'flex flex-1 flex-col gap-1',
            sidebarExpanded ? 'items-stretch' : 'items-center'
          )}
          aria-label="Primary"
        >
          {SIDEBAR_PRIMARY.map((item) => (
            <SidebarNavButton
              key={item.id}
              active={sidebarNav === item.id}
              icon={item.icon}
              label={t(item.labelKey)}
              expanded={sidebarExpanded}
              onClick={() => setSidebarNav(item.id)}
            />
          ))}

          <div
            className={cn(
              'my-2 border-t border-white/[0.05]',
              sidebarExpanded ? 'mx-2' : 'h-px w-8 border-0 bg-white/[0.05]'
            )}
          />

          {SIDEBAR_SECONDARY.map((item) => (
            <SidebarNavButton
              key={item.id}
              active={sidebarNav === item.id}
              icon={item.icon}
              label={t(item.labelKey)}
              expanded={sidebarExpanded}
              onClick={() => setSidebarNav(item.id)}
            />
          ))}
        </nav>

        <div
          className={cn(
            'mt-auto border-t border-white/[0.05] pt-3',
            sidebarExpanded ? '' : 'flex flex-col items-center gap-1'
          )}
        >
          {sidebarExpanded ? (
            <div className="relative flex items-center">
              <SidebarNavButton
                active={sidebarNav === 'settings'}
                icon={Settings}
                label={t('nav.settings')}
                expanded
                className={version ? 'pr-14' : undefined}
                onClick={() => setSidebarNav('settings')}
              />
              {version ? (
                <span
                  className={cn(
                    'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 tabular-nums',
                    softType.micro
                  )}
                >
                  v{version}
                </span>
              ) : null}
            </div>
          ) : (
            <>
              <SidebarNavButton
                active={sidebarNav === 'settings'}
                icon={Settings}
                label={t('nav.settings')}
                expanded={false}
                onClick={() => setSidebarNav('settings')}
              />
              {version ? (
                <span className={cn('tabular-nums', softType.micro)} title={`v${version}`}>
                  v{version}
                </span>
              ) : null}
            </>
          )}
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
