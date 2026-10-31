import { useMemo, useState, type ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { cumulativeRealizedPnl, summarizeSession } from '@/lib/paperTrade'
import { formatPnlCcy, quoteCurrencyForSymbol } from '@shared/pnlCurrency'
import { useSessionStore } from '@/store/sessionStore'
import { useStrategiesStore } from '@/store/strategiesStore'
import SoftButton from '@/components/ui/SoftButton'
import SoftCard from '@/components/ui/SoftCard'
import SoftEmpty from '@/components/ui/SoftEmpty'
import { SoftInput } from '@/components/ui/SoftInput'

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
      <h2 className="mb-4 text-[13px] font-medium text-zinc-400">Strategy tags</h2>

      <form
        className="mb-4 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (add(newName)) setNewName('')
        }}
      >
        <SoftInput
          type="text"
          value={newName}
          placeholder="New strategy name"
          aria-label="New strategy name"
          className="flex-1"
          onChange={(event) => setNewName(event.target.value)}
        />
        <SoftButton type="submit" variant="primary" disabled={!newName.trim()}>
          <Plus className="h-4 w-4" aria-hidden />
          Add
        </SoftButton>
      </form>

      {strategies.length === 0 ? (
        <SoftEmpty>No strategies yet — add one and tag sessions with it.</SoftEmpty>
      ) : (
        <div className="space-y-2.5">
          {strategies.map((strategy) => (
            <SoftCard
              key={strategy.id}
              elevated
              className="flex items-center gap-3 px-4 py-3.5"
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
                    className="h-8 w-full rounded-xl border border-white/10 bg-zinc-900/70 px-2.5 text-xs text-zinc-100 outline-none focus:border-primary-500/40"
                  />
                ) : (
                  <button
                    type="button"
                    className="truncate text-left text-[13px] font-semibold text-zinc-100 hover:text-primary-300"
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
              <SoftButton
                size="sm"
                variant="ghost"
                aria-label={`Delete strategy ${strategy.name}`}
                onClick={() => remove(strategy.id)}
                className="!h-7 !w-7 !px-0 hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </SoftButton>
            </SoftCard>
          ))}
        </div>
      )}
    </section>
  )
}
