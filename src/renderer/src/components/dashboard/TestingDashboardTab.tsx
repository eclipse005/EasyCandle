import { useMemo, type ReactNode } from 'react'
import { BookOpen, Clock, Percent, Plus, Target } from 'lucide-react'
import SoftCard from '@/components/ui/SoftCard'
import SoftButton from '@/components/ui/SoftButton'
import SoftEmpty from '@/components/ui/SoftEmpty'
import { cn } from '@/components/ui/cn'
import { softSpace, softType } from '@/components/ui/softTokens'
import { useSessionStore } from '@/store/sessionStore'
import { useT } from '@/i18n/useT'
import {
  computeLocalPerformance,
  formatDurationMs,
  formatDurationSec,
  formatPct,
  formatWinRatePct
} from '@/lib/localPerformance'

const GITHUB_README = 'https://github.com/eclipse005/BarReplay#readme'

/**
 * Testing → Dashboard only (this pass): hero start card + local metrics +
 * optional time-invested bars from IndexedDB sessions.
 */
export default function TestingDashboardTab({
  onStartSession
}: {
  onStartSession: () => void
}): ReactNode {
  const { t } = useT()
  const sessions = useSessionStore((s) => s.sessions)
  const stats = useMemo(() => computeLocalPerformance(sessions), [sessions])
  const maxMonthMs = useMemo(
    () => Math.max(1, ...stats.monthlyTimeInvested.map((m) => m.ms)),
    [stats.monthlyTimeInvested]
  )
  const hasMonthData = stats.monthlyTimeInvested.some((m) => m.ms > 0)

  return (
    <div className={softSpace.sectionGap}>
      <div className={cn('grid sm:grid-cols-2', softSpace.rowGap)}>
        <button
          type="button"
          onClick={onStartSession}
          className="group flex min-h-[7.5rem] items-center gap-5 rounded-2xl border border-primary-500/50 bg-zinc-900/55 px-7 py-7 text-left shadow-sm shadow-primary-950/30 transition-colors hover:border-primary-400/70 hover:bg-zinc-900/75"
        >
          <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary-500/15 text-primary-400">
            <Plus className="h-11 w-11" strokeWidth={2.25} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className={cn('block', softType.cardTitle)}>{t('dashboard.backtestingSession')}</span>
            <span className={cn('mt-1 block', softType.caption)}>{t('dashboard.startSession')}</span>
          </span>
        </button>

        <a
          href={GITHUB_README}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex min-h-[7.5rem] items-center gap-5 rounded-2xl border border-white/[0.06] bg-zinc-900/30 px-7 py-7 text-left transition-colors hover:border-white/10 hover:bg-zinc-900/50"
        >
          <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/[0.04] text-zinc-400 group-hover:text-zinc-200">
            <BookOpen className="h-11 w-11" strokeWidth={2} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className={cn('block', softType.cardTitle, 'text-zinc-200')}>{t('dashboard.tutorials')}</span>
            <span className={cn('mt-1 block', softType.caption)}>{t('dashboard.tutorialsHint')}</span>
          </span>
        </a>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <h2 className={softType.section}>{t('dashboard.performance')}</h2>
        <span className={softType.caption}>
          {t('dashboard.sessionsLocal', {
            count: stats.sessionCount,
            suffix: stats.sessionCount === 1 ? '' : 's'
          })}
        </span>
      </div>

      <div className={cn('grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]', softSpace.rowGap)}>
        <div className={cn('grid sm:grid-cols-2', softSpace.rowGap)}>
          <MetricCard
            icon={<Clock className="h-6 w-6" aria-hidden />}
            label={t('dashboard.timeInvested')}
            value={formatDurationMs(stats.timeInvestedMs)}
          />
          <MetricCard
            icon={<Clock className="h-6 w-6" aria-hidden />}
            label={t('dashboard.historicalReplayed')}
            value={formatDurationSec(stats.historicalReplayedSec)}
          />
          <MetricCard
            icon={<Target className="h-6 w-6" aria-hidden />}
            label={t('dashboard.tradesTaken')}
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
                    <span className="text-emerald-400/90">{formatPct(stats.buyPct)} {t('dashboard.buys')}</span>
                    {' / '}
                    <span className="text-red-400/90">{formatPct(stats.sellPct)} {t('dashboard.sells')}</span>
                  </p>
                </div>
              ) : (
                <p className={cn('mt-2', softType.micro)}>{t('dashboard.noClosedTrades')}</p>
              )
            }
          />
          <MetricCard
            icon={<Percent className="h-6 w-6" aria-hidden />}
            label={t('dashboard.overallWinRate')}
            value={formatWinRatePct(stats.winRate)}
          />
        </div>

        <SoftCard className={cn(softSpace.cardPad, 'flex min-h-[360px] flex-col')}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className={softType.cardTitle}>{t('dashboard.timeInvested')}</h3>
            <span className={softType.micro}>{t('dashboard.byMonth')}</span>
          </div>
          {hasMonthData ? (
            <div className="flex min-h-0 flex-1 items-end gap-3 px-1 pb-1 pt-4">
              {stats.monthlyTimeInvested.map((m) => {
                const height = Math.max(4, Math.round((m.ms / maxMonthMs) * 100))
                return (
                  <div key={m.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <div className="flex h-44 w-full items-end justify-center">
                      <div
                        className="w-[72%] max-w-[3.5rem] rounded-t-lg bg-gradient-to-t from-amber-600 via-amber-400 to-amber-200 shadow-[0_0_18px_rgba(245,158,11,0.35)]"
                        style={{ height: `${height}%` }}
                        title={`${m.label}: ${formatDurationMs(m.ms)}`}
                      />
                    </div>
                    <span className={softType.caption}>{m.label}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className={cn('text-center', softType.caption)}>
                {t('dashboard.monthBarsHint')}
              </p>
            </div>
          )}
        </SoftCard>
      </div>

      {stats.sessionCount === 0 ? (
        <SoftEmpty>
          <p className="mb-3">{t('dashboard.emptyHint')}</p>
          <SoftButton variant="primary" size="md" onClick={onStartSession}>
            <Plus className="h-5 w-5" aria-hidden />
            {t('dashboard.startSessionBtn')}
          </SoftButton>
        </SoftEmpty>
      ) : null}
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
    <SoftCard elevated className={softSpace.cardPadSm}>
      <div className={cn('flex items-center gap-2', softType.caption)}>
        <span className="opacity-70">{icon}</span>
        {label}
      </div>
      <div className={cn('mt-5 font-sans', softType.metric)}>{value}</div>
      {footer}
    </SoftCard>
  )
}
