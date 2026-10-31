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
import iconUrl from '@/assets/barreplay-icon.svg'

const TABS: { id: DashboardTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'sessions', label: 'Sessions', icon: ListVideo },
  { id: 'datasets', label: 'Datasets', icon: Database },
  { id: 'symbols', label: 'Symbols', icon: CircleDollarSign },
  { id: 'strategies', label: 'Strategies', icon: GitBranch }
]

const PAGE_COPY: Record<DashboardTab, { title: string; description: string }> = {
  dashboard: {
    title: 'Dashboard',
    description: 'Resume a session or start a new backtest from an imported dataset.'
  },
  sessions: {
    title: 'Sessions',
    description: 'All saved backtesting sessions — open, review, or clean up.'
  },
  datasets: {
    title: 'Datasets',
    description: 'Imported CSV candle history used to drive replay sessions.'
  },
  symbols: {
    title: 'Symbols',
    description: 'Contract size, spread, and commission defaults for paper fills.'
  },
  strategies: {
    title: 'Strategies',
    description: 'Tag sessions so you can compare results by approach.'
  }
}

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
      className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-colors ${
        active
          ? 'bg-zinc-800/70 text-zinc-100 shadow-sm shadow-black/15'
          : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
      }`}
    >
      <Icon className="h-4 w-4 opacity-80" aria-hidden />
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

  const page = PAGE_COPY[dashboardTab] ?? PAGE_COPY.dashboard

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
      <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.05] px-5 py-4">
        <img src={iconUrl} alt="" className="h-8 w-8 rounded-lg" aria-hidden />
        <span className="text-[15px] font-semibold tracking-tight text-zinc-100">BarReplay</span>

        <nav className="ml-6 flex items-center gap-1" aria-label="Main navigation">
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
          href="https://github.com/eclipse005/BarReplay"
          target="_blank"
          rel="noopener noreferrer"
          title="BarReplay on GitHub"
          className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-300"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-7">
        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-100">{page.title}</h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{page.description}</p>
          </div>
          {content}
        </div>
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
