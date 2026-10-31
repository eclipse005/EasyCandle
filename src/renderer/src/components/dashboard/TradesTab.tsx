import { useMemo, type ReactNode } from 'react'
import SoftCard from '@/components/ui/SoftCard'
import SoftEmpty from '@/components/ui/SoftEmpty'
import { formatExitReason } from '@/lib/paperTrade'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import { formatPnlCcy, quoteCurrencyForSymbol } from '@shared/pnlCurrency'
import { useSessionStore } from '@/store/sessionStore'
import { aggregateClosedTrades } from '@/lib/localPerformance'

/** Aggregate closed trades across all local sessions. */
export default function TradesTab(): ReactNode {
  const sessions = useSessionStore((s) => s.sessions)
  const rows = useMemo(() => aggregateClosedTrades(sessions), [sessions])

  if (rows.length === 0) {
    return (
      <SoftEmpty>
        No closed trades yet — open a session and take paper trades to see them here.
      </SoftEmpty>
    )
  }

  return (
    <SoftCard className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-white/[0.06] text-caption text-zinc-500">
              <th className="px-4 py-3 font-medium">Exit</th>
              <th className="px-4 py-3 font-medium">Session</th>
              <th className="px-4 py-3 font-medium">Symbol</th>
              <th className="px-4 py-3 font-medium">Side</th>
              <th className="px-4 py-3 font-medium">Lots</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium text-right">PnL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const quote = quoteCurrencyForSymbol(row.symbol)
              return (
                <tr
                  key={`${row.sessionId}:${row.id}`}
                  className="border-b border-white/[0.04] text-body text-zinc-300 last:border-0"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 text-caption text-zinc-500">
                    {formatUtcCandleTime(row.exitTime)}
                  </td>
                  <td className="max-w-[10rem] truncate px-4 py-2.5 text-zinc-200">
                    {row.sessionName}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{row.symbol}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        row.side === 'long' ? 'text-emerald-400' : 'text-red-400'
                      }
                    >
                      {row.side === 'long' ? 'Buy' : 'Sell'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-zinc-400">{row.lots}</td>
                  <td className="px-4 py-2.5 text-zinc-500">{formatExitReason(row.exitReason)}</td>
                  <td
                    className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                      row.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {formatPnlCcy(row.pnl, quote)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </SoftCard>
  )
}
