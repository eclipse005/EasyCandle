import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { IMPORT_STORED_TIMEFRAMES } from '@shared/candleAggregate'
import {
  earliestCoverageDay,
  groupImportsBySymbol,
  isDayCovered
} from '@shared/dateCoverage'
import { normalizeSymbolKey } from '@shared/pricePrecision'
import SoftButton from '@/components/ui/SoftButton'
import SoftDialog from '@/components/ui/SoftDialog'
import { SoftInput, SoftSelect } from '@/components/ui/SoftInput'
import SoftLabel from '@/components/ui/SoftLabel'
import DateCoveragePopover from '@/components/dashboard/DateCoveragePopover'
import { DEFAULT_CHART_TIMEZONE, parseSessionParts, toSessionParts } from '@/lib/chartTimezone'
import { useReplayStore } from '@/store/replayStore'
import { useSessionStore } from '@/store/sessionStore'
import { useStrategiesStore } from '@/store/strategiesStore'

export type CreateSessionDialogProps = {
  open: boolean
  /** Optional symbol prefill (normalized id). */
  presetSymbol?: string | null
  onClose: () => void
}

function dateInputFor(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return ''
  return toSessionParts(unixSeconds, DEFAULT_CHART_TIMEZONE).date
}

/**
 * New-backtesting-session wizard: pick a **symbol** (not a single CSV),
 * timeframe, start date within coverage, balance, optional strategy.
 */
export default function CreateSessionDialog({
  open,
  presetSymbol = null,
  onClose
}: CreateSessionDialogProps): ReactNode {
  const imports = useReplayStore((s) => s.importedList)
  const openSession = useSessionStore((s) => s.openSession)
  const strategies = useStrategiesStore((s) => s.strategies)

  const symbolGroups = useMemo(() => groupImportsBySymbol(imports), [imports])

  const [symbolKey, setSymbolKey] = useState('')
  const [timeframe, setTimeframe] = useState('1m')
  const [startDate, setStartDate] = useState('')
  const [balance, setBalance] = useState('100000')
  const [strategyId, setStrategyId] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const group = useMemo(
    () => symbolGroups.find((g) => g.key === symbolKey) ?? null,
    [symbolGroups, symbolKey]
  )

  const timeframes = useMemo(() => {
    if (!group) return []
    const available = new Set<string>()
    for (const meta of group.files) {
      for (const tf of IMPORT_STORED_TIMEFRAMES) {
        if (meta.timeframes[tf] != null) available.add(tf)
      }
    }
    return IMPORT_STORED_TIMEFRAMES.filter((tf) => available.has(tf))
  }, [group])

  useEffect(() => {
    if (!open) return
    setError(null)
    setBusy(false)
    const pref = presetSymbol ? normalizeSymbolKey(presetSymbol) : ''
    const initial =
      (pref && symbolGroups.find((g) => g.key === pref)) || symbolGroups[0] || null
    if (initial) {
      setSymbolKey(initial.key)
      const preferred =
        initial.files.find((f) => f.timeframes[f.timeframe] != null)?.timeframe
      const tf =
        preferred ??
        (initial.files[0]?.timeframes['1m'] != null ? '1m' : '1m')
      setTimeframe(tf)
      const day =
        earliestCoverageDay(initial.coverageDays) ||
        dateInputFor(initial.firstTime)
      setStartDate(day)
    } else {
      setSymbolKey('')
      setTimeframe('1m')
      setStartDate('')
    }
    setBalance('100000')
    setStrategyId('')
    setName('')
  }, [open, presetSymbol, symbolGroups])

  useEffect(() => {
    if (!open || !group) return
    const day =
      (startDate && isDayCovered(group.coverageDays, startDate) && startDate) ||
      earliestCoverageDay(group.coverageDays) ||
      dateInputFor(group.firstTime)
    setStartDate(day)
    if (timeframes.length && !timeframes.includes(timeframe as (typeof timeframes)[number])) {
      setTimeframe(timeframes[0] as string)
    }
    // Only reclamp when symbol changes — not on every startDate edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group?.key])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  function submit(): void {
    if (!group) {
      setError('Select a symbol with imported data.')
      return
    }
    if (!startDate) {
      setError('Start date is required.')
      return
    }
    if (!isDayCovered(group.coverageDays, startDate)) {
      setError('Start date has no data for this symbol.')
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
      symbol: group.symbol,
      timeframe,
      startDate: seconds,
      balance: balanceNumber,
      strategyId: strategyId || undefined
    }).then((id) => {
      setBusy(false)
      if (id) onClose()
      else setError('Could not start the session — check that the symbol still has data.')
    })
  }

  const displaySymbol = group?.symbol ?? ''

  return (
    <SoftDialog
      open={open}
      onClose={onClose}
      closeDisabled={busy}
      labelledBy="create-session-title"
      title="New backtesting session"
      description="Pick a symbol — the engine merges all of its imported CSV files."
      className="max-w-lg"
      footer={
        <>
          <SoftButton variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </SoftButton>
          <SoftButton variant="primary" disabled={busy || !group} onClick={submit}>
            {busy ? 'Preparing…' : 'Start session'}
          </SoftButton>
        </>
      }
    >
      <div className="space-y-3.5 text-[12px]">
        <SoftLabel caption={`Symbol${symbolGroups.length === 0 ? ' — import a CSV first' : ' *'}`}>
          <SoftSelect
            value={symbolKey}
            disabled={busy || symbolGroups.length === 0}
            aria-label="Symbol"
            onChange={(event) => setSymbolKey(event.target.value)}
          >
            {symbolGroups.length === 0 ? <option value="">No symbols with data</option> : null}
            {symbolGroups.map((g) => (
              <option key={g.key} value={g.key}>
                {g.symbol} · {g.fileCount} file{g.fileCount === 1 ? '' : 's'} ·{' '}
                {g.candleCount.toLocaleString()} candles
              </option>
            ))}
          </SoftSelect>
        </SoftLabel>

        <div className="grid grid-cols-2 gap-3">
          <SoftLabel caption="Timeframe">
            <SoftSelect
              value={timeframe}
              disabled={busy || timeframes.length === 0}
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
            {group ? (
              <DateCoveragePopover
                mode="pick"
                coverageDays={group.coverageDays}
                selectedDay={startDate}
                disabled={busy}
                placeholder="Pick a day with data"
                initialMonth={startDate ? startDate.slice(0, 7) : undefined}
                onSelectDay={(day) => {
                  setError(null)
                  setStartDate(day)
                }}
              />
            ) : (
              <SoftInput
                type="text"
                value=""
                disabled
                aria-label="Start date"
                placeholder="Pick a day with data"
              />
            )}
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
              displaySymbol
                ? `${displaySymbol} ${startDate || 'YYYY-MM-DD'}`
                : 'Session name'
            }
            onChange={(event) => setName(event.target.value)}
          />
        </SoftLabel>

        {symbolGroups.length === 0 && (
          <p className="text-[12px] leading-relaxed text-zinc-400">
            No imported datasets yet — import a CSV from the Datasets tab first.
          </p>
        )}
        {error && <p className="text-[12px] text-red-400">{error}</p>}
      </div>
    </SoftDialog>
  )
}
