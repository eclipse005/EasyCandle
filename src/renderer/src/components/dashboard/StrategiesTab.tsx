import { useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Filter,
  Plus,
  Search,
  Trash2,
  X
} from 'lucide-react'
import SoftButton from '@/components/ui/SoftButton'
import SoftCard from '@/components/ui/SoftCard'
import SoftDialog from '@/components/ui/SoftDialog'
import SoftConfirmDialog from '@/components/ui/SoftConfirmDialog'
import SoftEmpty from '@/components/ui/SoftEmpty'
import SoftLabel from '@/components/ui/SoftLabel'
import { SoftInput } from '@/components/ui/SoftInput'
import { cn } from '@/components/ui/cn'
import { softMotion, softNav, softType } from '@/components/ui/softTokens'
import {
  averageRiskReward,
  drawdownSeries,
  formatRiskRewardRatio
} from '@/lib/sessionAnalytics'
import { equityCurve, sideReport, type ClosedTrade } from '@/lib/paperTrade'
import { useSessionStore } from '@/store/sessionStore'
import { useStrategiesStore, type Strategy } from '@/store/strategiesStore'
import { useT } from '@/i18n/useT'

type StrategyPerf = {
  trades: ClosedTrade[]
  winRate: number | null
  tradeCount: number
  maxDdPct: number | null
  rr: number | null
  equityPoints: number[]
  hasData: boolean
  incomplete: boolean
}

function useStrategyPerf(strategyId: string): StrategyPerf {
  const sessions = useSessionStore((s) => s.sessions)
  return useMemo(() => {
    const tagged = sessions.filter((x) => x.strategyId === strategyId)
    const trades = tagged.flatMap((s) => s.closedTrades ?? [])
    const hasData = trades.length > 0
    if (!hasData) {
      return {
        trades,
        winRate: null,
        tradeCount: 0,
        maxDdPct: null,
        rr: null,
        equityPoints: [],
        hasData: false,
        incomplete: tagged.length === 0
      }
    }
    const summary = sideReport(trades)
    // Aggregate equity across sessions: start from first session balance (or 100k),
    // then apply all closed trades in exit-time order.
    const start =
      tagged.find((s) => Number.isFinite(s.startingBalance) && s.startingBalance > 0)
        ?.startingBalance ?? 100000
    const curve = equityCurve(start, trades)
    const dd = drawdownSeries(start, trades)
    return {
      trades,
      winRate: summary.winRate,
      tradeCount: summary.count,
      maxDdPct: dd.maxDrawdownPct,
      rr: averageRiskReward(trades),
      equityPoints: curve.map((p) => p.equity),
      hasData: true,
      incomplete: false
    }
  }, [sessions, strategyId])
}

function formatWinRate(wr: number | null): string {
  if (wr == null || !Number.isFinite(wr)) return '—'
  return `${Math.round(wr * 100)}%`
}

