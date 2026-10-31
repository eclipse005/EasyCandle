import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Candle } from '@shared/candleUtils'
import { IMPORT_SOURCE_TIMEFRAME, MIN_IMPORT_DAYS } from '@shared/importConstants'
import {
  CSV_DATA_TIMEZONE_OPTIONS,
  formatCsvWallClock,
  formatRemappedUtc,
  isCsvDataTimezone
} from '@shared/csvDataTimezone'
import {
  contractSizeInfoForSymbol,
  formatContractSize,
  normalizeSymbolKey
} from '@shared/pricePrecision'
import { useSymbolParamsStore } from '@/store/symbolParamsStore'
import ImportProgressBar, { type ImportProgress } from '@/components/ImportProgressBar'

export type ImportConfirmDetails = {
  fileName: string
  symbol: string | null
  symbolFromFilename: boolean
  candles: Candle[]
  /** Survives parseToken stripping when `candles` is empty. */
  firstCandle?: Candle
  candleCount: number
  firstTime: number
  lastTime: number
  parseToken?: string
  warnings: string[]
  /** When set, confirm will update or replace this existing import. */
  replaceId?: string
  existingSymbol?: string
  /** True when the incoming file has no newer candles than the stored series. */
  noNewer?: boolean
}

type ImportConfirmModalProps = {
  details: ImportConfirmDetails | null
  busy?: boolean
  progress?: ImportProgress | null
  serverError?: string | null
  onConfirm: (values: { symbol: string; contractSize?: number; dataTimezone: string }) => void
  onCancel: () => void
}

function normalizeSymbol(value: string): string {
  return normalizeSymbolKey(value)
}

