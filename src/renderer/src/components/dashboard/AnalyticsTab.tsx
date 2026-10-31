import { useMemo, useState, type ReactNode } from 'react'
import SoftButton from '@/components/ui/SoftButton'
import SoftCard from '@/components/ui/SoftCard'
import SoftEmpty from '@/components/ui/SoftEmpty'
import { SoftInput, SoftSelect } from '@/components/ui/SoftInput'
import { cn } from '@/components/ui/cn'
import { softSpace, softType } from '@/components/ui/softTokens'
import { formatPnl, type ClosedTrade } from '@/lib/paperTrade'
import {
  analyticsDayBounds,
  analyticsTodayStartSec,
  averageRiskReward,
  drawdownSeries,
  expectancy,
  formatRiskRewardRatio,
  monthlyPnlBuckets,
  profitFactor,
  weekdayPnlBuckets,
  type PeriodBucket
} from '@/lib/sessionAnalytics'
import { chartTimezoneById, sessionUtcOffsetLabel } from '@/lib/chartTimezone'
import { useAccountPrefsStore } from '@/store/accountPrefsStore'
import { useSessionStore } from '@/store/sessionStore'
import { useStrategiesStore } from '@/store/strategiesStore'
import { formatWinRatePct } from '@/lib/localPerformance'
import { sideReport } from '@/lib/paperTrade'
import { useT } from '@/i18n/useT'

type SideFilter = 'all' | 'long' | 'short'
type OutcomeFilter = 'all' | 'win' | 'loss' | 'be'
type EntryTypeFilter = 'all' | 'market' | 'limit' | 'stop-limit'
type ViewMode = 'performance' | 'drawdown'
type PnlChip = 'all' | 'day'

type TradeWithMeta = ClosedTrade & {
  sessionId: string
  sessionName: string
  symbol: string
  strategyId?: string
}

function entryTypeOf(t: ClosedTrade): 'market' | 'limit' | 'stop-limit' {
  if (t.pendingKind === 'limit') return 'limit'
  if (t.pendingKind === 'stopLimit') return 'stop-limit'
  return 'market'
}