function formatMaxDd(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct) || pct <= 0) return '—'
  const v = Math.round(pct * 1000) / 10
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}%`
}

/** Blue filled equity sparkline — FXR Strategies card style. */
function StrategyEquitySparkline({ points }: { points: number[] }): ReactNode {
  const { t } = useT()
  if (points.length < 2) {
    return (
      <p className={cn('flex h-full items-center justify-center text-center', softType.caption)}>
        {t('strategies.noPerf')}
      </p>
    )
  }
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = Math.max(1e-9, max - min)
  const w = 360
  const h = 120
  const padX = 4
  const padY = 10
  const coords = points.map((v, i) => {
    const x = padX + (i / Math.max(1, points.length - 1)) * (w - padX * 2)
    const y = padY + (1 - (v - min) / span) * (h - padY * 2)
    return [x, y] as const
  })
  const line = coords.map(([x, y]) => `${x},${y}`).join(' ')
  const area = [
    `${coords[0][0]},${h}`,
    ...coords.map(([x, y]) => `${x},${y}`),
    `${coords[coords.length - 1][0]},${h}`
  ].join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" role="img" aria-label="Equity curve">
      <defs>
        <linearGradient id="stratEqFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(56 120 253)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="rgb(56 120 253)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon fill="url(#stratEqFill)" points={area} />
      <polyline
        fill="none"
        stroke="rgb(56 120 253)"
        strokeWidth={2.25}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={line}
      />
    </svg>
  )
}

function MetricChip({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.05] bg-zinc-950/55 px-2.5 py-2">
      <div className={cn(softType.micro, 'whitespace-nowrap text-zinc-500')}>{label}</div>
      <div className="mt-1 whitespace-nowrap text-caption font-semibold tabular-nums text-zinc-100">
        {value}
      </div>
    </div>
  )
}

function StrategyCard({
  strategy,
  onDelete
}: {
  strategy: Strategy
  onDelete: () => void
}): ReactNode {
  const { t } = useT()
  const rename = useStrategiesStore((s) => s.rename)
  const perf = useStrategyPerf(strategy.id)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(strategy.name)

  return (
    <SoftCard
      elevated
      className={cn(
        'group relative flex min-h-[280px] flex-col gap-4 overflow-hidden px-5 py-5',
        softMotion.colorsFast
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <SoftInput
              className="h-10 text-body font-semibold"
              value={draft}
              autoFocus
              aria-label="Strategy name"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                rename(strategy.id, draft)
                setEditing(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  rename(strategy.id, draft)
                  setEditing(false)
                }
                if (e.key === 'Escape') {
                  setDraft(strategy.name)
                  setEditing(false)
                }
              }}
            />
          ) : (
            <button
              type="button"
              className={cn(
                'flex max-w-full items-center gap-2 text-left',
                softType.cardTitle,
                'truncate text-zinc-50 hover:text-primary-300',
                softMotion.colorsFast
              )}
              onClick={() => {
                setDraft(strategy.name)
                setEditing(true)
              }}
              title="Rename strategy"
            >
              <span className="truncate">{strategy.name}</span>
              {perf.incomplete ? (
                <AlertTriangle
                  className="h-4 w-4 shrink-0 text-amber-400"
                  aria-label="No sessions tagged yet"
                />
              ) : null}
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500"
            title="Performance"
            aria-hidden
          >
            <BarChart3 className="h-4 w-4" />
          </span>
          <SoftButton
            size="sm"
            variant="ghost"
            aria-label={`Delete strategy ${strategy.name}`}
            onClick={onDelete}
            className="!h-8 !w-8 !px-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:!text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </SoftButton>
        </div>
      </div>

      {!perf.hasData ? (
        <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/[0.06] bg-zinc-950/60 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" aria-hidden />
          <span className={cn(softType.micro, 'text-zinc-400')}>{t('strategies.noData')}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricChip label={t('strategies.winRate')} value={formatWinRate(perf.winRate)} />
        <MetricChip
          label={t('strategies.trades')}
          value={perf.hasData ? String(perf.tradeCount) : '—'}
        />
        <MetricChip label={t('strategies.maxDd')} value={formatMaxDd(perf.maxDdPct)} />
        <MetricChip label={t('strategies.rr')} value={formatRiskRewardRatio(perf.rr)} />
      </div>

      <div className="mt-auto min-h-[7.5rem] flex-1 rounded-xl border border-white/[0.04] bg-zinc-950/35 px-2 py-2">
        {perf.hasData ? (
          <StrategyEquitySparkline points={perf.equityPoints} />
        ) : (
          <p
            className={cn(
              'flex h-full min-h-[6.5rem] items-center justify-center text-center',
              softType.caption
            )}
          >
            {t('strategies.noPerf')}
          </p>
        )}
      </div>
    </SoftCard>
  )
}

/** Strategies page — FXR-style card grid (local tags + session-derived stats). */
export default function StrategiesTab(): ReactNode {
  const { t } = useT()
  const strategies = useStrategiesStore((s) => s.strategies)
  const add = useStrategiesStore((s) => s.add)
  const remove = useStrategiesStore((s) => s.remove)

  const [createOpen, setCreateOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Strategy | null>(null)
  const [newName, setNewName] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sortAlpha, setSortAlpha] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = [...strategies]
    if (q) list = list.filter((s) => s.name.toLowerCase().includes(q))
    if (sortAlpha) {
      list.sort((a, b) => a.name.localeCompare(b.name))
    } else {
      list.sort((a, b) => b.createdAt - a.createdAt)
    }
    return list
  }, [strategies, query, sortAlpha])

  const submitCreate = () => {
    const created = add(newName)
    if (created) {
      setNewName('')
      setCreateOpen(false)
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="relative flex items-center gap-6 border-b border-white/[0.06]"
          role="tablist"
          aria-label="Strategies sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected
            className={cn(
              'relative -mb-px pb-3.5',
              softType.tab,
              softNav.tabActive
            )}
          >
            {t('strategies.my')}
            <span className={softNav.tabUnderline} aria-hidden />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <SoftButton
            variant="secondary"
            size="sm"
            aria-label={searchOpen ? 'Hide search' : 'Search strategies'}
            aria-pressed={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
            className="!h-10 !w-10 !px-0"
          >
            <Search className="h-4 w-4" aria-hidden />
          </SoftButton>
          <SoftButton
            variant="secondary"
            size="sm"
            aria-label={sortAlpha ? 'Sort by newest' : 'Sort A–Z'}
            aria-pressed={sortAlpha}
            onClick={() => setSortAlpha((v) => !v)}
            className={cn('!h-10 !w-10 !px-0', sortAlpha && 'border-primary-500/40 text-zinc-100')}
          >
            <Filter className="h-4 w-4" aria-hidden />
          </SoftButton>
          <SoftButton variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-5 w-5" aria-hidden />
            {t('strategies.new')}
          </SoftButton>
        </div>
      </div>

      {searchOpen ? (
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
            aria-hidden
          />
          <SoftInput
            className="h-11 pl-10 pr-10 text-body"
            placeholder={t('strategies.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search strategies"
            autoFocus
          />
          {query ? (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              aria-label="Clear search"
              onClick={() => setQuery('')}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}

      {strategies.length === 0 ? (
        <SoftEmpty>{t('strategies.empty')}</SoftEmpty>
      ) : filtered.length === 0 ? (
        <SoftEmpty>{t('strategies.noMatch', { query: query.trim() })}</SoftEmpty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((strategy) => (
            <StrategyCard
              key={strategy.id}
              strategy={strategy}
              onDelete={() => setPendingDelete(strategy)}
            />
          ))}
        </div>
      )}

      <SoftConfirmDialog
        open={pendingDelete != null}
        title={t('strategies.deleteTitle')}
        description={
          pendingDelete
            ? t('strategies.deleteBody', { name: pendingDelete.name })
            : undefined
        }
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return
          remove(pendingDelete.id)
          setPendingDelete(null)
        }}
      />

      <SoftDialog
        open={createOpen}
        title={t('strategies.createTitle')}
        description={t('strategies.createHint')}
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <SoftButton variant="ghost" onClick={() => setCreateOpen(false)}>
              {t('strategies.cancel')}
            </SoftButton>
            <SoftButton
              variant="primary"
              disabled={!newName.trim()}
              onClick={submitCreate}
            >
              {t('strategies.create')}
            </SoftButton>
          </>
        }
      >
        <SoftLabel htmlFor="new-strategy-name" caption={t('strategies.name')}>
          <SoftInput
            id="new-strategy-name"
            className="mt-2 h-11 text-body"
            placeholder={t('strategies.namePlaceholder')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim()) submitCreate()
            }}
            autoFocus
          />
        </SoftLabel>
      </SoftDialog>
    </section>
  )
}
