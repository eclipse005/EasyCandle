import { useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import SoftButton from '@/components/ui/SoftButton'
import SoftCard from '@/components/ui/SoftCard'
import SoftEmpty from '@/components/ui/SoftEmpty'
import { SoftInput, SoftSelect } from '@/components/ui/SoftInput'
import { cn } from '@/components/ui/cn'
import { softSpace, softType } from '@/components/ui/softTokens'
import { formatExitReason } from '@/lib/paperTrade'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import { formatPnlCcy, quoteCurrencyForSymbol } from '@shared/pnlCurrency'
import { formatAssetPrice, resolvePricePrecision } from '@shared/pricePrecision'
import { useSessionStore } from '@/store/sessionStore'
import {
  aggregateTrades,
  type AggregatedTradeRow,
  type TradeRowStatus
} from '@/lib/localPerformance'

type SideFilter = 'all' | 'long' | 'short'
type StatusFilter = 'all' | TradeRowStatus
type OutcomeFilter = 'all' | 'win' | 'loss' | 'be' | 'open'
type EntryTypeFilter = 'all' | 'market' | 'limit' | 'stop-limit'
type SortKey = 'time' | 'entry' | 'pnl' | 'symbol'

const PAGE_SIZES = [10, 25, 50] as const

function entryTypeLabel(row: AggregatedTradeRow): string {
  if (row.status === 'pending') {
    if (row.pendingKind === 'stopLimit') return 'stop-limit'
    return 'limit'
  }
  if (row.pendingKind === 'limit') return 'limit'
  if (row.pendingKind === 'stopLimit') return 'stop-limit'
  return 'market'
}

function outcomeOf(row: AggregatedTradeRow): 'win' | 'loss' | 'be' | 'open' {
  if (row.status !== 'closed' || row.pnl == null) return 'open'
  if (row.pnl > 0) return 'win'
  if (row.pnl < 0) return 'loss'
  return 'be'
}

function returnPct(row: AggregatedTradeRow): number | null {
  if (row.exitPrice == null || !(row.entryPrice > 0) || !Number.isFinite(row.exitPrice)) {
    return null
  }
  const raw =
    row.side === 'long'
      ? (row.exitPrice - row.entryPrice) / row.entryPrice
      : (row.entryPrice - row.exitPrice) / row.entryPrice
  return raw * 100
}

function returnR(row: AggregatedTradeRow): number | null {
  if (row.exitPrice == null || row.stopLoss == null || !Number.isFinite(row.stopLoss)) {
    return null
  }
  const risk =
    row.side === 'long'
      ? row.entryPrice - row.stopLoss
      : row.stopLoss - row.entryPrice
  if (!(risk > 0)) return null
  const move =
    row.side === 'long'
      ? row.exitPrice - row.entryPrice
      : row.entryPrice - row.exitPrice
  return move / risk
}

function statusBadge(status: TradeRowStatus): { label: string; className: string } {
  switch (status) {
    case 'open':
      return { label: 'Open', className: 'bg-teal-500/15 text-teal-300' }
    case 'pending':
      return { label: 'Pending', className: 'bg-amber-500/15 text-amber-300' }
    default:
      return { label: 'Closed', className: 'bg-zinc-800/80 text-zinc-300' }
  }
}

/** Chart time is unix seconds — date inputs are local YYYY-MM-DD. */
function dayBounds(from: string, to: string): { fromSec: number | null; toSec: number | null } {
  let fromSec: number | null = null
  let toSec: number | null = null
  if (from) {
    const d = new Date(`${from}T00:00:00`)
    if (!Number.isNaN(d.getTime())) fromSec = Math.floor(d.getTime() / 1000)
  }
  if (to) {
    const d = new Date(`${to}T23:59:59.999`)
    if (!Number.isNaN(d.getTime())) toSec = Math.floor(d.getTime() / 1000)
  }
  return { fromSec, toSec }
}

/** Aggregate open / pending / closed trades — FXR Basic filters locally. */
export default function TradesTab(): ReactNode {
  const sessions = useSessionStore((s) => s.sessions)
  const allRows = useMemo(() => aggregateTrades(sessions), [sessions])

  const [sessionFilter, setSessionFilter] = useState<string>('all')
  const [sideFilter, setSideFilter] = useState<SideFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all')
  const [entryTypeFilter, setEntryTypeFilter] = useState<EntryTypeFilter>('all')
  const [assetFilter, setAssetFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('time')
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10)
  const [page, setPage] = useState(0)

  const sessionOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of sessions) map.set(s.id, s.name)
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [sessions])

  const assetOptions = useMemo(() => {
    const set = new Set<string>()
    for (const s of sessions) set.add(s.symbol)
    return [...set].sort()
  }, [sessions])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const { fromSec, toSec } = dayBounds(dateFrom, dateTo)
    let rows = allRows
    if (sessionFilter !== 'all') rows = rows.filter((r) => r.sessionId === sessionFilter)
    if (sideFilter !== 'all') rows = rows.filter((r) => r.side === sideFilter)
    if (statusFilter !== 'all') rows = rows.filter((r) => r.status === statusFilter)
    if (outcomeFilter !== 'all') rows = rows.filter((r) => outcomeOf(r) === outcomeFilter)
    if (entryTypeFilter !== 'all') {
      rows = rows.filter((r) => entryTypeLabel(r) === entryTypeFilter)
    }
    if (assetFilter !== 'all') rows = rows.filter((r) => r.symbol === assetFilter)
    if (fromSec != null || toSec != null) {
      rows = rows.filter((r) => {
        const t = r.exitTime ?? r.entryTime
        if (fromSec != null && t < fromSec) return false
        if (toSec != null && t > toSec) return false
        return true
      })
    }
    if (q) {
      rows = rows.filter(
        (r) =>
          r.sessionName.toLowerCase().includes(q) ||
          r.symbol.toLowerCase().includes(q) ||
          entryTypeLabel(r).includes(q) ||
          r.status.includes(q) ||
          (r.exitReason ? formatExitReason(r.exitReason).toLowerCase().includes(q) : false)
      )
    }
    const sorted = [...rows]
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'entry':
          return b.entryTime - a.entryTime
        case 'pnl':
          return (b.pnl ?? Number.NEGATIVE_INFINITY) - (a.pnl ?? Number.NEGATIVE_INFINITY)
        case 'symbol':
          return a.symbol.localeCompare(b.symbol) || b.entryTime - a.entryTime
        case 'time':
        default: {
          const ta = a.exitTime ?? a.entryTime
          const tb = b.exitTime ?? b.entryTime
          return tb - ta
        }
      }
    })
    return sorted
  }, [
    allRows,
    sessionFilter,
    sideFilter,
    statusFilter,
    outcomeFilter,
    entryTypeFilter,
    assetFilter,
    dateFrom,
    dateTo,
    query,
    sortKey
  ])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize)

  function resetFilters(): void {
    setSessionFilter('all')
    setSideFilter('all')
    setStatusFilter('all')
    setOutcomeFilter('all')
    setEntryTypeFilter('all')
    setAssetFilter('all')
    setDateFrom('')
    setDateTo('')
    setQuery('')
    setPage(0)
  }

  if (allRows.length === 0) {
    return (
      <SoftEmpty>
        No trades yet — open a session and take paper trades (open, pending, or closed show here).
      </SoftEmpty>
    )
  }

  return (
    <section className={softSpace.sectionGap}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[10rem] flex-1">
          <span className={cn('mb-1.5 block', softType.caption)}>Session</span>
          <SoftSelect
            className="h-11 text-body"
            value={sessionFilter}
            onChange={(e) => {
              setSessionFilter(e.target.value)
              setPage(0)
            }}
          >
            <option value="all">All sessions</option>
            {sessionOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </SoftSelect>
        </label>
        <label className="min-w-[8rem]">
          <span className={cn('mb-1.5 block', softType.caption)}>Asset</span>
          <SoftSelect
            className="h-11 text-body"
            value={assetFilter}
            onChange={(e) => {
              setAssetFilter(e.target.value)
              setPage(0)
            }}
          >
            <option value="all">All</option>
            {assetOptions.map((sym) => (
              <option key={sym} value={sym}>
                {sym}
              </option>
            ))}
          </SoftSelect>
        </label>
        <label className="min-w-[8rem]">
          <span className={cn('mb-1.5 block', softType.caption)}>Side</span>
          <SoftSelect
            className="h-11 text-body"
            value={sideFilter}
            onChange={(e) => {
              setSideFilter(e.target.value as SideFilter)
              setPage(0)
            }}
          >
            <option value="all">All</option>
            <option value="long">Buy</option>
            <option value="short">Sell</option>
          </SoftSelect>
        </label>
        <label className="min-w-[8rem]">
          <span className={cn('mb-1.5 block', softType.caption)}>Outcome</span>
          <SoftSelect
            className="h-11 text-body"
            value={outcomeFilter}
            onChange={(e) => {
              setOutcomeFilter(e.target.value as OutcomeFilter)
              setPage(0)
            }}
          >
            <option value="all">All</option>
            <option value="win">Wins</option>
            <option value="loss">Losses</option>
            <option value="be">Break-even</option>
            <option value="open">Open / pending</option>
          </SoftSelect>
        </label>
        <label className="min-w-[8rem]">
          <span className={cn('mb-1.5 block', softType.caption)}>Type</span>
          <SoftSelect
            className="h-11 text-body"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter)
              setPage(0)
            }}
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="closed">Closed</option>
          </SoftSelect>
        </label>
        <label className="min-w-[8rem]">
          <span className={cn('mb-1.5 block', softType.caption)}>Entry type</span>
          <SoftSelect
            className="h-11 text-body"
            value={entryTypeFilter}
            onChange={(e) => {
              setEntryTypeFilter(e.target.value as EntryTypeFilter)
              setPage(0)
            }}
          >
            <option value="all">All</option>
            <option value="market">Market</option>
            <option value="limit">Limit</option>
            <option value="stop-limit">Stop-limit</option>
          </SoftSelect>
        </label>
        <label className="min-w-[9rem]">
          <span className={cn('mb-1.5 block', softType.caption)}>From</span>
          <SoftInput
            type="date"
            className="h-11 text-body"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              setPage(0)
            }}
          />
        </label>
        <label className="min-w-[9rem]">
          <span className={cn('mb-1.5 block', softType.caption)}>To</span>
          <SoftInput
            type="date"
            className="h-11 text-body"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value)
              setPage(0)
            }}
          />
        </label>
        <label className="min-w-[8rem]">
          <span className={cn('mb-1.5 block', softType.caption)}>Sort</span>
          <SoftSelect
            className="h-11 text-body"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            <option value="time">Latest</option>
            <option value="entry">Entry time</option>
            <option value="pnl">PnL</option>
            <option value="symbol">Symbol</option>
          </SoftSelect>
        </label>
        <label className="min-w-[12rem] flex-[2]">
          <span className={cn('mb-1.5 block', softType.caption)}>Search</span>
          <SoftInput
            className="h-11 text-body"
            placeholder="Symbol, session…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
          />
        </label>
        <SoftButton size="sm" variant="ghost" onClick={resetFilters}>
          Clear filters
        </SoftButton>
      </div>

      <p className={softType.caption}>
        {filtered.length} trade{filtered.length === 1 ? '' : 's'}
        {filtered.length !== allRows.length ? ` (of ${allRows.length})` : ''} · local only
      </p>

      <SoftCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-left">
            <thead>
              <tr className="border-b border-white/[0.06] text-caption text-zinc-500">
                <th className="px-4 py-3.5 font-medium">Session</th>
                <th className="px-4 py-3.5 font-medium">Type</th>
                <th className="px-4 py-3.5 font-medium">Entry (chart)</th>
                <th className="px-4 py-3.5 font-medium">Exit (chart)</th>
                <th className="px-4 py-3.5 font-medium">Asset</th>
                <th className="px-4 py-3.5 font-medium">Side</th>
                <th className="px-4 py-3.5 font-medium">Entry type</th>
                <th className="px-4 py-3.5 font-medium text-right">Entry</th>
                <th className="px-4 py-3.5 font-medium text-right">Exit</th>
                <th className="px-4 py-3.5 font-medium text-right">Return ($)</th>
                <th className="px-4 py-3.5 font-medium text-right">Return (%)</th>
                <th className="px-4 py-3.5 font-medium text-right">Return (R)</th>
                <th className="px-4 py-3.5 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const quote = quoteCurrencyForSymbol(row.symbol)
                const precision = resolvePricePrecision(row.symbol)
                const pct = returnPct(row)
                const rMult = returnR(row)
                const badge = statusBadge(row.status)
                return (
                  <tr
                    key={`${row.sessionId}:${row.status}:${row.id}`}
                    className="border-b border-white/[0.04] text-body text-zinc-300 last:border-0"
                  >
                    <td className="max-w-[10rem] truncate px-4 py-3 text-zinc-200">
                      {row.sessionName}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded-lg px-2 py-0.5 text-caption font-medium',
                          badge.className
                        )}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-caption text-zinc-500">
                      {formatUtcCandleTime(row.entryTime)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-caption text-zinc-500">
                      {row.exitTime != null ? formatUtcCandleTime(row.exitTime) : '—'}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-zinc-200">{row.symbol}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded-lg px-2 py-0.5 text-caption font-medium',
                          row.side === 'long'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-red-500/15 text-red-400'
                        )}
                      >
                        {row.side === 'long' ? 'Buy' : 'Sell'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-lg bg-zinc-800/60 px-2 py-0.5 text-caption text-zinc-400">
                        {entryTypeLabel(row)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-400">
                      {formatAssetPrice(row.entryPrice, precision)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-400">
                      {row.exitPrice != null ? formatAssetPrice(row.exitPrice, precision) : '—'}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 text-right tabular-nums font-medium',
                        row.pnl == null
                          ? 'text-zinc-600'
                          : row.pnl >= 0
                            ? 'text-emerald-400'
                            : 'text-red-400'
                      )}
                    >
                      {row.pnl == null ? 'N/A' : formatPnlCcy(row.pnl, quote)}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 text-right tabular-nums',
                        pct == null
                          ? 'text-zinc-600'
                          : pct >= 0
                            ? 'text-emerald-400'
                            : 'text-red-400'
                      )}
                    >
                      {pct == null ? 'N/A' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 text-right tabular-nums',
                        rMult == null
                          ? 'text-zinc-600'
                          : rMult >= 0
                            ? 'text-emerald-400'
                            : 'text-red-400'
                      )}
                    >
                      {rMult == null ? 'N/A' : `${rMult >= 0 ? '+' : ''}${rMult.toFixed(2)}R`}
                    </td>
                    <td className="px-4 py-3 text-caption text-zinc-500">
                      {row.exitReason ? formatExitReason(row.exitReason) : '—'}
                      {row.note ? (
                        <span className="mt-0.5 block truncate text-zinc-600" title={row.note}>
                          {row.note}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-2">
            <SoftButton
              size="sm"
              variant="secondary"
              disabled={safePage <= 0}
              aria-label="Previous page"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </SoftButton>
            <span className={cn('min-w-[4rem] text-center', softType.body)}>
              {safePage + 1} / {pageCount}
            </span>
            <SoftButton
              size="sm"
              variant="secondary"
              disabled={safePage >= pageCount - 1}
              aria-label="Next page"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </SoftButton>
          </div>
          <label className="flex items-center gap-2">
            <span className={softType.caption}>Per page</span>
            <SoftSelect
              className="h-9 w-20"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])
                setPage(0)
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </SoftSelect>
          </label>
          <span className={softType.caption}>
            Showing {pageRows.length ? safePage * pageSize + 1 : 0}–
            {safePage * pageSize + pageRows.length} of {filtered.length}
          </span>
        </div>
      </SoftCard>
    </section>
  )
}
