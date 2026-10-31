import { useMemo, type ReactNode } from 'react'
import { BookOpen, Clock, Percent, Plus, Target } from 'lucide-react'
import SoftCard from '@/components/ui/SoftCard'
import SoftButton from '@/components/ui/SoftButton'
import { cn } from '@/components/ui/cn'
import { softSpace, softSurface, softType } from '@/components/ui/softTokens'
import { useSessionStore } from '@/store/sessionStore'
import {
  computeLocalPerformance,
  formatDurationMs,
  formatDurationSec,
  formatPct,
  formatWinRatePct
} from '@/lib/localPerformance'

const GITHUB_README = 'https://github.com/eclipse005/BarReplay#readme'

/**
 * Testing → Dashboard: action cards + local IndexedDB performance metrics.
 * Empty-friendly zeros match FX Replay layout without paywall locks.
 */
export default function TestingDashboardTab({
  onStartSession
}: {
  onStartSession: () => void
}): ReactNode {
  const sessions = useSessionStore((s) => s.sessions)
  const stats = useMemo(() => computeLocalPerformance(sessions), [sessions])

  return (
    <div className={softSpace.sectionGap}>
      <div className={cn('grid sm:grid-cols-2', softSpace.rowGap)}>
        <button
          type="button"
          onClick={onStartSession}
          className="group flex items-start gap-3.5 rounded-2xl border border-primary-500/45 bg-zinc-900/50 px-4 py-4 text-left shadow-sm shadow-black/20 transition-colors hover:border-primary-400/60 hover:bg-zinc-900/70"
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500/15 text-primary-400">
            <Plus className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className={cn('block', softType.cardTitle)}>Backtesting session</span>
            <span className={cn('mt-0.5 block', softType.caption)}>Start a session.</span>
          </span>
        </button>

        <a
          href={GITHUB_README}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-start gap-3.5 rounded-2xl border border-white/[0.06] bg-zinc-900/35 px-4 py-4 text-left transition-colors hover:border-white/10 hover:bg-zinc-900/55"
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-zinc-400 group-hover:text-zinc-200">
            <BookOpen className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className={cn('block', softType.cardTitle, 'text-zinc-200')}>Tutorials</span>
            <span className={cn('mt-0.5 block', softType.caption)}>Learn more.</span>
          </span>
        </a>
      </div>

      <SoftCard className={softSpace.cardPad}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className={softType.section}>Performance</h2>
          <span className={softType.caption}>
            {stats.sessionCount} session{stats.sessionCount === 1 ? '' : 's'} · local only
          </span>
        </div>

        <div className={cn('grid sm:grid-cols-2 xl:grid-cols-4', softSpace.rowGap)}>
          <MetricCard
            icon={<Clock className="h-3.5 w-3.5" aria-hidden />}
            label="Time invested"
            value={formatDurationMs(stats.timeInvestedMs)}
          />
          <MetricCard
            icon={<Clock className="h-3.5 w-3.5" aria-hidden />}
            label="Historical time replayed"
            value={formatDurationSec(stats.historicalReplayedSec)}
          />
          <MetricCard
            icon={<Target className="h-3.5 w-3.5" aria-hidden />}
            label="Trades taken"
            value={String(stats.tradesTaken)}
            footer={
              stats.tradesTaken > 0 ? (
                <div className="mt-2.5 space-y-1.5">
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="bg-emerald-400"
                      style={{ width: `${(stats.buyPct ?? 0) * 100}%` }}
                    />
                    <div
                      className="bg-red-400"
                      style={{ width: `${(stats.sellPct ?? 0) * 100}%` }}
                    />
                  </div>
                  <p className={softType.caption}>
                    <span className="text-emerald-400/90">{formatPct(stats.buyPct)} buys</span>
                    {' / '}
                    <span className="text-red-400/90">{formatPct(stats.sellPct)} sells</span>
                  </p>
                </div>
              ) : (
                <p className={cn('mt-2', softType.micro)}>No closed trades yet</p>
              )
            }
          />
          <MetricCard
            icon={<Percent className="h-3.5 w-3.5" aria-hidden />}
            label="Overall win rate"
            value={formatWinRatePct(stats.winRate)}
          />
        </div>

        {stats.sessionCount === 0 ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-white/[0.06] bg-zinc-950/40 px-4 py-3">
            <p className={softType.caption}>
              Import a CSV dataset, then start a backtesting session to fill these cards.
            </p>
            <SoftButton variant="primary" size="sm" onClick={onStartSession}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Start a session
            </SoftButton>
          </div>
        ) : null}
      </SoftCard>
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  footer
}: {
  icon: ReactNode
  label: string
  value: string
  footer?: ReactNode
}): ReactNode {
  return (
    <div className={cn(softSurface.inset, softSpace.cardPadSm)}>
      <div className={cn('flex items-center gap-1.5', softType.caption)}>
        <span className="opacity-70">{icon}</span>
        {label}
      </div>
      <div className={cn('mt-2 font-sans', softType.metric)}>{value}</div>
      {footer}
    </div>
  )
}
