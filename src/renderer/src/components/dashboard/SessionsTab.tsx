import { useMemo, type ReactNode } from 'react'
import { BarChart3, Play, Plus, Trash2 } from 'lucide-react'
import { cumulativeRealizedPnl, summarizeSession } from '@/lib/paperTrade'
import { formatPnlCcy, quoteCurrencyForSymbol } from '@shared/pnlCurrency'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import { useSessionStore, type Session } from '@/store/sessionStore'
import { useStrategiesStore } from '@/store/strategiesStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import type { SessionReport } from '@/store/replayStore'

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
    <div className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-semibold text-zinc-100">{session.name}</span>
          {strategyName ? (
            <span className="rounded bg-sky-950/60 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
              {strategyName}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 text-[11px] text-zinc-500">
          {session.symbol} · {session.timeframe} · {session.closedTrades.length} trades ·{' '}
          {wins}W · {formatPositionText(session)} · playhead {playhead}
        </div>
      </div>
      <span
        className={`shrink-0 text-xs font-medium tabular-nums ${
          pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
        }`}
      >
        {formatPnlCcy(pnl, quote)}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={`Open performance for ${session.name}`}
          disabled={!hasReport}
          title={hasReport ? 'Equity curve & session report' : 'No closed trades yet'}
          onClick={onReport}
          className="inline-flex h-7 items-center gap-1 rounded border border-zinc-700 px-2 text-[10px] font-semibold uppercase text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <BarChart3 className="h-3 w-3" aria-hidden />
          Report
        </button>
        <button
          type="button"
          aria-label={`Open session ${session.name}`}
          onClick={onOpen}
          className="inline-flex h-7 items-center gap-1 rounded border border-zinc-700 px-2 text-[10px] font-semibold uppercase text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
        >
          <Play className="h-3 w-3" aria-hidden />
          Open
        </button>
        <button
          type="button"
          aria-label={`Delete session ${session.name}`}
          onClick={onDelete}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
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
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">Backtesting sessions</h2>
        <button
          type="button"
          onClick={onNewSession}
          className="inline-flex h-8 items-center gap-1.5 rounded border border-amber-500/40 bg-amber-950/40 px-3 text-xs font-medium text-amber-300 hover:border-amber-400/70 hover:text-amber-200"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New session
        </button>
      </div>

      {ordered.length === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-6 text-center text-xs text-zinc-500">
          No sessions yet — create one from a dataset below.
        </p>
      ) : (
        <div className="space-y-2">
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
            <p className="text-center text-[11px] text-zinc-600">
              {ordered.length - visible.length} more on the Sessions tab
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}
