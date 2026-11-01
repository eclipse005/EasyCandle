import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { useT } from '@/i18n/useT'
import { TIMEFRAME_IDS, TIMEFRAMES } from '@shared/timeframes'

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
 * start date within coverage, balance, optional strategy.
 * Chart timeframe defaults to 1m (switchable on the chart, like FX Replay).
 */
export default function CreateSessionDialog({
  open,
  presetSymbol = null,
  onClose
}: CreateSessionDialogProps): ReactNode {
  const { t } = useT()
  const imports = useReplayStore((s) => s.importedList)
  const openSession = useSessionStore((s) => s.openSession)
  const strategies = useStrategiesStore((s) => s.strategies)

  const symbolGroups = useMemo(() => groupImportsBySymbol(imports), [imports])

  const [symbolKey, setSymbolKey] = useState('')
  const [startDate, setStartDate] = useState('')
  const [balance, setBalance] = useState('100000')
  const [timeframe, setTimeframe] = useState('1m')
  const [strategyId, setStrategyId] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const group = useMemo(
    () => symbolGroups.find((g) => g.key === symbolKey) ?? null,
    [symbolGroups, symbolKey]
  )

  useEffect(() => {
    if (!open) return
    setError(null)
    setBusy(false)
    const pref = presetSymbol ? normalizeSymbolKey(presetSymbol) : ''
    const initial =
      (pref && symbolGroups.find((g) => g.key === pref)) || symbolGroups[0] || null
    if (initial) {
      setSymbolKey(initial.key)
      const day =
        earliestCoverageDay(initial.coverageDays) ||
        dateInputFor(initial.firstTime)
      setStartDate(day)
    } else {
      setSymbolKey('')
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
      setError(t('session.errorSymbol'))
      return
    }
    if (!startDate) {
      setError(t('session.errorStartRequired'))
      return
    }
    if (!isDayCovered(group.coverageDays, startDate)) {
      setError(t('session.errorStartNoData'))
      return
    }
    const seconds = parseSessionParts(startDate, '00:00', DEFAULT_CHART_TIMEZONE)
    if (seconds == null) {
      setError(t('session.errorStartInvalid'))
      return
    }
    const balanceNumber = Number(balance)
    if (!Number.isFinite(balanceNumber) || balanceNumber <= 0) {
      setError(t('session.errorBalance'))
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
      else setError(t('session.errorCreate'))
    })
  }

  const displaySymbol = group?.symbol ?? ''

  return (
    <SoftDialog
      open={open}
      onClose={onClose}
      closeDisabled={busy}
      labelledBy="create-session-title"
      title={t('session.newTitle')}
      description={t('session.newHint')}
      className="max-w-lg"
      footer={
        <>
          <SoftButton variant="secondary" disabled={busy} onClick={onClose}>
            {t('session.cancel')}
          </SoftButton>
          <SoftButton variant="primary" disabled={busy || !group} onClick={submit}>
            {busy ? t('session.preparing') : t('session.start')}
          </SoftButton>
        </>
      }
    >
      <div className="space-y-3.5 text-[12px]">
        <SoftLabel caption={symbolGroups.length === 0 ? t('session.importFirst') : t('session.symbolRequired')}>
          <SoftSelect
            value={symbolKey}
            disabled={busy || symbolGroups.length === 0}
            aria-label={t('session.symbol')}
            onChange={(event) => setSymbolKey(event.target.value)}
          >
            {symbolGroups.length === 0 ? <option value="">{t('session.noSymbols')}</option> : null}
            {symbolGroups.map((g) => (
              <option key={g.key} value={g.key}>
                {g.symbol} · {t('symbols.days', { count: g.coverageDays.size.toLocaleString() })}
              </option>
            ))}
          </SoftSelect>
        </SoftLabel>

        <div className="grid grid-cols-2 gap-3">
          <SoftLabel caption={t('session.startDate')}>
            {group ? (
              <DateCoveragePopover
                mode="pick"
                coverageDays={group.coverageDays}
                selectedDay={startDate}
                disabled={busy}
                placeholder={t('session.pickDay')}
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
                aria-label={t('session.startDate')}
                placeholder={t('session.pickDay')}
              />
            )}
          </SoftLabel>
          <SoftLabel caption={t('session.timeframe')}>
            <SoftSelect
              value={timeframe}
              disabled={busy}
              aria-label={t('session.timeframe')}
              onChange={(event) => setTimeframe(event.target.value)}
            >
              {TIMEFRAME_IDS.map((id) => (
                <option key={id} value={id}>
                  {TIMEFRAMES[id].label}
                </option>
              ))}
            </SoftSelect>
          </SoftLabel>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <SoftLabel caption={t('session.balance')}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                $
              </span>
              <SoftInput
                type="number"
                min="0"
                value={balance}
                disabled={busy}
                aria-label={t('session.balance')}
                className="pl-7 tabular-nums"
                onChange={(event) => setBalance(event.target.value)}
              />
            </div>
          </SoftLabel>

          <SoftLabel caption={t('session.strategy')}>
            <SoftSelect
              value={strategyId}
              disabled={busy}
              aria-label={t('session.strategy')}
              onChange={(event) => setStrategyId(event.target.value)}
            >
              <option value="">{t('session.noStrategy')}</option>
              {strategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.name}
                </option>
              ))}
            </SoftSelect>
          </SoftLabel>
        </div>

        <SoftLabel caption={t('session.name')}>
          <SoftInput
            type="text"
            value={name}
            disabled={busy}
            aria-label={t('session.name')}
            placeholder={
              displaySymbol
                ? `${displaySymbol} ${startDate || 'YYYY-MM-DD'}`
                : t('session.namePlaceholder')
            }
            onChange={(event) => setName(event.target.value)}
          />
        </SoftLabel>

        {symbolGroups.length === 0 && (
          <p className="text-[12px] leading-relaxed text-zinc-400">
            {t('session.importHint')}
          </p>
        )}
        {error && <p className="text-[12px] text-red-400">{error}</p>}
      </div>
    </SoftDialog>
  )
}
