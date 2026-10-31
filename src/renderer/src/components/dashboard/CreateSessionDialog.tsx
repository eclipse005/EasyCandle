import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { IMPORT_STORED_TIMEFRAMES } from '@shared/candleAggregate'
import type { ImportedDatasetMeta } from '@shared/importTypes'
import SoftButton from '@/components/ui/SoftButton'
import SoftDialog from '@/components/ui/SoftDialog'
import { SoftInput, SoftSelect } from '@/components/ui/SoftInput'
import SoftLabel from '@/components/ui/SoftLabel'
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
    <SoftDialog
      open={open}
      onClose={onClose}
      closeDisabled={busy}
      labelledBy="create-session-title"
      title="New backtesting session"
      description="The chart opens at your start date, revealing candles as you step forward."
      footer={
        <>
          <SoftButton variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </SoftButton>
          <SoftButton variant="primary" disabled={busy || !dataset} onClick={submit}>
            {busy ? 'Preparing…' : 'Start session'}
          </SoftButton>
        </>
      }
    >
      <div className="space-y-3.5 text-[12px]">
        <SoftLabel caption={`Dataset${imports.length === 0 ? ' — import a CSV first' : ' *'}`}>
          <SoftSelect
            value={datasetId}
            disabled={busy || imports.length === 0}
            aria-label="Dataset"
            onChange={(event) => setDatasetId(event.target.value)}
          >
            {imports.length === 0 ? <option value="">No datasets</option> : null}
            {imports.map((meta) => (
              <option key={meta.id} value={meta.id}>
                {meta.symbol} · {meta.candleCount.toLocaleString()} × 1m
              </option>
            ))}
          </SoftSelect>
        </SoftLabel>

        <div className="grid grid-cols-2 gap-3">
          <SoftLabel caption="Timeframe">
            <SoftSelect
              value={timeframe}
              disabled={busy}
              aria-label="Timeframe"
              onChange={(event) => setTimeframe(event.target.value)}
            >
              {timeframes.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </SoftSelect>
          </SoftLabel>

          <SoftLabel caption="Start date">
            <SoftInput
              type="date"
              value={startDate}
              disabled={busy}
              aria-label="Start date"
              onChange={(event) => setStartDate(event.target.value)}
            />
          </SoftLabel>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <SoftLabel caption="Initial balance">
            <SoftInput
              type="number"
              min="0"
              value={balance}
              disabled={busy}
              aria-label="Initial balance"
              className="tabular-nums"
              onChange={(event) => setBalance(event.target.value)}
            />
          </SoftLabel>

          <SoftLabel caption="Strategy">
            <SoftSelect
              value={strategyId}
              disabled={busy}
              aria-label="Strategy"
              onChange={(event) => setStrategyId(event.target.value)}
            >
              <option value="">None</option>
              {strategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.name}
                </option>
              ))}
            </SoftSelect>
          </SoftLabel>
        </div>

        <SoftLabel caption="Session name">
          <SoftInput
            type="text"
            value={name}
            disabled={busy}
            aria-label="Session name"
            placeholder={
              dataset ? `${dataset.symbol} ${startDate || 'YYYY-MM-DD'}` : 'Session name'
            }
            onChange={(event) => setName(event.target.value)}
          />
        </SoftLabel>

        {imports.length === 0 && (
          <p className="text-[12px] leading-relaxed text-zinc-400">
            No imported datasets yet — import a CSV from the Datasets tab first.
          </p>
        )}
        {error && <p className="text-[12px] text-red-400">{error}</p>}
      </div>
    </SoftDialog>
  )
}
