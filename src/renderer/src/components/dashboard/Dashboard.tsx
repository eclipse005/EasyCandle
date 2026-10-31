import { useEffect, useState, type ReactNode } from 'react'
import {
  CircleDollarSign,
  Database,
  ExternalLink,
  GitBranch,
  LayoutDashboard,
  ListVideo
} from 'lucide-react'
import type { ImportedDatasetMeta } from '@shared/importTypes'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore, type DashboardTab } from '@/store/uiLayoutStore'
import SessionsTab from '@/components/dashboard/SessionsTab'
import DatasetsTab from '@/components/dashboard/DatasetsTab'
import SymbolsTab from '@/components/dashboard/SymbolsTab'
import StrategiesTab from '@/components/dashboard/StrategiesTab'
import CreateSessionDialog from '@/components/dashboard/CreateSessionDialog'
import SessionReportDialog from '@/components/SessionReportDialog'
import iconUrl from '@/assets/candlelab-icon.svg'

const TABS: { id: DashboardTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'sessions', label: 'Sessions', icon: ListVideo },
  { id: 'datasets', label: 'Datasets', icon: Database },
  { id: 'symbols', label: 'Symbols', icon: CircleDollarSign },
  { id: 'strategies', label: 'Strategies', icon: GitBranch }
]

function TabButton({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean
  icon: typeof LayoutDashboard
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? 'bg-zinc-800 text-zinc-100'
          : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </button>
  )
}

/**
 * Management console — the app's home view. Sessions, imported datasets,
 * symbol parameters, and strategies are managed here; entering a backtesting
 * session switches to the chart (AppShell).
 */
export default function Dashboard(): ReactNode {
  const dashboardTab = useUiLayoutStore((s) => s.dashboardTab)
  const setDashboardTab = useUiLayoutStore((s) => s.setDashboardTab)
  const refreshImportedList = useReplayStore((s) => s.refreshImportedList)
  const imports = useReplayStore((s) => s.importedList)
  const [createFor, setCreateFor] = useState<ImportedDatasetMeta | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    void refreshImportedList()
  }, [refreshImportedList])

  const openCreate = (datasetId?: string) => {
    setCreateFor(datasetId ? imports.find((m) => m.id === datasetId) ?? null : null)
    setCreateOpen(true)
  }

  let content: ReactNode = null
  switch (dashboardTab) {
    case 'sessions':
      content = <SessionsTab onNewSession={() => openCreate()} />
      break
    case 'datasets':
      content = <DatasetsTab onNewSession={openCreate} />
      break
    case 'symbols':
      content = <SymbolsTab />
      break
    case 'strategies':
      content = <StrategiesTab />
      break
    default:
      content = <SessionsTab onNewSession={() => openCreate()} summary />
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-950 text-zinc-200">
      <header className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-3 py-2.5">
        <img src={iconUrl} alt="" className="h-6 w-6 rounded-sm" aria-hidden />
        <span className="text-sm font-bold tracking-tight text-amber-400">CandleLab</span>
        <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-zinc-600">
          Backtesting console
        </span>

        <nav className="ml-6 flex items-center gap-1" aria-label="Console sections">
          {TABS.map((tab) => (
            <TabButton
              key={tab.id}
              active={dashboardTab === tab.id}
              icon={tab.icon}
              label={tab.label}
              onClick={() => setDashboardTab(tab.id)}
            />
          ))}
        </nav>

        <a
          href="https://github.com/eclipse005/EasyCandle"
          target="_blank"
          rel="noopener noreferrer"
          title="CandleLab on GitHub"
          className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto w-full max-w-4xl">{content}</div>
      </main>

      <CreateSessionDialog
        open={createOpen}
        presetDataset={createFor}
        onClose={() => setCreateOpen(false)}
      />
      <SessionReportDialog />
    </div>
  )
}
