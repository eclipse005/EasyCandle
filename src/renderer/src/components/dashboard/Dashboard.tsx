import { useEffect, useState, type ReactNode } from 'react'
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
import type { ImportedDatasetMeta } from '@shared/importTypes'
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
import { softNav, softType } from '@/components/ui/softTokens'

const SIDEBAR_PRIMARY: { id: SidebarNav; label: string; icon: typeof FlaskConical }[] = [
  { id: 'testing', label: 'Testing', icon: FlaskConical },
  { id: 'strategies', label: 'Strategies', icon: GitBranch }
]

const SIDEBAR_SECONDARY: { id: SidebarNav; label: string; icon: typeof Database }[] = [
  { id: 'datasets', label: 'Datasets', icon: Database },
  { id: 'symbols', label: 'Symbols', icon: CircleDollarSign }
]

const TESTING_TABS: { id: TestingTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'sessions', label: 'Sessions', icon: ListVideo },
  { id: 'trades', label: 'Trades', icon: Table2 },
  { id: 'analytics', label: 'Analytics', icon: LineChart }
]

const PAGE_TITLES: Record<SidebarNav, string> = {
  testing: 'Testing',
  strategies: 'Strategies',
  datasets: 'Datasets',
  symbols: 'Symbols',
  settings: 'Settings'
}

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
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-body font-medium transition-colors',
        active ? softNav.pillActive : softNav.pillIdle
      )}
    >
      <Icon className="h-5 w-5 opacity-80" aria-hidden />
      {label}
    </button>
  )
}

/**
 * Management console — FX Replay–style left sidebar + main column.
 * Entering a backtesting session switches to the chart (AppShell).
 */
export default function Dashboard(): ReactNode {
  const sidebarNav = useUiLayoutStore((s) => s.sidebarNav)
  const setSidebarNav = useUiLayoutStore((s) => s.setSidebarNav)
  const testingTab = useUiLayoutStore((s) => s.testingTab)
  const setTestingTab = useUiLayoutStore((s) => s.setTestingTab)
  const refreshImportedList = useReplayStore((s) => s.refreshImportedList)
  const imports = useReplayStore((s) => s.importedList)
  const [createFor, setCreateFor] = useState<ImportedDatasetMeta | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [version, setVersion] = useState('')

  useEffect(() => {
    void refreshImportedList()
  }, [refreshImportedList])

  useEffect(() => {
    void window.api.getAppVersion().then(setVersion)
  }, [])

  const openCreate = (datasetId?: string) => {
    setCreateFor(datasetId ? (imports.find((m) => m.id === datasetId) ?? null) : null)
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
    mainBody = <DatasetsTab onNewSession={openCreate} />
  } else if (sidebarNav === 'symbols') {
    mainBody = <SymbolsTab />
  } else {
    mainBody = <SettingsPanel />
  }

  return (
    <div className="flex h-full overflow-hidden bg-zinc-950 font-sans text-zinc-200">
      <aside className="flex w-[248px] shrink-0 flex-col border-r border-white/[0.05] bg-zinc-950 px-3.5 py-5">
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
              label={item.label}
              onClick={() => setSidebarNav(item.id)}
            />
          ))}

          <div className="my-2 border-t border-white/[0.05]" />

          {SIDEBAR_SECONDARY.map((item) => (
            <SidebarNavButton
              key={item.id}
              active={sidebarNav === item.id}
              icon={item.icon}
              label={item.label}
              onClick={() => setSidebarNav(item.id)}
            />
          ))}
        </nav>

        <div className="mt-auto space-y-2 border-t border-white/[0.05] pt-3">
          <SidebarNavButton
            active={sidebarNav === 'settings'}
            icon={Settings}
            label="Settings"
            onClick={() => setSidebarNav('settings')}
          />
          {version ? (
            <p className={cn("px-3", softType.micro)}>v{version}</p>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <main className="min-h-0 flex-1 overflow-y-auto px-8 py-8 lg:px-10 lg:py-9">
          <div className="mx-auto w-full max-w-7xl">
            <h1 className={softType.pageTitle}>{PAGE_TITLES[sidebarNav]}</h1>

            {sidebarNav === 'testing' ? (
              <div
                className="mt-5 flex items-center gap-7 border-b border-white/[0.06]"
                role="tablist"
                aria-label="Testing sections"
              >
                {TESTING_TABS.map((tab) => {
                  const active = testingTab === tab.id
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setTestingTab(tab.id)}
                      className={cn(
                        'relative -mb-px inline-flex items-center gap-2 pb-3 text-body font-medium transition-colors',
                        active ? softNav.tabActive : softNav.tabIdle
                      )}
                    >
                      <Icon className="h-4 w-4 opacity-80" aria-hidden />
                      {tab.label}
                      {active ? (
                        <span
                          className={softNav.tabUnderline}
                          aria-hidden
                        />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="mt-4 border-b border-white/[0.04]" />
            )}

            <div className="mt-6">{mainBody}</div>
          </div>
        </main>
      </div>

      <CreateSessionDialog
        open={createOpen}
        presetDataset={createFor}
        onClose={() => setCreateOpen(false)}
      />
      <SessionReportDialog />
      <AboutDialog />
    </div>
  )
}
