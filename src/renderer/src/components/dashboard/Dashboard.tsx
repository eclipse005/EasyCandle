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

function SidebarNavButton({
  active,
  icon: Icon,
  label,
  onClick,
  className,
  trailingPad
}: {
  active: boolean
  icon: typeof FlaskConical
  label: string
  onClick: () => void
  className?: string
  /** Extra right padding so absolute trailing text (version) does not collide. */
  trailingPad?: boolean
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3.5 py-3 text-body font-medium',
        softMotion.colorsFast,
        active ? softNav.pillActive : softNav.pillIdle,
        trailingPad && 'pr-14',
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
      <span className="min-w-0 truncate">{label}</span>
    </button>
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

  return (
    <div className="flex h-full overflow-hidden bg-zinc-950 font-sans text-zinc-200">
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-white/[0.05] bg-zinc-950 px-3.5 py-6">
        <div className="mb-6 flex items-center gap-3 px-2">
          <img src={iconUrl} alt="" className="h-8 w-8 rounded-xl" aria-hidden />
          <span className="text-[14px] font-semibold uppercase tracking-[0.08em] text-zinc-100">
            {APP_NAME}
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Primary">
          {SIDEBAR_PRIMARY.map((item) => (
            <SidebarNavButton
              key={item.id}
              active={sidebarNav === item.id}
              icon={item.icon}
              label={t(item.labelKey)}
              onClick={() => setSidebarNav(item.id)}
            />
          ))}

          <div className="my-2 border-t border-white/[0.05]" />

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

        {/* Footer: Settings left + version right on the SAME row */}
        <div className="mt-auto border-t border-white/[0.05] pt-3">
          <div className="relative flex items-center">
            <SidebarNavButton
              active={sidebarNav === 'settings'}
              icon={Settings}
              label={t('nav.settings')}
              onClick={() => setSidebarNav('settings')}
              trailingPad={Boolean(version)}
              className="flex-1 min-w-0"
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
