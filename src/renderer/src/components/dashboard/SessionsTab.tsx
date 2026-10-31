import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Info, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import SoftButton from '@/components/ui/SoftButton'
import SoftCard from '@/components/ui/SoftCard'
import SoftEmpty from '@/components/ui/SoftEmpty'
import { SoftSelect, SoftTextarea } from '@/components/ui/SoftInput'
import { cn } from '@/components/ui/cn'
import { softSpace, softType } from '@/components/ui/softTokens'
import { idbGet } from '@/lib/importIdb'
import {
  computeSessionAnalytics,
  daysRemaining,
  formatRiskRewardRatio,
  formatShortDate,
  type PeriodBucket
} from '@/lib/sessionAnalytics'
import { clearSessionNote, getSessionNote, setSessionNote } from '@/lib/sessionNotes'
import { formatPnl } from '@/lib/paperTrade'
import { formatPnlCcy, quoteCurrencyForSymbol } from '@shared/pnlCurrency'
import type { ImportedDatasetMeta } from '@shared/importTypes'
import { useSessionStore } from '@/store/sessionStore'
import { useStrategiesStore } from '@/store/strategiesStore'

/** Testing → Sessions: FXR-style picker, overview, charts, metric chips (local only). */
export default function SessionsTab({
  onNewSession
}: {
  onNewSession: () => void
  /** @deprecated kept for callers that still pass summary */
  summary?: boolean
}): ReactNode {
  const sessions = useSessionStore((s) => s.sessions)
  const loadSession = useSessionStore((s) => s.loadSession)
  const deleteSession = useSessionStore((s) => s.deleteSession)
  const strategies = useStrategiesStore((s) => s.strategies)

  const ordered = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions]
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected =
    ordered.find((s) => s.id === selectedId) ?? ordered[0] ?? null

  useEffect(() => {
    if (!selected) {
      setSelectedId(null)
      return
    }
    if (selectedId !== selected.id) setSelectedId(selected.id)
  }, [selected, selectedId])

  const [note, setNote] = useState('')
  const [editingNote, setEditingNote] = useState(false)
  const [datasetMeta, setDatasetMeta] = useState<ImportedDatasetMeta | null>(null)

  useEffect(() => {
    if (!selected) {
      setNote('')
      setEditingNote(false)
      return
    }
    setNote(getSessionNote(selected.id))
    setEditingNote(false)
  }, [selected?.id])

  useEffect(() => {
    let cancelled = false
    async function loadMeta(): Promise<void> {
      if (!selected?.importId) {
        if (!cancelled) setDatasetMeta(null)
        return
      }
      const meta = await idbGet<ImportedDatasetMeta>('metas', selected.importId)
      if (!cancelled) setDatasetMeta(meta)
    }
    void loadMeta()
    return () => {
      cancelled = true
    }
  }, [selected?.importId])

  const analytics = useMemo(
    () => computeSessionAnalytics(selected),
    [selected]
  )

  const strategyName = selected?.strategyId
    ? strategies.find((s) => s.id === selected.strategyId)?.name ?? null
    : null

  const remaining = daysRemaining(
    selected?.replayTime,
    datasetMeta?.lastTime ??
      (selected?.timeframe
        ? datasetMeta?.timeframes?.[selected.timeframe]?.lastTime
        : undefined) ??
      datasetMeta?.timeframes?.['1m']?.lastTime,
    datasetMeta?.firstTime ??
      (selected?.timeframe
        ? datasetMeta?.timeframes?.[selected.timeframe]?.firstTime
        : undefined) ??
      datasetMeta?.timeframes?.['1m']?.firstTime
  )

  const rangeLabel = useMemo(() => {
    if (!datasetMeta) return null
    const tf = selected?.timeframe
    const first =
      (tf ? datasetMeta.timeframes?.[tf]?.firstTime : undefined) ??
      datasetMeta.firstTime ??
      datasetMeta.timeframes?.['1m']?.firstTime
    const last =
      (tf ? datasetMeta.timeframes?.[tf]?.lastTime : undefined) ??
      datasetMeta.lastTime ??
      datasetMeta.timeframes?.['1m']?.lastTime
    if (first == null || last == null) return null
    return `${formatShortDate(first)} – ${formatShortDate(last)}`
  }, [datasetMeta, selected?.timeframe])

  const quote = selected ? quoteCurrencyForSymbol(selected.symbol) : 'USD'

  if (ordered.length === 0) {
    return (
      <section className={softSpace.sectionGap}>
        <div className="flex items-center justify-between gap-3">
          <h2 className={softType.section}>Sessions</h2>
          <SoftButton variant="primary" onClick={onNewSession}>
            <Plus className="h-5 w-5" aria-hidden />
            New session
          </SoftButton>
        </div>
        <SoftEmpty>
          No sessions yet — create one from a dataset to start replaying candles.
        </SoftEmpty>
      </section>
    )
  }

  return (
    <section className={softSpace.sectionGap}>
      {/* Picker + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <SoftSelect
          aria-label="Select session"
          className="h-11 min-w-[16rem] flex-1 text-body"
          value={selected?.id ?? ''}
          onChange={(e) => setSelectedId(e.target.value || null)}
        >
          {ordered.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.symbol}
            </option>
          ))}
        </SoftSelect>
        <SoftButton variant="primary" onClick={onNewSession}>
          <Plus className="h-5 w-5" aria-hidden />
          New session
        </SoftButton>
        {selected ? (
          <SoftButton
            variant="danger"
            size="md"
            aria-label={`Delete session ${selected.name}`}
            onClick={() => {
              if (
                typeof window !== 'undefined' &&
                !window.confirm(`Delete session “${selected.name}”? This cannot be undone.`)
              ) {
                return
              }
              clearSessionNote(selected.id)
              deleteSession(selected.id)
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete session
          </SoftButton>
        ) : null}
      </div>

      {selected ? (
        <>
          {/* Overview + Description */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <SoftCard elevated className={cn(softSpace.cardPad, 'flex flex-col gap-5')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className={cn(softType.cardTitle, 'truncate text-zinc-50')}>
                    {selected.name}
                  </h2>
                  <p className={cn('mt-1.5', softType.caption)}>
                    {selected.symbol} · {selected.timeframe}
                    {strategyName ? ` · ${strategyName}` : ''}
                    {rangeLabel ? ` · ${rangeLabel}` : ''}
                  </p>
                </div>
                {remaining != null ? (
                  <span className="inline-flex items-center rounded-full bg-primary-500/15 px-3 py-1 text-caption font-medium text-primary-300">
                    {remaining} day{remaining === 1 ? '' : 's'} remaining
                  </span>
                ) : null}
              </div>

              <div>
                <p className={softType.caption}>Account balance</p>
                <p className={cn('mt-2', softType.metric, 'text-zinc-50')}>
                  {formatPnlCcy(analytics.balance, quote).replace(/^[+-]/, '')}
                </p>
              </div>

              <SoftButton
                variant="primary"
                size="md"
                className="self-start"
                onClick={() => void loadSession(selected.id)}
              >
                <Play className="h-5 w-5 fill-current" aria-hidden />
                Go to chart
              </SoftButton>
            </SoftCard>

            <SoftCard elevated className={cn(softSpace.cardPad, 'flex min-h-[12rem] flex-col')}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className={softType.cardTitle}>Description</h3>
                <button
                  type="button"
                  className="rounded-xl p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
                  aria-label={editingNote ? 'Done editing description' : 'Edit description'}
                  onClick={() => {
                    if (editingNote) {
                      setSessionNote(selected.id, note)
                      setEditingNote(false)
                    } else {
                      setEditingNote(true)
                    }
                  }}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
              </div>
              {editingNote ? (
                <SoftTextarea
                  className="min-h-[8rem] flex-1 text-body"
                  value={note}
                  placeholder="Notes for this session…"
                  onChange={(e) => setNote(e.target.value)}
                  onBlur={() => setSessionNote(selected.id, note)}
                />
              ) : (
                <p
                  className={cn(
                    'flex-1 whitespace-pre-wrap',
                    softType.body,
                    note ? 'text-zinc-300' : 'text-zinc-600'
                  )}
                >
                  {note || 'Add a short description for this session.'}
                </p>
              )}
            </SoftCard>
          </div>

          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-3">
            <ChartCard title="Equity">
              <EquitySparkline points={analytics.equity.map((p) => p.equity)} />
            </ChartCard>
            <ChartCard title="Monthly Performance">
              <BarSparkline buckets={analytics.monthly} positiveClass="from-emerald-600 via-emerald-400 to-emerald-200" />
            </ChartCard>
            <ChartCard title="Daily Performance">
              <BarSparkline
                buckets={analytics.daily}
                positiveClass="from-sky-600 via-sky-400 to-sky-200"
                shortLabels
              />
            </ChartCard>
          </div>

          {/* Metric chips */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <MetricChip
              label="Total PnL"
              value={formatPnlCcy(analytics.totalPnl, quote)}
              tone={analytics.totalPnl >= 0 ? 'up' : 'down'}
            />
            <MetricChip
              label="Win Rate"
              value={
                analytics.winRate == null
                  ? '—'
                  : `${Math.round(analytics.winRate * 1000) / 10}%`
              }
            />
            <MetricChip
              label="Risk/Reward"
              value={formatRiskRewardRatio(analytics.riskReward)}
            />
            <MetricChip
              label="Month Gain/Loss"
              value={formatPnl(analytics.monthPnl)}
              tone={chipTone(analytics.monthPnl)}
            />
            <MetricChip
              label="Week Gain/Loss"
              value={formatPnl(analytics.weekPnl)}
              tone={chipTone(analytics.weekPnl)}
            />
            <MetricChip
              label="Daily Gain/Loss"
              value={formatPnl(analytics.dayPnl)}
              tone={chipTone(analytics.dayPnl)}
            />
          </div>
        </>
      ) : null}
    </section>
  )
}

