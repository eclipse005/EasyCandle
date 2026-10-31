import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Info,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2
} from 'lucide-react'
import SoftButton from '@/components/ui/SoftButton'
import SoftConfirmDialog from '@/components/ui/SoftConfirmDialog'
import SoftCard from '@/components/ui/SoftCard'
import SoftEmpty from '@/components/ui/SoftEmpty'
import { SoftInput, SoftSelect, SoftTextarea } from '@/components/ui/SoftInput'
import { cn } from '@/components/ui/cn'
import { softMotion, softSpace, softType } from '@/components/ui/softTokens'
import { idbGet } from '@/lib/importIdb'
import {
  computeSessionAnalytics,
  daysRemaining,
  formatRiskRewardRatio,
} from '@/lib/sessionAnalytics'
import { formatAccountShortDate } from '@/lib/displayTime'
import { clearSessionNote, getSessionNote, setSessionNote } from '@/lib/sessionNotes'
import { formatPnl, summarizeSession } from '@/lib/paperTrade'
import { formatPnlCcy, quoteCurrencyForSymbol } from '@shared/pnlCurrency'
import type { ImportedDatasetMeta } from '@shared/importTypes'
import { useAccountPrefsStore } from '@/store/accountPrefsStore'
import { useSessionStore, type Session } from '@/store/sessionStore'
import { useStrategiesStore } from '@/store/strategiesStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { useT } from '@/i18n/useT'
import PeriodBarChart from '@/components/dashboard/PeriodBarChart'

type SortOrder = 'newest' | 'oldest'

