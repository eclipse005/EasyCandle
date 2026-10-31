import { useMemo, type ReactNode } from 'react'
import SoftCard from '@/components/ui/SoftCard'
import SoftEmpty from '@/components/ui/SoftEmpty'
import { cn } from '@/components/ui/cn'
import { softSpace, softType } from '@/components/ui/softTokens'
import { formatPnl } from '@/lib/paperTrade'
import {
  averageRiskReward,
  formatRiskRewardRatio,
  monthlyPnlBuckets,
  weekdayPnlBuckets,
  type PeriodBucket
} from '@/lib/sessionAnalytics'
import { useSessionStore } from '@/store/sessionStore'
import {
  computeLocalPerformance,
  formatWinRatePct
} from '@/lib/localPerformance'
import type { ClosedTrade } from '@/lib/paperTrade'

/** Local analytics from IndexedDB sessions — FXR free subset, no paywall. */
export default function AnalyticsTab(): ReactNode {
  const sessions = useSessionStore((s) => s.sessions)
  const stats = useMemo(() => computeLocalPerformance(sessions), [sessions])

  const allTrades = useMemo(() => {
    const rows: ClosedTrade[] = []
    for (const session of sessions) {
      for (const t of session.closedTrades ?? []) rows.push(t)
    }
    return rows
  }, [sessions])

  const rr = useMemo(() => averageRiskReward(allTrades), [allTrades])
  const monthly = useMemo(() => monthlyPnlBuckets(allTrades, 6), [allTrades])
  const daily = useMemo(() => weekdayPnlBuckets(allTrades), [allTrades])

  const bySymbol = useMemo(() => {
    const map = new Map<string, { trades: number; wins: number; pnl: number }>()
    for (const session of sessions) {
      const cur = map.get(session.symbol) ?? { trades: 0, wins: 0, pnl: 0 }
      for (const t of session.closedTrades ?? []) {
        cur.trades += 1
        if (t.pnl > 0) cur.wins += 1
        cur.pnl += t.pnl
      }
      map.set(session.symbol, cur)
    }
    return [...map.entries()]
      .map(([symbol, v]) => ({
        symbol,
        ...v,
        winRate: v.trades ? v.wins / v.trades : null
      }))
      .sort((a, b) => b.trades - a.trades)
  }, [sessions])

  const bySide = useMemo(() => {
    let buy = { n: 0, wins: 0, pnl: 0 }
    let sell = { n: 0, wins: 0, pnl: 0 }
    for (const t of allTrades) {
      const bucket = t.side === 'long' ? buy : sell
      bucket.n += 1
      if (t.pnl > 0) bucket.wins += 1
      bucket.pnl += t.pnl
    }
    return { buy, sell }
  }, [allTrades])

  if (stats.tradesTaken === 0) {
    return (
      <SoftEmpty>
        Analytics appear once you have closed trades in local sessions. No cloud lock —
        everything stays in IndexedDB.
      </SoftEmpty>
    )
  }

  const maxAbsPnl = Math.max(1, ...bySymbol.map((r) => Math.abs(r.pnl)))

  return (
    <div className={softSpace.sectionGap}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Win rate"
          value={formatWinRatePct(stats.winRate)}
          hint={`${stats.wins}W / ${stats.losses}L · ${stats.tradesTaken} trades`}
        />
        <StatCard
          label="Realized PnL"
          value={formatPnl(stats.totalPnl)}
          hint="Across all sessions (quote mix)"
          tone={stats.totalPnl >= 0 ? 'up' : 'down'}
        />
        <StatCard
          label="Risk / Reward"
          value={formatRiskRewardRatio(rr)}
          hint="Avg win ÷ |avg loss|"
        />
        <StatCard
          label="Sessions"
          value={String(stats.sessionCount)}
          hint="Stored locally"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SoftCard className={cn(softSpace.cardPad, 'flex min-h-[260px] flex-col')}>
          <h2 className={softType.section}>Monthly performance</h2>
          <p className={cn('mt-1 mb-4', softType.caption)}>Closed-trade PnL by calendar month.</p>
          <BarRow buckets={monthly} positiveClass="from-emerald-600 via-emerald-400 to-emerald-200" />
        </SoftCard>
        <SoftCard className={cn(softSpace.cardPad, 'flex min-h-[260px] flex-col')}>
          <h2 className={softType.section}>Daily performance</h2>
          <p className={cn('mt-1 mb-4', softType.caption)}>Closed-trade PnL by weekday.</p>
          <BarRow
            buckets={daily}
            positiveClass="from-sky-600 via-sky-400 to-sky-200"
            shortLabels
          />
        </SoftCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SoftCard className={softSpace.cardPad}>
          <h2 className={softType.section}>By side</h2>
          <ul className="mt-4 space-y-4">
            {(
              [
                ['Buy', bySide.buy],
                ['Sell', bySide.sell]
              ] as const
            ).map(([label, row]) => (
              <li key={label} className="flex items-baseline justify-between gap-3">
                <span className={softType.cardTitle}>{label}</span>
                <span className={softType.caption}>
                  {row.n} trades · {formatWinRatePct(row.n ? row.wins / row.n : null)} ·{' '}
                  <span className={row.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {formatPnl(row.pnl)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </SoftCard>

        <SoftCard className={softSpace.cardPad}>
          <h2 className={softType.section}>Trades by symbol</h2>
          <p className={cn('mt-1', softType.caption)}>Win rate and realized PnL from local closes.</p>
          <ul className="mt-4 space-y-3">
            {bySymbol.map((row) => (
              <li key={row.symbol}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className={cn(softType.cardTitle, 'text-zinc-200')}>{row.symbol}</span>
                  <span className={softType.caption}>
                    {row.trades} trades · {formatWinRatePct(row.winRate)} ·{' '}
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
    <SoftCard className={softSpace.cardPadSm}>
      <p className={softType.caption}>{label}</p>
      <p
        className={cn(
          'mt-2 tabular-nums',
          softType.metric,
          tone === 'up' && 'text-emerald-400',
          tone === 'down' && 'text-red-400',
          tone === 'neutral' && 'text-zinc-50'
        )}
      >
        {value}
      </p>
      <p className={cn('mt-1', softType.caption, 'text-zinc-600')}>{hint}</p>
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
  const hasData = buckets.some((b) => b.pnl !== 0)
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
