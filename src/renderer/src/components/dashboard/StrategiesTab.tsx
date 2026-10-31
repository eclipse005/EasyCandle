import { useMemo, useState, type ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { cumulativeRealizedPnl, summarizeSession } from '@/lib/paperTrade'
import { formatPnlCcy, quoteCurrencyForSymbol } from '@shared/pnlCurrency'
import { useSessionStore } from '@/store/sessionStore'
import { useStrategiesStore } from '@/store/strategiesStore'

function StrategyStats({ strategyId }: { strategyId: string }): ReactNode {
  // Stable selector: subscribe to the raw array, filter in useMemo.
  const sessions = useSessionStore((s) => s.sessions)
  const filtered = useMemo(
    () => sessions.filter((x) => x.strategyId === strategyId),
    [sessions, strategyId]
  )
  const trades = useMemo(() => filtered.flatMap((s) => s.closedTrades), [filtered])

  const stats = useMemo(() => {
    if (trades.length === 0) return null
    const summary = summarizeSession(trades)
    const byCurrency = new Map<string, number>()
    for (const session of filtered) {
      const quote = quoteCurrencyForSymbol(session.symbol)
      byCurrency.set(
        quote,
        (byCurrency.get(quote) ?? 0) + cumulativeRealizedPnl(session.closedTrades)
      )
    }
    return { summary, byCurrency, sessionCount: filtered.length }
  }, [trades, filtered])

  if (!stats) {
    return (
      <span className="text-[11px] text-zinc-600">
        {filtered.length} session{filtered.length === 1 ? '' : 's'} · no trades yet
      </span>
    )
  }

  return (
    <span className="text-[11px] tabular-nums text-zinc-400">
      {stats.sessionCount} session{stats.sessionCount === 1 ? '' : 's'} ·{' '}
      {stats.summary.overall.count} trades ·{' '}
      {stats.summary.overall.winRate == null
        ? '—'
        : `${Math.round(stats.summary.overall.winRate * 100)}%`}{' '}
      win ·{' '}
      {[...stats.byCurrency.entries()].map(([ccy, v]) => formatPnlCcy(v, ccy)).join(' / ')}
    </span>
  )
}

export default function StrategiesTab(): ReactNode {
  const strategies = useStrategiesStore((s) => s.strategies)
  const add = useStrategiesStore((s) => s.add)
  const rename = useStrategiesStore((s) => s.rename)
  const remove = useStrategiesStore((s) => s.remove)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-zinc-100">Strategies</h2>
      <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
        Tag backtesting sessions with a strategy to compare their results.
      </p>

      <form
        className="mb-3 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (add(newName)) setNewName('')
        }}
      >
        <input
          type="text"
          value={newName}
          placeholder="New strategy name"
          aria-label="New strategy name"
          onChange={(event) => setNewName(event.target.value)}
          className="h-8 flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-100 outline-none focus:border-primary-500/50"
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-primary-500/40 bg-primary-500/15 px-3 text-xs font-medium text-primary-300 hover:border-primary-400/70 hover:bg-primary-500/25 hover:text-primary-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add
        </button>
      </form>

      {strategies.length === 0 ? (
        <p className="rounded-2xl border border-white/5 bg-zinc-900/40 px-3 py-8 text-center text-xs text-zinc-500">
          No strategies yet — add one and tag sessions with it.
        </p>
      ) : (
        <div className="space-y-2">
          {strategies.map((strategy) => (
            <div
              key={strategy.id}
              className="flex items-center gap-3 rounded-xl border border-white/5 bg-zinc-900/50 px-3.5 py-3 shadow-lg shadow-black/20"
            >
              <div className="min-w-0 flex-1">
                {editingId === strategy.id ? (
                  <input
                    type="text"
                    value={editText}
                    autoFocus
                    aria-label="Strategy name"
                    onChange={(event) => setEditText(event.target.value)}
                    onBlur={() => {
                      rename(strategy.id, editText)
                      setEditingId(null)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        rename(strategy.id, editText)
                        setEditingId(null)
                      }
                      if (event.key === 'Escape') setEditingId(null)
                    }}
                    className="h-7 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-100 outline-none focus:border-primary-500/50"
                  />
                ) : (
                  <button
                    type="button"
                    className="truncate text-left text-xs font-semibold text-zinc-100 hover:text-amber-300"
                    onClick={() => {
                      setEditingId(strategy.id)
                      setEditText(strategy.name)
                    }}
                  >
                    {strategy.name}
                  </button>
                )}
                <div className="mt-0.5">
                  <StrategyStats strategyId={strategy.id} />
                </div>
              </div>
              <button
                type="button"
                aria-label={`Delete strategy ${strategy.name}`}
                onClick={() => remove(strategy.id)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