/** Testing → Sessions: FXR-style search, sort, expandable cards. */
export default function SessionsTab({
  onNewSession
}: {
  onNewSession: () => void
  /** @deprecated kept for callers that still pass summary */
  summary?: boolean
}): ReactNode {
  const { t } = useT()
  const sessions = useSessionStore((s) => s.sessions)
  const loadSession = useSessionStore((s) => s.loadSession)
  const deleteSession = useSessionStore((s) => s.deleteSession)
  const duplicateSession = useSessionStore((s) => s.duplicateSession)
  const renameSession = useSessionStore((s) => s.renameSession)
  const strategies = useStrategiesStore((s) => s.strategies)
  const setTestingTab = useUiLayoutStore((s) => s.setTestingTab)
  const setPreviewSessionReport = useUiLayoutStore((s) => s.setPreviewSessionReport)

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortOrder>('newest')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Session | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = [...sessions]
    if (q) {
      list = list.filter((s) => {
        const strat = s.strategyId
          ? strategies.find((st) => st.id === s.strategyId)?.name ?? ''
          : ''
        return (
          s.name.toLowerCase().includes(q) ||
          s.symbol.toLowerCase().includes(q) ||
          s.timeframe.toLowerCase().includes(q) ||
          strat.toLowerCase().includes(q)
        )
      })
    }
    list.sort((a, b) =>
      sort === 'newest' ? b.updatedAt - a.updatedAt : a.updatedAt - b.updatedAt
    )
    return list
  }, [sessions, query, sort, strategies])

  useEffect(() => {
    if (expandedId && !filtered.some((s) => s.id === expandedId)) {
      setExpandedId(filtered[0]?.id ?? null)
    } else if (!expandedId && filtered.length === 1) {
      setExpandedId(filtered[0].id)
    }
  }, [filtered, expandedId])

  if (sessions.length === 0) {
    return (
      <section className={softSpace.sectionGap}>
        <div className="flex items-center justify-between gap-3">
          <h2 className={softType.section}>{t('sessions.title')}</h2>
          <SoftButton variant="primary" onClick={onNewSession}>
            <Plus className="h-5 w-5" aria-hidden />
            {t('sessions.new')}
          </SoftButton>
        </div>
        <SoftEmpty>
          {t('sessions.empty')}
        </SoftEmpty>
      </section>
    )
  }

  return (
    <section className={softSpace.sectionGap}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[14rem] flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
            aria-hidden
          />
          <SoftInput
            className="h-11 pl-10 text-body"
            placeholder={t('sessions.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('sessions.search')}
          />
        </label>
        <SoftSelect
          className="h-11 min-w-[12rem] text-body"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOrder)}
          aria-label={t('sessions.sortAria')}
        >
          <option value="newest">{t('sessions.newest')}</option>
          <option value="oldest">{t('sessions.oldest')}</option>
        </SoftSelect>
        <SoftButton variant="primary" onClick={onNewSession}>
          <Plus className="h-5 w-5" aria-hidden />
          {t('sessions.new')}
        </SoftButton>
      </div>

      {filtered.length === 0 ? (
        <SoftEmpty>No sessions match “{query.trim()}”.</SoftEmpty>
      ) : (
        <div className="space-y-4">
          {filtered.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              expanded={expandedId === session.id}
              onToggle={() =>
                setExpandedId((id) => (id === session.id ? null : session.id))
              }
              strategyName={
                session.strategyId
                  ? strategies.find((s) => s.id === session.strategyId)?.name ?? null
                  : null
              }
              editingNotes={editingNotesId === session.id}
              onToggleNotes={() =>
                setEditingNotesId((id) => (id === session.id ? null : session.id))
              }
              renaming={renamingId === session.id}
              renameDraft={renamingId === session.id ? renameDraft : session.name}
              onStartRename={() => {
                setRenamingId(session.id)
                setRenameDraft(session.name)
              }}
              onRenameDraft={setRenameDraft}
              onCommitRename={() => {
                renameSession(session.id, renameDraft)
                setRenamingId(null)
              }}
              onCancelRename={() => setRenamingId(null)}
              onGoChart={() => void loadSession(session.id)}
              onSummary={() => {
                const trades = session.closedTrades ?? []
                setPreviewSessionReport({
                  symbol: session.symbol,
                  timeframe: session.timeframe,
                  trades,
                  summary: summarizeSession(trades),
                  closedOpenOnExit: false,
                  startingBalance: session.startingBalance
                })
              }}
              onAnalytics={() => setTestingTab('analytics')}
              onDuplicate={() => {
                const id = duplicateSession(session.id)
                if (id) setExpandedId(id)
              }}
              onDelete={() => setPendingDelete(session)}
            />
          ))}
        </div>
      )}

      <SoftConfirmDialog
        open={pendingDelete != null}
        title={t('sessions.deleteTitle')}
        description={
          pendingDelete
            ? t('sessions.deleteBody', { name: pendingDelete.name })
            : undefined
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return
          clearSessionNote(pendingDelete.id)
          deleteSession(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
    </section>
  )
}

