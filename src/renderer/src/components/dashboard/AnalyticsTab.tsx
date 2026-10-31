import { useMemo, type ReactNode } from 'react'
import SoftCard from '@/components/ui/SoftCard'
import SoftEmpty from '@/components/ui/SoftEmpty'
import { formatPnl } from '@/lib/paperTrade'
import { useSessionStore } from '@/store/sessionStore'
import {
  computeLocalPerformance,
  formatWinRatePct
} from '@/lib/localPerformance'

/** Simple local analytics summary — no paywall locks. */
export default function AnalyticsTab(): ReactNode {
  const sessions = useSessionStore((s) => s.sessions)
  const stats = useMemo(() => computeLocalPerformance(sessions), [sessions])

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
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SoftCard className="px-4 py-4">
          <p className="text-caption text-zinc-500">Win rate</p>
          <p className="mt-1.5 text-metric tabular-nums text-zinc-50">
            {formatWinRatePct(stats.winRate)}
          </p>
          <p className="mt-1 text-caption text-zinc-600">
            {stats.wins}W / {stats.losses}L · {stats.tradesTaken} trades
          </p>
        </SoftCard>
        <SoftCard className="px-4 py-4">
          <p className="text-caption text-zinc-500">Realized PnL</p>
          <p
            className={`mt-1.5 text-metric tabular-nums ${
              stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {formatPnl(stats.totalPnl)}
          </p>
          <p className="mt-1 text-caption text-zinc-600">Across all sessions (quote mix)</p>
        </SoftCard>
        <SoftCard className="px-4 py-4">
          <p className="text-caption text-zinc-500">Sessions</p>
          <p className="mt-1.5 text-metric tabular-nums text-zinc-50">{stats.sessionCount}</p>
          <p className="mt-1 text-caption text-zinc-600">Stored locally</p>
        </SoftCard>
      </div>

      <SoftCard className="px-5 py-5">
        <h2 className="text-section text-zinc-100">Trades by symbol</h2>
        <p className="mt-1 text-caption text-zinc-500">Win rate and realized PnL from local closes.</p>
        <ul className="mt-4 space-y-3">
          {bySymbol.map((row) => (
            <li key={row.symbol}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="text-card-title text-zinc-200">{row.symbol}</span>
                <span className="text-caption text-zinc-500">
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
  )
}
