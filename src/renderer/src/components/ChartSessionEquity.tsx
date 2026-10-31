import {
  pnlScaleForSymbol,
  sessionPerformance,
  unrealizedPnlTotal
} from '@/lib/paperTrade'
import { formatPnlCcy, quoteCurrencyForSymbol } from '@shared/pnlCurrency'
import { useReplayStore, selectPriceFollowCandle } from '@/store/replayStore'
import { useSessionStore } from '@/store/sessionStore'

/**
 * FX Replay–style chart overlay: equity + session PnL (bottom-right).
 */
export default function ChartSessionEquity({
  priceScaleWidth = 0
}: {
  priceScaleWidth?: number
}) {
  const mode = useReplayStore((s) => s.mode)
  const positions = useReplayStore((s) => s.positions)
  const closedTrades = useReplayStore((s) => s.closedTrades)
  const currentCandle = useReplayStore(selectPriceFollowCandle)
  const symbol = useReplayStore((s) => s.symbol)
  const contractSizeOverride = useReplayStore((s) => s.importMeta?.contractSize)
  const activeSession = useSessionStore((s) =>
    s.activeSessionId ? (s.sessions.find((x) => x.id === s.activeSessionId) ?? null) : null
  )

  if (mode !== 'replay') return null

  const quoteCurrency = quoteCurrencyForSymbol(symbol)
  const mark = currentCandle?.close
  const openPnl = unrealizedPnlTotal(positions, mark, (p) =>
    pnlScaleForSymbol(symbol, p.lots, contractSizeOverride)
  )
  const perf = sessionPerformance(closedTrades, positions, mark, (p) =>
    pnlScaleForSymbol(symbol, p.lots, contractSizeOverride)
  )
  const starting = activeSession?.startingBalance ?? 100000
  // Equity ≈ starting + realized + open unrealized (same idea as blotter Balance + Open).
  const equity = starting + perf.realized + (openPnl ?? 0)
  const sessionPnl = perf.total
  const pnlPositive = sessionPnl >= 0

  return (
    <div
      className="pointer-events-none absolute bottom-7 z-20 flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/95 px-2.5 py-1.5 text-[11px] tabular-nums shadow-lg shadow-black/40 backdrop-blur-sm"
      style={{ right: Math.max(priceScaleWidth, 0) + 8 }}
      data-tour="chart-session-equity"
    >
      <span className="text-zinc-500">
        Equity{' '}
        <span className="font-semibold text-zinc-100">{formatPnlCcy(equity, quoteCurrency)}</span>
      </span>
      <span className="text-zinc-600" aria-hidden>
        ·
      </span>
      <span className="text-zinc-500">
        Session{' '}
        <span className={`font-semibold ${pnlPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {pnlPositive ? '+' : ''}
          {formatPnlCcy(sessionPnl, quoteCurrency)}
        </span>
      </span>
    </div>
  )
}