function SessionCard({
  session,
  expanded,
  onToggle,
  strategyName,
  editingNotes,
  onToggleNotes,
  renaming,
  renameDraft,
  onStartRename,
  onRenameDraft,
  onCommitRename,
  onCancelRename,
  onGoChart,
  onSummary,
  onAnalytics,
  onDuplicate,
  onDelete
}: {
  session: Session
  expanded: boolean
  onToggle: () => void
  strategyName: string | null
  editingNotes: boolean
  onToggleNotes: () => void
  renaming: boolean
  renameDraft: string
  onStartRename: () => void
  onRenameDraft: (v: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  onGoChart: () => void
  onSummary: () => void
  onAnalytics: () => void
  onDuplicate: () => void
  onDelete: () => void
}): ReactNode {
  const { t, locale } = useT()
  const [note, setNote] = useState(() => getSessionNote(session.id))
  const [datasetMeta, setDatasetMeta] = useState<ImportedDatasetMeta | null>(null)

  useEffect(() => {
    setNote(getSessionNote(session.id))
  }, [session.id])

  useEffect(() => {
    let cancelled = false
    async function loadMeta(): Promise<void> {
      if (!session.importId) {
        if (!cancelled) setDatasetMeta(null)
        return
      }
      const meta = await idbGet<ImportedDatasetMeta>('metas', session.importId)
      if (!cancelled) setDatasetMeta(meta)
    }
    void loadMeta()
    return () => {
      cancelled = true
    }
  }, [session.importId])

  const accountTimezone = useAccountPrefsStore((s) => s.accountTimezone)
  const analytics = useMemo(() => computeSessionAnalytics(session, Date.now(), accountTimezone), [session, accountTimezone])
  const quote = quoteCurrencyForSymbol(session.symbol)
  const remaining = daysRemaining(
    session.replayTime,
    datasetMeta?.lastTime ??
      (session.timeframe
        ? datasetMeta?.timeframes?.[session.timeframe]?.lastTime
        : undefined) ??
      datasetMeta?.timeframes?.['1m']?.lastTime,
    datasetMeta?.firstTime ??
      (session.timeframe
        ? datasetMeta?.timeframes?.[session.timeframe]?.firstTime
        : undefined) ??
      datasetMeta?.timeframes?.['1m']?.firstTime
  )

  const rangeLabel = useMemo(() => {
    if (!datasetMeta) return null
    const tf = session.timeframe
    const first =
      (tf ? datasetMeta.timeframes?.[tf]?.firstTime : undefined) ??
      datasetMeta.firstTime ??
      datasetMeta.timeframes?.['1m']?.firstTime
    const last =
      (tf ? datasetMeta.timeframes?.[tf]?.lastTime : undefined) ??
      datasetMeta.lastTime ??
      datasetMeta.timeframes?.['1m']?.lastTime
    if (first == null || last == null) return null
    const loc = locale === 'zh' ? 'zh-CN' : 'en-US'
    return `${formatAccountShortDate(first, accountTimezone, loc)} – ${formatAccountShortDate(last, accountTimezone, loc)}`
  }, [datasetMeta, session.timeframe, accountTimezone, locale])

  return (
    <SoftCard elevated className="overflow-hidden">
      <div className={cn(softSpace.cardPadSm, 'flex flex-col gap-4')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <div className="flex flex-wrap items-center gap-2">
                <SoftInput
                  className="h-11 max-w-md flex-1 text-body"
                  value={renameDraft}
                  onChange={(e) => onRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onCommitRename()
                    if (e.key === 'Escape') onCancelRename()
                  }}
                  aria-label={t('sessions.nameAria')}
                  autoFocus
                />
                <SoftButton size="sm" variant="primary" onClick={onCommitRename}>
                  {t('sessions.save')}
                </SoftButton>
                <SoftButton size="sm" variant="ghost" onClick={onCancelRename}>
                  {t('sessions.cancel')}
                </SoftButton>
              </div>
            ) : (
              <h2 className={cn(softType.cardTitle, 'truncate text-zinc-50')}>{session.name}</h2>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cn(softType.caption, 'whitespace-nowrap text-zinc-300')}>
                {session.symbol}
              </span>
              <span className="text-zinc-600" aria-hidden>
                ·
              </span>
              <span className={cn(softType.caption, 'whitespace-nowrap')}>{session.timeframe}</span>
              {strategyName ? (
                <>
                  <span className="text-zinc-600" aria-hidden>
                    ·
                  </span>
                  <span className={cn(softType.caption, 'whitespace-nowrap')}>{strategyName}</span>
                </>
              ) : null}
              {rangeLabel ? (
                <>
                  <span className="text-zinc-600" aria-hidden>
                    ·
                  </span>
                  <span className={cn(softType.caption, 'whitespace-nowrap tabular-nums')}>
                    {rangeLabel}
                  </span>
                </>
              ) : null}
              {remaining != null ? (
                <>
                  <span className="text-zinc-600" aria-hidden>
                    ·
                  </span>
                  <span className={cn(softType.caption, 'whitespace-nowrap')}>
                    {remaining === 1
                      ? t('sessions.daysRemaining', { count: remaining })
                      : t('sessions.daysRemainingPlural', { count: remaining })}
                  </span>
                </>
              ) : null}
            </div>
            <p className={cn('mt-3', softType.caption)}>
              {t('sessions.balance')}{' '}
              <span className="whitespace-nowrap text-body font-semibold tabular-nums text-zinc-100">
                {formatPnlCcy(analytics.balance, quote).replace(/^[+-]/, '')}
              </span>
              <span className="mx-2 text-zinc-700" aria-hidden>
                ·
              </span>
              {t('sessions.pnl')}{' '}
              <span
                className={cn(
                  'whitespace-nowrap text-body font-semibold tabular-nums',
                  analytics.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                )}
              >
                {formatPnlCcy(analytics.totalPnl, quote)}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SoftButton
              variant="primary"
              size="sm"
              aria-label={`Go to chart for ${session.name}`}
              disabled={!session.importId || datasetMeta == null}
              title={
                !session.importId || datasetMeta == null
                  ? t('sessions.noMarketData')
                  : undefined
              }
              onClick={onGoChart}
            >
              <Play className="h-4 w-4 fill-current" aria-hidden />
              {t('sessions.goToChart')}
            </SoftButton>
            <SoftButton size="sm" variant="secondary" onClick={onSummary} aria-label={t('sessions.summary')}>
              <FileText className="h-4 w-4" aria-hidden />
              {t('sessions.summary')}
            </SoftButton>
            <SoftButton size="sm" variant="secondary" onClick={onAnalytics} aria-label={t('sessions.analyticsAria')}>
              <BarChart3 className="h-4 w-4" aria-hidden />
            </SoftButton>
            <SoftButton
              size="sm"
              variant="secondary"
              onClick={onStartRename}
              aria-label={t('sessions.renameAria')}
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </SoftButton>
            <SoftButton
              size="sm"
              variant="secondary"
              onClick={onToggleNotes}
              aria-label={t('sessions.notesAria')}
            >
              {t('sessions.notes')}
            </SoftButton>
            <SoftButton
              size="sm"
              variant="secondary"
              onClick={onDuplicate}
              aria-label={t('sessions.duplicateAria')}
            >
              <Copy className="h-4 w-4" aria-hidden />
            </SoftButton>
            <SoftButton
              size="sm"
              variant="ghost"
              onClick={onDelete}
              aria-label={t('sessions.deleteAria')}
              className="text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </SoftButton>
            <SoftButton
              size="sm"
              variant="ghost"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-label={expanded ? t('sessions.collapseAria') : t('sessions.expandAria')}
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronDown className="h-4 w-4" aria-hidden />
              )}
            </SoftButton>
          </div>
        </div>

        {editingNotes ? (
          <SoftTextarea
            className="min-h-[6rem] text-body"
            value={note}
            placeholder={t('sessions.notesPlaceholder')}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => setSessionNote(session.id, note)}
          />
        ) : null}

        <div
          className={cn(
            'grid',
            softMotion.expandGrid,
            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          )}
        >
          <div className="overflow-hidden">
            <div
              className={cn(
                'space-y-5 border-t border-white/[0.06] pt-5',
                'transition-opacity duration-[var(--motion-expand)] ease-[var(--ease-out)]',
                expanded ? 'opacity-100' : 'opacity-0'
              )}
            >
              <div className="grid gap-4 lg:grid-cols-3">
                <MiniChartCard title={t('sessions.equity')}>
                  <EquitySparkline points={analytics.equity.map((p) => p.equity)} />
                </MiniChartCard>
                <MiniChartCard title={t('sessions.monthly')}>
                  <PeriodBarChart
                    buckets={analytics.monthly}
                    mode="month"
                    emptyKey="charts.barsEmptySession"
                    positiveClass="from-emerald-600 via-emerald-400 to-emerald-200"
                    trackClassName="h-28"
                    barMaxClassName="max-w-[2.5rem]"
                    gapClassName="gap-1.5"
                  />
                </MiniChartCard>
                <MiniChartCard title={t('sessions.daily')}>
                  <PeriodBarChart
                    buckets={analytics.daily}
                    mode="weekday"
                    emptyKey="charts.barsEmptySession"
                    positiveClass="from-sky-600 via-sky-400 to-sky-200"
                    trackClassName="h-28"
                    barMaxClassName="max-w-[2.5rem]"
                    gapClassName="gap-1.5"
                  />
                </MiniChartCard>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <MetricChip
                  label={t('sessions.totalPnl')}
                  value={formatPnlCcy(analytics.totalPnl, quote)}
                  tone={analytics.totalPnl >= 0 ? 'up' : 'down'}
                />
                <MetricChip
                  label={t('sessions.winRate')}
                  value={
                    analytics.winRate == null
                      ? '—'
                      : `${Math.round(analytics.winRate * 1000) / 10}%`
                  }
                />
                <MetricChip label={t('sessions.riskReward')} value={formatRiskRewardRatio(analytics.riskReward)} />
                <MetricChip
                  label={t('sessions.month')}
                  value={formatPnl(analytics.monthPnl)}
                  tone={chipTone(analytics.monthPnl)}
                />
                <MetricChip
                  label={t('sessions.week')}
                  value={formatPnl(analytics.weekPnl)}
                  tone={chipTone(analytics.weekPnl)}
                />
                <MetricChip
                  label={t('sessions.day')}
                  value={formatPnl(analytics.dayPnl)}
                  tone={chipTone(analytics.dayPnl)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </SoftCard>
  )
}