/** Local analytics from IndexedDB — FXR free subset with filters + drawdown. */
export default function AnalyticsTab(): ReactNode {
  const { t } = useT()
  const sessions = useSessionStore((s) => s.sessions)
  const strategies = useStrategiesStore((s) => s.strategies)
  const accountTimezone = useAccountPrefsStore((s) => s.accountTimezone)
  const accountTzLabel = `${chartTimezoneById(accountTimezone).city} (${sessionUtcOffsetLabel(accountTimezone)})`

  const [sideFilter, setSideFilter] = useState<SideFilter>('all')
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all')
  const [entryTypeFilter, setEntryTypeFilter] = useState<EntryTypeFilter>('all')
  const [assetFilter, setAssetFilter] = useState('all')
  const [sessionFilter, setSessionFilter] = useState('all')
  const [strategyFilter, setStrategyFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [view, setView] = useState<ViewMode>('performance')
  const [pnlChip, setPnlChip] = useState<PnlChip>('all')

  const allTrades = useMemo(() => {
    const rows: TradeWithMeta[] = []
    for (const session of sessions) {
      for (const t of session.closedTrades ?? []) {
        rows.push({
          ...t,
          sessionId: session.id,
          sessionName: session.name,
          symbol: session.symbol,
          strategyId: session.strategyId
        })
      }
    }
    return rows
  }, [sessions])

  const assetOptions = useMemo(
    () => [...new Set(sessions.map((s) => s.symbol))].sort(),
    [sessions]
  )
  const sessionOptions = useMemo(
    () =>
      [...sessions]
        .map((s) => [s.id, s.name] as const)
        .sort((a, b) => a[1].localeCompare(b[1])),
    [sessions]
  )

  const filtered = useMemo(() => {
    const { fromSec, toSec } = analyticsDayBounds(dateFrom, dateTo, accountTimezone)
    const startOfDay = analyticsTodayStartSec(Date.now(), accountTimezone)
    return allTrades.filter((t) => {
      if (sideFilter !== 'all' && t.side !== sideFilter) return false
      if (outcomeFilter === 'win' && !(t.pnl > 0)) return false
      if (outcomeFilter === 'loss' && !(t.pnl < 0)) return false
      if (outcomeFilter === 'be' && t.pnl !== 0) return false
      if (entryTypeFilter !== 'all' && entryTypeOf(t) !== entryTypeFilter) return false
      if (assetFilter !== 'all' && t.symbol !== assetFilter) return false
      if (sessionFilter !== 'all' && t.sessionId !== sessionFilter) return false
      if (strategyFilter === 'none' && t.strategyId) return false
      if (
        strategyFilter !== 'all' &&
        strategyFilter !== 'none' &&
        t.strategyId !== strategyFilter
      ) {
        return false
      }
      if (fromSec != null && t.exitTime < fromSec) return false
      if (toSec != null && t.exitTime > toSec) return false
      if (pnlChip === 'day' && t.exitTime < startOfDay) return false
      return true
    })
  }, [
    allTrades,
    sideFilter,
    outcomeFilter,
    entryTypeFilter,
    assetFilter,
    sessionFilter,
    strategyFilter,
    dateFrom,
    dateTo,
    pnlChip,
    accountTimezone
  ])

  const report = useMemo(() => sideReport(filtered), [filtered])
  const rr = useMemo(() => averageRiskReward(filtered), [filtered])
  const exp = useMemo(() => expectancy(filtered), [filtered])
  const pf = useMemo(() => profitFactor(filtered), [filtered])
  const monthly = useMemo(() => monthlyPnlBuckets(filtered, 6, Date.now(), accountTimezone), [filtered, accountTimezone])
  const daily = useMemo(() => weekdayPnlBuckets(filtered, accountTimezone), [filtered, accountTimezone])

  const startingBalance = useMemo(() => {
    if (sessionFilter !== 'all') {
      const s = sessions.find((x) => x.id === sessionFilter)
      if (s && Number.isFinite(s.startingBalance) && s.startingBalance > 0) {
        return s.startingBalance
      }
    }
    let sum = 0
    let n = 0
    for (const s of sessions) {
      if (Number.isFinite(s.startingBalance) && s.startingBalance > 0) {
        sum += s.startingBalance
        n += 1
      }
    }
    return n > 0 ? sum / n : 100000
  }, [sessions, sessionFilter])

  const dd = useMemo(
    () => drawdownSeries(startingBalance, filtered),
    [startingBalance, filtered]
  )

  const bySymbol = useMemo(() => {
    const map = new Map<string, { trades: number; wins: number; pnl: number }>()
    for (const t of filtered) {
      const cur = map.get(t.symbol) ?? { trades: 0, wins: 0, pnl: 0 }
      cur.trades += 1
      if (t.pnl > 0) cur.wins += 1
      cur.pnl += t.pnl
      map.set(t.symbol, cur)
    }
    return [...map.entries()]
      .map(([symbol, v]) => ({
        symbol,
        ...v,
        winRate: v.trades ? v.wins / v.trades : null
      }))
      .sort((a, b) => b.trades - a.trades)
  }, [filtered])

  const bySide = useMemo(() => {
    let buy = { n: 0, wins: 0, pnl: 0 }
    let sell = { n: 0, wins: 0, pnl: 0 }
    for (const t of filtered) {
      const bucket = t.side === 'long' ? buy : sell
      bucket.n += 1
      if (t.pnl > 0) bucket.wins += 1
      bucket.pnl += t.pnl
    }
    return { buy, sell }
  }, [filtered])

  function clearFilters(): void {
    setSideFilter('all')
    setOutcomeFilter('all')
    setEntryTypeFilter('all')
    setAssetFilter('all')
    setSessionFilter('all')
    setStrategyFilter('all')
    setDateFrom('')
    setDateTo('')
    setPnlChip('all')
  }

  if (allTrades.length === 0) {
    return (
      <SoftEmpty>
        {t('analytics.empty')}
      </SoftEmpty>
    )
  }

  const maxAbsPnl = Math.max(1, ...bySymbol.map((r) => Math.abs(r.pnl)))

  return (
    <div className={softSpace.sectionGap}>
      {/* Filter bar */}
      <SoftCard className={cn(softSpace.cardPadSm, 'space-y-4')}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[8rem]">
            <span className={cn('mb-1.5 block', softType.caption)}>{t('analytics.filter.type')}</span>
            <SoftSelect
              className="h-11 text-body"
              value={entryTypeFilter}
              onChange={(e) => setEntryTypeFilter(e.target.value as EntryTypeFilter)}
            >
              <option value="all">{t('analytics.all')}</option>
              <option value="market">{t('analytics.market')}</option>
              <option value="limit">{t('analytics.limit')}</option>
              <option value="stop-limit">{t('analytics.stopLimit')}</option>
            </SoftSelect>
          </label>
          <label className="min-w-[8rem]">
            <span className={cn('mb-1.5 block', softType.caption)}>{t('analytics.filter.assets')}</span>
            <SoftSelect
              className="h-11 text-body"
              value={assetFilter}
              onChange={(e) => setAssetFilter(e.target.value)}
            >
              <option value="all">{t('analytics.all')}</option>
              {assetOptions.map((sym) => (
                <option key={sym} value={sym}>
                  {sym}
                </option>
              ))}
            </SoftSelect>
          </label>
          <label className="min-w-[8rem]">
            <span className={cn('mb-1.5 block', softType.caption)}>{t('analytics.filter.side')}</span>
            <SoftSelect
              className="h-11 text-body"
              value={sideFilter}
              onChange={(e) => setSideFilter(e.target.value as SideFilter)}
            >
              <option value="all">{t('analytics.all')}</option>
              <option value="long">{t('analytics.buy')}</option>
              <option value="short">{t('analytics.sell')}</option>
            </SoftSelect>
          </label>
          <label className="min-w-[8rem]">
            <span className={cn('mb-1.5 block', softType.caption)}>{t('analytics.filter.outcome')}</span>
            <SoftSelect
              className="h-11 text-body"
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value as OutcomeFilter)}
            >
              <option value="all">{t('analytics.all')}</option>
              <option value="win">{t('analytics.wins')}</option>
              <option value="loss">{t('analytics.losses')}</option>
              <option value="be">{t('analytics.be')}</option>
            </SoftSelect>
          </label>
          <label className="min-w-[10rem]">
            <span className={cn('mb-1.5 block', softType.caption)}>{t('analytics.filter.session')}</span>
            <SoftSelect
              className="h-11 text-body"
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
            >
              <option value="all">{t('analytics.allSessions')}</option>
              {sessionOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </SoftSelect>
          </label>
          <label className="min-w-[10rem]">
            <span className={cn('mb-1.5 block', softType.caption)}>{t('analytics.filter.strategy')}</span>
            <SoftSelect
              className="h-11 text-body"
              value={strategyFilter}
              onChange={(e) => setStrategyFilter(e.target.value)}
            >
              <option value="all">{t('analytics.all')}</option>
              <option value="none">{t('analytics.noStrategy')}</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SoftSelect>
          </label>
          <label className="min-w-[9rem]">
            <span className={cn('mb-1.5 block', softType.caption)}>{t('analytics.filter.from')}</span>
            <SoftInput
              type="date"
              className="h-11 text-body"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="min-w-[9rem]">
            <span className={cn('mb-1.5 block', softType.caption)}>{t('analytics.filter.to')}</span>
            <SoftInput
              type="date"
              className="h-11 text-body"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <SoftButton size="sm" variant="ghost" onClick={clearFilters}>
            {t('analytics.clearFilters')}
          </SoftButton>
        </div>

        <p className={cn(softType.micro, 'text-zinc-600')} title={accountTimezone}>
          {t('analytics.tzNote', { tz: accountTzLabel })}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <span className={softType.caption}>{t('analytics.pnl')}</span>
          {(
            [
              ['all', t('analytics.pnlAll')],
              ['day', t('analytics.pnlDay')]
            ] as const
          ).map(([id, label]) => (
            <SoftButton
              key={id}
              size="sm"
              variant={pnlChip === id ? 'primary' : 'secondary'}
              onClick={() => setPnlChip(id)}
              aria-pressed={pnlChip === id}
            >
              {label}
            </SoftButton>
          ))}
          <span className="mx-2 h-5 w-px bg-white/10" aria-hidden />
          <span className={softType.caption}>{t('analytics.view')}</span>
          {(
            [
              ['performance', t('analytics.viewPerformance')],
              ['drawdown', t('analytics.viewDrawdown')]
            ] as const
          ).map(([id, label]) => (
            <SoftButton
              key={id}
              size="sm"
              variant={view === id ? 'primary' : 'secondary'}
              onClick={() => setView(id)}
              aria-pressed={view === id}
            >
              {label}
            </SoftButton>
          ))}
          <span className={cn('ml-auto', softType.caption)}>
            {t('analytics.filteredOf', { filtered: filtered.length, total: allTrades.length })}
          </span>
        </div>
      </SoftCard>

      {filtered.length === 0 ? (
        <SoftEmpty>{t('analytics.noMatch')}</SoftEmpty>
      ) : view === 'performance' ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(5,minmax(0,1fr))]">
            <StatCard
              label={t('analytics.winRate')}
              value={formatWinRatePct(report.winRate)}
              hint={`${report.wins}W / ${report.losses}L · ${report.count} trade${report.count === 1 ? '' : 's'}`}
            />
            <StatCard
              label={t('analytics.realizedPnl')}
              value={formatPnl(report.totalPnl)}
              hint={t('analytics.hintFilteredCloses')}
              tone={report.totalPnl >= 0 ? 'up' : 'down'}
            />
            <StatCard label={t('analytics.riskReward')} value={formatRiskRewardRatio(rr)} hint={t('analytics.hintAvgWinLoss')} />
            <StatCard
              label={t('analytics.expectancy')}
              value={exp == null ? '—' : formatPnl(exp)}
              hint={t('analytics.hintAvgPnl')}
              tone={exp == null ? 'neutral' : exp >= 0 ? 'up' : 'down'}
            />
            <StatCard
              label={t('analytics.profitFactor')}
              value={pf == null ? '—' : pf.toFixed(2)}
              hint={t('analytics.hintGrossWins')}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <SoftCard className={cn(softSpace.cardPad, 'flex min-h-[260px] flex-col')}>
              <h2 className={softType.section}>{t('analytics.monthlyTitle')}</h2>
              <p className={cn('mt-1 mb-4', softType.caption)}>{t('analytics.monthlyHint')}</p>
              <BarRow buckets={monthly} positiveClass="from-emerald-600 via-emerald-400 to-emerald-200" />
            </SoftCard>
            <SoftCard className={cn(softSpace.cardPad, 'flex min-h-[260px] flex-col')}>
              <h2 className={softType.section}>{t('analytics.dailyTitle')}</h2>
              <p className={cn('mt-1 mb-4', softType.caption)}>{t('analytics.dailyHint')}</p>
              <BarRow
                buckets={daily}
                positiveClass="from-sky-600 via-sky-400 to-sky-200"
                shortLabels
              />
            </SoftCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <SoftCard className={softSpace.cardPad}>
              <h2 className={softType.section}>{t('analytics.bySide')}</h2>
              <ul className="mt-4 space-y-4">
                {(
                  [
                    [t('analytics.buy'), bySide.buy],
                    [t('analytics.sell'), bySide.sell]
                  ] as const
                ).map(([label, row]) => (
                  <li key={label} className="flex items-baseline justify-between gap-3">
                    <span className={softType.cardTitle}>{label}</span>
                    <span className={softType.caption}>
                      {row.n} trade{row.n === 1 ? '' : 's'} · {formatWinRatePct(row.n ? row.wins / row.n : null)} ·{' '}
                      <span className={row.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {formatPnl(row.pnl)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </SoftCard>

            <SoftCard className={softSpace.cardPad}>
              <h2 className={softType.section}>{t('analytics.bySymbol')}</h2>
              <p className={cn('mt-1', softType.caption)}>{t('analytics.bySymbolHint')}</p>
              <ul className="mt-4 space-y-3">
                {bySymbol.map((row) => (
                  <li key={row.symbol}>
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <span className={cn(softType.cardTitle, 'text-zinc-200')}>{row.symbol}</span>
                      <span className={softType.caption}>
                        {row.trades} trade{row.trades === 1 ? '' : 's'} · {formatWinRatePct(row.winRate)} ·{' '}
                        <span className={row.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {formatPnl(row.pnl)}
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className={`h-full rounded-full ${row.pnl >= 0 ? 'bg-emerald-400/80' : 'bg-red-400/80'}`}
                        style={{ width: `${Math.max(6, (Math.abs(row.pnl) / maxAbsPnl) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </SoftCard>
          </div>
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <SoftCard className={cn(softSpace.cardPad, 'flex min-h-[320px] flex-col')}>
            <h2 className={softType.section}>{t('analytics.equityDd')}</h2>
            <p className={cn('mt-1 mb-4', softType.caption)}>
              Underwater from peak after each filtered close (start{' '}
              {formatPnl(startingBalance).replace(/^[+-]/, '')}).
            </p>
            <DrawdownChart points={dd.points} />
          </SoftCard>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <StatCard
              label={t('analytics.maxDd')}
              value={
                dd.maxDrawdown <= 0
                  ? '0.00'
                  : formatPnl(-Math.abs(dd.maxDrawdown)).replace(/^\+/, '')
              }
              hint="Peak-to-trough on filtered equity"
              tone={dd.maxDrawdown > 0 ? 'down' : 'neutral'}
            />
            <StatCard
              label={t('analytics.maxDdPct')}
              value={
                dd.maxDrawdownPct == null
                  ? '—'
                  : `${(dd.maxDrawdownPct * 100).toFixed(2)}%`
              }
              hint="Vs peak equity"
              tone={dd.maxDrawdownPct && dd.maxDrawdownPct > 0 ? 'down' : 'neutral'}
            />
            <StatCard
              label={t('analytics.endingEquity')}
              value={formatPnl(dd.points[dd.points.length - 1]?.equity ?? startingBalance).replace(
                /^[+-]/,
                ''
              )}
              hint={`${dd.points.length - 1} closes applied`}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
  tone = 'neutral'
}: {
  label: string
  value: string
  hint: string
  tone?: 'up' | 'down' | 'neutral'
}): ReactNode {
  return (
    <SoftCard className={cn(softSpace.cardPadSm, 'min-w-0 overflow-hidden px-5 py-5')}>
      <p className={cn(softType.caption, 'truncate')}>{label}</p>
      <p
        className={cn(
          'mt-2 whitespace-nowrap tabular-nums leading-none tracking-tight',
          'text-[clamp(0.95rem,1.55vw,1.35rem)] font-bold',
          tone === 'up' && 'text-emerald-400',
          tone === 'down' && 'text-red-400',
          tone === 'neutral' && 'text-zinc-50'
        )}
        title={value}
      >
        {value}
      </p>
      <p className={cn('mt-1.5 truncate', softType.caption, 'text-zinc-600')}>{hint}</p>
    </SoftCard>
  )
}

function BarRow({
  buckets,
  positiveClass,
  shortLabels = false
}: {
  buckets: PeriodBucket[]
  positiveClass: string
  shortLabels?: boolean
}): ReactNode {
  const maxAbs = Math.max(1, ...buckets.map((b) => Math.abs(b.pnl)))
  const hasData = buckets.some((b) => b.pnl !== 0 || (b.tradeCount ?? 0) > 0)
  if (!hasData) {
    return (
      <p className={cn('flex flex-1 items-center justify-center text-center', softType.caption)}>
        Bars fill as you close trades.
      </p>
    )
  }
  return (
    <div className="flex min-h-[10rem] flex-1 items-end gap-2 px-1 pb-1 pt-2">
      {buckets.map((b) => {
        const height = Math.max(b.pnl === 0 ? 0 : 6, Math.round((Math.abs(b.pnl) / maxAbs) * 100))
        const label = shortLabels ? b.label.slice(0, 3) : b.label
        const up = b.pnl >= 0
        return (
          <div key={b.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-36 w-full items-end justify-center">
              <div
                className={cn(
                  'w-[70%] max-w-[2.75rem] rounded-t-lg bg-gradient-to-t',
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

function DrawdownChart({
  points
}: {
  points: { index: number; equity: number; drawdown: number }[]
}): ReactNode {
  if (points.length < 2) {
    return (
      <p className={cn('flex flex-1 items-center justify-center text-center', softType.caption)}>
        Drawdown appears after closed trades.
      </p>
    )
  }
  const w = 480
  const h = 220
  const pad = 12
  const maxEq = Math.max(...points.map((p) => p.equity))
  const minEq = Math.min(...points.map((p) => p.equity))
  const span = Math.max(1e-9, maxEq - minEq)
  const maxDd = Math.max(1e-9, ...points.map((p) => p.drawdown))
  const eqLine = points
    .map((p, i) => {
      const x = pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2)
      const y = pad + (1 - (p.equity - minEq) / span) * (h - pad * 2) * 0.55
      return `${x},${y}`
    })
    .join(' ')
  const ddLine = points
    .map((p, i) => {
      const x = pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2)
      const y = h - pad - (p.drawdown / maxDd) * (h - pad * 2) * 0.4
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" role="img" aria-label="Equity and drawdown">
      <polyline
        fill="none"
        stroke="#34d399"
        strokeWidth={2.5}
        strokeLinejoin="round"
        points={eqLine}
      />
      <polyline
        fill="none"
        stroke="#f87171"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeDasharray="4 4"
        points={ddLine}
      />
    </svg>
  )
}