function chipTone(n: number): 'up' | 'down' | 'neutral' {
  if (n > 0) return 'up'
  if (n < 0) return 'down'
  return 'neutral'
}

function ChartCard({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <SoftCard className={cn(softSpace.cardPad, 'flex min-h-[240px] flex-col')}>
      <h3 className={cn(softType.cardTitle, 'mb-4')}>{title}</h3>
      <div className="flex min-h-0 flex-1 flex-col justify-end">{children}</div>
    </SoftCard>
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
    <SoftCard elevated className={cn(softSpace.cardPadSm, 'min-w-0')}>
      <div className={cn('flex items-center gap-1.5', softType.caption)}>
        {label}
        <Info className="h-3.5 w-3.5 opacity-50" aria-hidden />
      </div>
      <p
        className={cn(
          'mt-3 truncate text-[1.375rem] font-semibold tabular-nums tracking-tight',
          tone === 'up' && 'text-emerald-400',
          tone === 'down' && 'text-red-400',
          tone === 'neutral' && 'text-zinc-50'
        )}
      >
        {value}
      </p>
    </SoftCard>
  )
}

function EquitySparkline({ points }: { points: number[] }): ReactNode {
  if (points.length === 0) {
    return (
      <p className={cn('flex flex-1 items-center justify-center text-center', softType.caption)}>
        Equity builds as you close trades in this session.
      </p>
    )
  }
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = Math.max(1e-9, max - min)
  const w = 320
  const h = 140
  const pad = 8
  const coords = points.map((v, i) => {
    const x = pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / span) * (h - pad * 2)
    return `${x},${y}`
  })
  const last = points[points.length - 1] ?? 0
  const up = last >= (points[0] ?? 0)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" role="img" aria-label="Equity curve">
      {[0.25, 0.5, 0.75].map((t) => (
        <line
          key={t}
          x1={pad}
          x2={w - pad}
          y1={pad + t * (h - pad * 2)}
          y2={pad + t * (h - pad * 2)}
          stroke="currentColor"
          className="text-zinc-700"
          strokeDasharray="4 6"
          strokeWidth={1}
        />
      ))}
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

