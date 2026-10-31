import { useMemo, type ReactNode } from 'react'
import { BarChart3, Play, Plus, Trash2 } from 'lucide-react'
import { cumulativeRealizedPnl, summarizeSession } from '@/lib/paperTrade'
import { formatPnlCcy, quoteCurrencyForSymbol } from '@shared/pnlCurrency'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import { useSessionStore, type Session } from '@/store/sessionStore'
import { useStrategiesStore } from '@/store/strategiesStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import type { SessionReport } from '@/store/replayStore'
import SoftButton from '@/components/ui/SoftButton'
import SoftCard from '@/components/ui/SoftCard'
import SoftEmpty from '@/components/ui/SoftEmpty'

function sessionToReport(session: Session): SessionReport | null {
  if (!session.closedTrades.length) return null
  return {
    symbol: session.symbol,
    timeframe: session.timeframe,
    trades: session.closedTrades,
    summary: summarizeSession(session.closedTrades),
    closedOpenOnExit: false,
    startingBalance: session.startingBalance
  }
}

function SessionCard({
  session,
  strategyName,
  onOpen,
  onDelete,
  onReport
}: {
  session: Session
  strategyName: string | null
  onOpen: () => void
  onDelete: () => void
  onReport: () => void
}) {
  const quote = quoteCurrencyForSymbol(session.symbol)
  const pnl = cumulativeRealizedPnl(session.closedTrades)
  const wins = session.closedTrades.filter((t) => t.pnl > 0).length
  const playhead =
    session.replayTime != null ? formatUtcCandleTime(session.replayTime) : 'not started'
  const hasReport = session.closedTrades.length > 0

  return (
    <SoftCard
      elevated
      className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:border-white/10"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-zinc-100">{session.name}</span>
          {strategyName ? (
            <span className="rounded-lg bg-sky-950/50 px-1.5 py-0.5 text-[10px] font-medium text-sky-300/90">
              {strategyName}
            </span>
          ) : null}
        </div>
        <div className="mt-1 text-[12px] leading-relaxed text-zinc-500">
          {session.symbol} · {session.timeframe} · {session.closedTrades.length} trades · {wins}W ·{' '}
          {formatPositionText(session)} · playhead {playhead}
        </div>
      </div>
      <span
        className={`shrink-0 text-[13px] font-medium tabular-nums ${
          pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
        }`}
      >
        {formatPnlCcy(pnl, quote)}
      </span>
      <div className="flex shrink-0 items-center gap-1.5">
        <SoftButton
          size="sm"
          variant="secondary"
          aria-label={`Open performance for ${session.name}`}
          disabled={!hasReport}
          title={hasReport ? 'Equity curve & session report' : 'No closed trades yet'}
          onClick={onReport}
        >
          <BarChart3 className="h-3.5 w-3.5" aria-hidden />
          Report
        </SoftButton>
        <SoftButton
          size="sm"
          variant="primary"
          aria-label={`Resume session ${session.name}`}
          onClick={onOpen}
          className="!px-3"
        >
          <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
          Resume
        </SoftButton>
        <SoftButton
          size="sm"
          variant="ghost"
          aria-label={`Delete session ${session.name}`}
          onClick={onDelete}
          className="!h-7 !w-7 !px-0 hover:text-red-300"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </SoftButton>
      </div>
    </SoftCard>
  )
}

function formatPositionText(session: Session): string {
  const open = session.positions.length
  const pending = session.pendingOrders.length
  const parts: string[] = []
  if (open > 0) parts.push(`${open} open`)
  if (pending > 0) parts.push(`${pending} pending`)
  return parts.length ? parts.join(', ') : 'flat'
}

export default function SessionsTab({
  onNewSession,
  summary = false
}: {
  onNewSession: () => void
  summary?: boolean
}): ReactNode {
  const sessions = useSessionStore((s) => s.sessions)
  const loadSession = useSessionStore((s) => s.loadSession)
  const deleteSession = useSessionStore((s) => s.deleteSession)
  const strategies = useStrategiesStore((s) => s.strategies)
  const setPreviewSessionReport = useUiLayoutStore((s) => s.setPreviewSessionReport)

  const ordered = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions]
  )
  const visible = summary ? ordered.slice(0, 5) : ordered
  const strategyName = (id: string | undefined): string | null =>
    (id && strategies.find((s) => s.id === id)?.name) || null

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-medium text-zinc-400">
          {summary ? 'Recent sessions' : 'All sessions'}
        </h2>
        <SoftButton variant="primary" onClick={onNewSession}>
          <Plus className="h-4 w-4" aria-hidden />
          New session
        </SoftButton>
      </div>

      {ordered.length === 0 ? (
        <SoftEmpty>
          No sessions yet — create one from a dataset to start replaying candles.
        </SoftEmpty>
      ) : (
        <div className="space-y-2.5">
          {visible.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              strategyName={strategyName(session.strategyId)}
              onOpen={() => void loadSession(session.id)}
              onDelete={() => deleteSession(session.id)}
              onReport={() => {
                const report = sessionToReport(session)
                if (report) setPreviewSessionReport(report)
              }}
            />
          ))}
          {summary && ordered.length > visible.length ? (
            <p className="pt-1 text-center text-[12px] text-zinc-600">
              {ordered.length - visible.length} more on the Sessions tab
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}