function chipTone(n: number): 'up' | 'down' | 'neutral' {
  if (n > 0) return 'up'
  if (n < 0) return 'down'
  return 'neutral'
}

function MiniChartCard({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex min-h-[200px] flex-col rounded-2xl border border-white/[0.05] bg-zinc-950/40 px-4 py-4">
      <h3 className={cn(softType.caption, 'mb-3 text-zinc-400')}>{title}</h3>
      <div className="flex min-h-0 flex-1 flex-col justify-end">{children}</div>
    </div>
  )
}

function MetricChip({
  label,
  value,
  tone = 'neutral'
}: {
  label: string
  value: string
  tone?: 'up' | 'down' | 'neutral'
}): ReactNode {
  return (
    <div className="min-w-0 rounded-2xl border border-white/[0.05] bg-zinc-950/40 px-4 py-3">
      <div className={cn('flex items-center gap-1.5', softType.caption)}>
        {label}
        <Info className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
      </div>
      <p
        className={cn(
          'mt-2 whitespace-nowrap text-[clamp(1rem,1.6vw,1.25rem)] font-semibold tabular-nums tracking-tight',
          tone === 'up' && 'text-emerald-400',
          tone === 'down' && 'text-red-400',
          tone === 'neutral' && 'text-zinc-50'
        )}
        title={value}
      >
        {value}
      </p>
    </div>
  )
}

function EquitySparkline({ points }: { points: number[] }): ReactNode {
  const { t } = useT()
  if (points.length === 0) {
    return (
      <p className={cn('flex flex-1 items-center justify-center text-center', softType.caption)}>
        {t('sessions.equityEmpty')}
      </p>
    )
  }
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = Math.max(1e-9, max - min)
  const w = 320
  const h = 120
  const pad = 8
  const coords = points.map((v, i) => {
    const x = pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / span) * (h - pad * 2)
    return `${x},${y}`
  })
  const last = points[points.length - 1] ?? 0
  const up = last >= (points[0] ?? 0)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" role="img" aria-label={t('sessions.equityCurveAria')}>
      <polyline
        fill="none"
        stroke={up ? '#34d399' : '#f87171'}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={coords.join(' ')}
      />
    </svg>
  )
}