export default function ImportConfirmModal({
  details,
  busy = false,
  progress = null,
  serverError = null,
  onConfirm,
  onCancel
}: ImportConfirmModalProps) {
  const [symbol, setSymbol] = useState('')
  const [contractSizeText, setContractSizeText] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [dataTimezone, setDataTimezone] = useState('')

  useEffect(() => {
    if (!details) return
    setSymbol(details.symbol ?? '')
    setContractSizeText('')
    setFormError(null)
    setDataTimezone('')
  }, [details])

  useEffect(() => {
    if (!details) return undefined

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !busy) onCancel()
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [details, busy, onCancel])

  if (!details) return null

  const firstTime = details.firstTime || details.candles[0]?.time
  const lastTime = details.lastTime || details.candles[details.candles.length - 1]?.time
  const candleCount = details.candleCount || details.candles.length
  const previewCandle = details.firstCandle ?? details.candles[0]
  const needSymbol = !details.symbolFromFilename
  const spanDays = firstTime && lastTime ? ((lastTime - firstTime) / 86400).toFixed(1) : '—'
  const isReplace = Boolean(details.replaceId && details.noNewer)
  const isUpdate = Boolean(details.replaceId) && !isReplace
  const resolvedSymbol = normalizeSymbol(needSymbol ? symbol : (details.symbol ?? ''))
  const contractInfo = resolvedSymbol ? contractSizeInfoForSymbol(resolvedSymbol) : null
  // A previously saved user parameter wins over the name-derived default.
  const savedContractSize = resolvedSymbol
    ? useSymbolParamsStore.getState().paramsFor(resolvedSymbol).contractSize
    : undefined
  const defaultContractSize = savedContractSize ?? contractInfo?.contractSize

  function submit(): void {
    const nextSymbol = normalizeSymbol(symbol)

    if (!nextSymbol) {
      setFormError('Symbol is required.')
      return
    }
    if (!isCsvDataTimezone(dataTimezone)) {
      setFormError('Choose the CSV data timezone before saving. We never guess it.')
      return
    }
    if (nextSymbol.length < 3) {
      setFormError('Enter a valid symbol (e.g. XAUUSD).')
      return
    }

    // Empty text keeps the symbol-name default; a positive number overrides it.
    const text = contractSizeText.trim()
    let contractSize: number | undefined
    if (text !== '') {
      contractSize = Number(text)
      if (!Number.isFinite(contractSize) || contractSize <= 0) {
        setFormError('Contract size must be a positive number.')
        return
      }
    }

    setFormError(null)
    onConfirm({ symbol: nextSymbol, contractSize, dataTimezone })
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-confirm-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 id="import-confirm-title" className="text-sm font-semibold text-zinc-100">
              {isReplace ? 'Replace import' : isUpdate ? 'Update import' : 'Confirm import'}
            </h2>
            <p className="mt-0.5 truncate text-[11px] text-zinc-500" title={details.fileName}>
              {details.fileName}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cancel import"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Symbol{needSymbol ? ' *' : ''}
              </span>
              {needSymbol ? (
                <input
                  type="text"
                  value={symbol}
                  disabled={busy}
                  autoFocus
                  placeholder="e.g. XAUUSD"
                  aria-label="Symbol"
                  onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                  className="mt-1 h-8 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-2 font-medium text-zinc-100 outline-none focus:border-primary-500/50 disabled:opacity-40"
                />
              ) : (
                <span className="mt-1 block font-medium text-zinc-100">{details.symbol}</span>
              )}
            </label>

            <div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Source TF
              </span>
              <span className="mt-1 block font-medium text-zinc-100">
                {IMPORT_SOURCE_TIMEFRAME}
              </span>
            </div>

            <div className="col-span-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Contract size
              </span>
              {contractInfo ? (
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={contractSizeText}
                    disabled={busy}
                    placeholder={defaultContractSize != null ? String(defaultContractSize) : ''}
                    aria-label="Contract size"
                    onChange={(event) => setContractSizeText(event.target.value)}
                    className="h-8 w-28 rounded-xl border border-zinc-800 bg-zinc-900 px-2 font-medium tabular-nums text-zinc-100 outline-none focus:border-primary-500/50 disabled:opacity-40"
                  />
                  <span className="text-[11px] text-zinc-500">
                    units per lot · default{' '}
                    {defaultContractSize != null ? formatContractSize(defaultContractSize) : '—'} (
                    {contractInfo?.label ?? 'unknown'})
                  </span>
                </div>
              ) : (
                <p className="mt-0.5 text-zinc-500">—</p>
              )}
            </div>

            <div className="col-span-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Built timeframes
              </span>
              <p className="mt-0.5 text-zinc-200">5m · 15m · 1h · 4h · 1d</p>
            </div>

            <div className="col-span-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                CSV data timezone <span className="text-amber-400/90">required</span>
              </span>
              <select
                value={dataTimezone}
                disabled={busy}
                aria-label="CSV data timezone"
                aria-required="true"
                onChange={(event) => {
                  setDataTimezone(event.target.value)
                  setFormError(null)
                }}
                className="mt-1 h-8 w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 px-2 text-[12px] font-medium text-zinc-100 outline-none focus:border-primary-500/50 disabled:opacity-40"
              >
                <option value="">Select timezone of timestamps in this CSV…</option>
                {CSV_DATA_TIMEZONE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
                We never guess broker/server time — pick the zone that matches the file.
              </p>
            </div>
            <div className="col-span-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Start (CSV wall)
              </span>
              <p className="mt-0.5 tabular-nums text-zinc-200">
                {formatCsvWallClock(firstTime)}
              </p>
              {dataTimezone ? (
                <p className="mt-0.5 text-[10px] tabular-nums text-zinc-500">
                  → {formatRemappedUtc(firstTime, dataTimezone)}
                </p>
              ) : null}
            </div>
            <div className="col-span-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                End (CSV wall)
              </span>
              <p className="mt-0.5 tabular-nums text-zinc-200">
                {formatCsvWallClock(lastTime)}
              </p>
              {dataTimezone ? (
                <p className="mt-0.5 text-[10px] tabular-nums text-zinc-500">
                  → {formatRemappedUtc(lastTime, dataTimezone)}
                </p>
              ) : null}
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                1m candles
              </span>
              <p className="mt-0.5 tabular-nums text-zinc-200">{candleCount.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Span (≥{MIN_IMPORT_DAYS}d)
              </span>
              <p className="mt-0.5 tabular-nums text-zinc-200">{spanDays} days</p>
            </div>

            {previewCandle ? (
              <div className="col-span-2">
                <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  First bar preview
                </span>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-zinc-300">
                  {formatCsvWallClock(previewCandle.time)} · O {previewCandle.open} H{' '}
                  {previewCandle.high} L {previewCandle.low} C {previewCandle.close}
                </p>
              </div>
            ) : null}
          </div>

          {needSymbol && resolvedSymbol.length > 0 && resolvedSymbol.length < 6 ? (
            <p className="text-[11px] leading-relaxed text-amber-400/90">
              Symbol looks short — FX pairs are usually 6 letters (e.g. EURUSD). Confirm before
              loading if this is intentional.
            </p>
          ) : null}

          {isUpdate && (
            <p className="text-[11px] leading-relaxed text-sky-300/90">
              Updating existing import
              {details.existingSymbol ? ` for ${details.existingSymbol}` : ''}. New candles will
              replace the stored series.
            </p>
          )}

          {isReplace && (
            <p className="text-[11px] leading-relaxed text-amber-400/90">
              {details.existingSymbol ? `${details.existingSymbol} is` : 'This symbol is'} already
              imported through the same or a later time. Replacing will overwrite the stored series
              with this file.
            </p>
          )}

          {details.warnings.length > 0 && (
            <p className="text-[11px] leading-relaxed text-amber-400/90">
              {details.warnings.join(' ')}
            </p>
          )}
          {(formError || serverError) && (
            <p className="text-[11px] leading-relaxed text-red-400">{formError || serverError}</p>
          )}
          {busy && progress && <ImportProgressBar progress={progress} />}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex h-8 items-center rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !isCsvDataTimezone(dataTimezone)}
            onClick={submit}
            className="inline-flex h-8 items-center rounded-xl border border-primary-500/40 bg-primary-500/15 px-3 text-xs font-medium text-primary-300 hover:border-primary-400/70 hover:bg-primary-500/25 hover:text-primary-200 disabled:opacity-40"
          >
            {busy
              ? 'Saving…'
              : isReplace
                ? 'Replace & load'
                : isUpdate
                  ? 'Update & load'
                  : 'Confirm & load'}
          </button>
        </div>
      </div>
    </div>
  )
}