function BarSparkline({
  buckets,
  positiveClass,
  shortLabels = false
}: {
  buckets: PeriodBucket[]
  positiveClass: string
  shortLabels?: boolean
}): ReactNode {
  const maxAbs = Math.max(1, ...buckets.map((b) => Math.abs(b.pnl)))
  const hasData = buckets.some((b) => b.pnl !== 0)
  if (!hasData) {
    return (
      <p className={cn('flex flex-1 items-center justify-center text-center', softType.caption)}>
        Bars fill from closed trades in this session.
      </p>
    )
  }
  return (
    <div className="flex h-full min-h-[10rem] items-end gap-2 px-1 pb-1 pt-2">
      {buckets.map((b) => {
        const height = Math.max(b.pnl === 0 ? 0 : 6, Math.round((Math.abs(b.pnl) / maxAbs) * 100))
        const label = shortLabels ? b.label.slice(0, 3) : b.label
        const up = b.pnl >= 0
        return (
          <div key={b.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-36 w-full items-end justify-center">
              <div
                className={cn(
                  'w-[70%] max-w-[2.75rem] rounded-t-lg bg-gradient-to-t shadow-[0_0_14px_rgba(0,0,0,0.25)]',
                  up ? positiveClass : 'from-red-700 via-red-500 to-red-300'
                )}
                style={{ height: `${height}%` }}
                title={`${b.label}: ${formatPnl(b.pnl)}`}
              />
            </div>
            <span className={cn('truncate', softType.micro)}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

