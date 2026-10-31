import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { IMPORT_STORED_TIMEFRAMES } from '@shared/candleAggregate'
import type { ImportedDatasetMeta } from '@shared/importTypes'
import { DEFAULT_CHART_TIMEZONE, parseSessionParts, toSessionParts } from '@/lib/chartTimezone'
import { useReplayStore } from '@/store/replayStore'
import { useSessionStore } from '@/store/sessionStore'
import { useStrategiesStore } from '@/store/strategiesStore'

export type CreateSessionDialogProps = {
  open: boolean
  /** When set, the dataset/timeframe/name prefill from this dataset. */
  presetDataset: ImportedDatasetMeta | null
  onClose: () => void
}

function dateInputFor(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return ''
  return toSessionParts(unixSeconds, DEFAULT_CHART_TIMEZONE).date
}

/**
 * New-backtesting-session wizard: pick a dataset, timeframe, start date,
 * initial balance, and optional strategy, then enter the session.
 */
export default function CreateSessionDialog({
  open,
  presetDataset,
  onClose
}: CreateSessionDialogProps): ReactNode {
  const imports = useReplayStore((s) => s.importedList)
  const openSession = useSessionStore((s) => s.openSession)
  const strategies = useStrategiesStore((s) => s.strategies)

  const [datasetId, setDatasetId] = useState('')
  const [timeframe, setTimeframe] = useState('1m')
  const [startDate, setStartDate] = useState('')
  const [balance, setBalance] = useState('100000')
  const [strategyId, setStrategyId] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const dataset = useMemo(
    () => imports.find((m) => m.id === (presetDataset?.id ?? datasetId)) ?? null,
    [imports, presetDataset, datasetId]
  )
  const timeframes = useMemo(() => {
    if (!dataset) return []
    return IMPORT_STORED_TIMEFRAMES.filter((tf) => dataset.timeframes[tf] != null)
  }, [dataset])

  useEffect(() => {
    if (!open) return
    setError(null)
    setBusy(false)
    const meta = presetDataset ?? imports[0]
    if (meta) {
      setDatasetId(meta.id)
      const tf = meta.timeframes[meta.timeframe] != null ? meta.timeframe : '1m'
      setTimeframe(tf)
      setStartDate(dateInputFor(meta.timeframes[tf]?.firstTime))
    } else {
      setDatasetId('')
      setTimeframe('1m')
      setStartDate('')
    }
    setBalance('100000')
    setStrategyId('')
    setName('')
  }, [open, presetDataset, imports])

  useEffect(() => {
    if (!open || !dataset) return
    setStartDate(dateInputFor(dataset.timeframes[timeframe]?.firstTime))
  }, [open, dataset, timeframe])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  function submit(): void {
    if (!dataset) {
      setError('Select a dataset.')
      return
    }
    if (!startDate) {
      setError('Start date is required.')
      return
    }
    const seconds = parseSessionParts(startDate, '00:00', DEFAULT_CHART_TIMEZONE)
    if (seconds == null) {
      setError('Enter a valid start date (YYYY-MM-DD).')
      return
    }
    const balanceNumber = Number(balance)
    if (!Number.isFinite(balanceNumber) || balanceNumber <= 0) {
      setError('Initial balance must be a positive number.')
      return
    }

    setBusy(true)
    setError(null)
    void openSession({
      name,
      datasetId: dataset.id,
      timeframe,
      startDate: seconds,
      balance: balanceNumber,
      strategyId: strategyId || undefined
    }).then((id) => {
      setBusy(false)
      if (id) onClose()
      else setError('Could not start the session — check that the dataset still exists.')
    })
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-session-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 id="create-session-title" className="text-sm font-semibold text-zinc-100">
              New backtesting session
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              The chart opens at your start date, revealing candles as you step forward.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4 text-[12px]">
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              Dataset{imports.length === 0 ? ' — import a CSV first' : ' *'}
            </span>
            <select
              value={datasetId}
              disabled={busy || imports.length === 0}
              aria-label="Dataset"
              onChange={(event) => setDatasetId(event.target.value)}
              className="mt-1 h-8 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-2 font-medium text-zinc-100 outline-none focus:border-primary-500/50 disabled:opacity-40"
            >
              {imports.length === 0 ? <option value="">No datasets</option> : null}
              {imports.map((meta) => (
                <option key={meta.id} value={meta.id}>
                  {meta.symbol} · {meta.candleCount.toLocaleString()} × 1m
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Timeframe
              </span>
              <select
                value={timeframe}
                disabled={busy}
                aria-label="Timeframe"
                onChange={(event) => setTimeframe(event.target.value)}
                className="mt-1 h-8 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-2 font-medium text-zinc-100 outline-none focus:border-primary-500/50 disabled:opacity-40"
              >
                {timeframes.map((tf) => (
                  <option key={tf} value={tf}>
                    {tf}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Start date
              </span>
              <input
                type="date"
                value={startDate}
                disabled={busy}
                aria-label="Start date"
                onChange={(event) => setStartDate(event.target.value)}
                className="mt-1 h-8 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-2 font-medium text-zinc-100 outline-none focus:border-primary-500/50 disabled:opacity-40"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Initial balance
              </span>
              <input
                type="number"
                min="0"
                value={balance}
                disabled={busy}
                aria-label="Initial balance"
                onChange={(event) => setBalance(event.target.value)}
                className="mt-1 h-8 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-2 font-medium tabular-nums text-zinc-100 outline-none focus:border-primary-500/50 disabled:opacity-40"
              />
            </label>

            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Strategy
              </span>
              <select
                value={strategyId}
                disabled={busy}
                aria-label="Strategy"
                onChange={(event) => setStrategyId(event.target.value)}
                className="mt-1 h-8 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-2 font-medium text-zinc-100 outline-none focus:border-primary-500/50 disabled:opacity-40"
              >
                <option value="">None</option>
                {strategies.map((strategy) => (
                  <option key={strategy.id} value={strategy.id}>
                    {strategy.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              Session name
            </span>
            <input
              type="text"
              value={name}
              disabled={busy}
              aria-label="Session name"
              placeholder={
                dataset ? `${dataset.symbol} ${startDate || 'YYYY-MM-DD'}` : 'Session name'
              }
              onChange={(event) => setName(event.target.value)}
              className="mt-1 h-8 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-2 font-medium text-zinc-100 outline-none focus:border-primary-500/50 disabled:opacity-40"
            />
          </label>

          {imports.length === 0 && (
            <p className="text-[11px] leading-relaxed text-amber-400/90">
              No imported datasets yet — import a CSV from the Datasets tab first.
            </p>
          )}
          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="inline-flex h-8 items-center rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !dataset}
            onClick={submit}
            className="inline-flex h-8 items-center rounded-xl border border-primary-500/40 bg-primary-500/15 px-3 text-xs font-medium text-primary-300 hover:border-primary-400/70 hover:bg-primary-500/25 hover:text-primary-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Preparing…' : 'Start session'}
          </button>
        </div>
      </div>
    </div>
  )
}
