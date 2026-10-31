import { useEffect, useMemo } from 'react'
import { Download, X } from 'lucide-react'
import {
  equityCurve,
  formatExitReason,
  formatPositionSize,
  formatWinRate,
  tradesToCsv,
  type EquityPoint,
  type SideReport
} from '@/lib/paperTrade'
import { accountPnlFromQuote, formatPnlCcy, quoteCurrencyForSymbol } from '@shared/pnlCurrency'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import { formatAssetPrice, resolvePricePrecision } from '@shared/pricePrecision'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { softType } from '@/components/ui/softTokens'
import { cn } from '@/components/ui/cn'

function ReportBlock({ title, report, quote }: { title: string; report: SideReport; quote: string }) {
  return (
    <section className="min-w-0 flex-1">
      <h3 className={cn("mb-2 uppercase tracking-[0.14em]", softType.micro)}>{title}</h3>
      <dl className={cn("grid grid-cols-2 gap-x-3 gap-y-2 tabular-nums", softType.caption)}>
        <div>
          <dt className="text-zinc-600">Trades</dt>
          <dd className="text-zinc-200">{report.count}</dd>
        </div>
        <div>
          <dt className="text-zinc-600">Win rate</dt>
          <dd className="text-zinc-200">{formatWinRate(report.winRate)}</dd>
        </div>
        <div>
          <dt className="text-zinc-600">Wins / losses</dt>
          <dd className="text-zinc-200">
            {report.wins} / {report.losses}
            {report.breakeven > 0 ? (
              <span className="text-zinc-600"> · {report.breakeven} BE</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-600">Total PnL</dt>
          <dd className={report.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {formatPnlCcy(report.totalPnl, quote)}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-600">Max profit</dt>
          <dd className="text-emerald-400">{formatPnlCcy(report.maxProfit, quote)}</dd>
        </div>
        <div>
          <dt className="text-zinc-600">Max loss</dt>
          <dd className="text-red-400">{formatPnlCcy(report.maxLoss, quote)}</dd>
        </div>
      </dl>
    </section>
  )
}

function EquityCurveChart({
  points,
  quote
}: {
  points: EquityPoint[]
  quote: string
}) {
  if (points.length < 2) return null
  const width = 560
  const height = 120
  const padX = 8
  const padY = 10
  const equities = points.map((p) => p.equity)
  const minE = Math.min(...equities)
  const maxE = Math.max(...equities)
  const span = maxE - minE || 1
  const coords = points.map((p, i) => {
    const x = padX + (i / (points.length - 1)) * (width - padX * 2)
    const y = padY + (1 - (p.equity - minE) / span) * (height - padY * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const last = points[points.length - 1]
  const up = last.equity >= points[0].equity
  return (
    <div className="mb-4 rounded-xl border border-white/5 bg-zinc-900/50 p-3 shadow-lg shadow-black/10">
      <div className="mb-2 flex items-center justify-between">
        <h3 className={cn("uppercase tracking-[0.14em]", softType.micro)}>Equity curve</h3>
        <span className={`text-caption tabular-nums ${up ? 'text-emerald-400' : 'text-red-400'}`}>
          {formatPnlCcy(last.equity, quote)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-28 w-full"
        role="img"
        aria-label="Session equity curve"
      >
        <polyline
          fill="none"
          stroke={up ? '#34d399' : '#f87171'}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={coords.join(' ')}
        />
      </svg>
    </div>
  )
}

export default function SessionReportDialog() {
  const sessionReport = useReplayStore((s) => s.sessionReport)
  const dismissSessionReport = useReplayStore((s) => s.dismissSessionReport)
  const previewSessionReport = useUiLayoutStore((s) => s.previewSessionReport)
  const setPreviewSessionReport = useUiLayoutStore((s) => s.setPreviewSessionReport)

  const report = sessionReport ?? previewSessionReport

  function dismiss(): void {
    if (sessionReport) {
      dismissSessionReport()
    } else {
      setPreviewSessionReport(null)
    }
  }

  useEffect(() => {
    if (!report) return undefined

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        dismiss()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [report, dismiss])

  const curve = useMemo(() => {
    if (!report) return []
    const start = report.startingBalance ?? 100000
    return equityCurve(start, report.trades)
  }, [report])

  if (!report) return null

  const { symbol, timeframe, trades, summary, closedOpenOnExit } = report
  const quoteCurrency = quoteCurrencyForSymbol(symbol)
  // Account-currency (USD) session total — only when every exit price on this
  // chart can provide the conversion rate (issue #51).
  let sessionUsd: number | null = null
  if (quoteCurrency !== 'USD') {
    sessionUsd = 0
    for (const trade of trades) {
      const usd = accountPnlFromQuote(trade.pnl, symbol, trade.exitPrice)
      if (usd == null) {
        sessionUsd = null
        break
      }
      sessionUsd += usd
    }
  }
  const pricePrecision = resolvePricePrecision(
    symbol,
    trades.map((trade) => ({
      open: trade.entryPrice,
      high: trade.entryPrice,
      low: trade.exitPrice,
      close: trade.exitPrice
    }))
  )

  function exportCsv(): void {
    const csv = tradesToCsv(trades)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const link = document.createElement('a')
    link.href = url
    link.download = `bar-replay-${symbol}-${timeframe}-${stamp}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="presentation"
      onClick={dismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-report-title"
        className="flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 id="session-report-title" className="text-sm font-semibold text-zinc-100">
              Session performance
            </h2>
            <p className={cn("mt-1", softType.caption)}>
              {symbol} · {timeframe} · {trades.length} closed trade
              {trades.length === 1 ? '' : 's'}
              {closedOpenOnExit ? ' · open flattened at exit (excluded from win rate)' : null}
              {sessionUsd != null ? ` · ≈ ${formatPnlCcy(sessionUsd, 'USD')}` : null}
              {sessionUsd == null && quoteCurrency !== 'USD'
                ? ` · P/L in ${quoteCurrency}`
                : null}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close report"
            onClick={dismiss}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="mb-4 flex flex-col gap-4 border-b border-zinc-800/80 pb-4 sm:flex-row">
            <ReportBlock title="Overall" report={summary.overall} quote={quoteCurrency} />
            <div className="hidden w-px bg-zinc-800 sm:block" aria-hidden />
            <ReportBlock title="Long" report={summary.long} quote={quoteCurrency} />
            <div className="hidden w-px bg-zinc-800 sm:block" aria-hidden />
            <ReportBlock title="Short" report={summary.short} quote={quoteCurrency} />
          </div>

          <EquityCurveChart points={curve} quote={quoteCurrency} />

          <h3 className={cn("mb-2 uppercase tracking-[0.14em]", softType.micro)}>Trades</h3>
          <ul className={cn("divide-y divide-zinc-800/80", softType.caption)}>
            {trades.map((trade) => (
              <li
                key={`${trade.id}-${trade.exitTime}`}
                className="flex flex-col gap-0.5 py-1.5 text-zinc-400"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums">
                  <span
                    className={
                      trade.side === 'long'
                        ? 'font-semibold text-emerald-400/90'
                        : 'font-semibold text-red-400/90'
                    }
                  >
                    {trade.side.toUpperCase()}
                  </span>
                  <span className="text-zinc-500">{formatPositionSize(trade.lots, symbol)}</span>
                  <span className="rounded bg-zinc-900/80 px-1 py-0.5 text-micro uppercase tracking-wide text-zinc-500">
                    {formatExitReason(trade.exitReason)}
                  </span>
                  <span>
                    {formatAssetPrice(trade.entryPrice, pricePrecision)} →{' '}
                    {formatAssetPrice(trade.exitPrice, pricePrecision)}
                  </span>
                  <span className="text-zinc-600">
                    {formatUtcCandleTime(trade.entryTime)} → {formatUtcCandleTime(trade.exitTime)}
                  </span>
                  <span
                    className={`ml-auto font-medium ${
                      trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {formatPnlCcy(trade.pnl, quoteCurrency)}
                  </span>
                </div>
                {trade.note ? (
                  <p className={cn("pl-0.5 italic", softType.micro)}>{trade.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 text-caption font-medium text-zinc-200 hover:border-zinc-500 hover:text-zinc-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export CSV
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex h-8 items-center rounded-xl border border-primary-500/40 bg-primary-500/15 px-3 text-caption font-medium text-primary-300 hover:border-primary-400/70 hover:bg-primary-500/25 hover:text-primary-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
