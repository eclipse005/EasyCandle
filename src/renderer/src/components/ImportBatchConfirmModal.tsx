import { useT } from '@/i18n/useT'
import { translateImportWarnings } from '@/i18n/importWarnings'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Trash2, X } from 'lucide-react'
import type { Candle } from '@shared/candleUtils'
import { IMPORT_SOURCE_TIMEFRAME } from '@shared/importConstants'
import type { ImportOrigin } from '@shared/importTypes'
import { toUtcParts } from '@/lib/utcDateTime'
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
import SoftButton from '@/components/ui/SoftButton'
import { cn } from '@/components/ui/cn'

export type ImportBatchItem = {
  id: string
  path: string
  fileName: string
  status: 'ok' | 'error'
  error?: string
  symbol: string | null
  symbolFromFilename: boolean
  candles: Candle[]
  firstCandle?: Candle
  candleCount: number
  firstTime: number
  lastTime: number
  parseToken?: string
  warnings: string[]
  content: string
  origin: ImportOrigin
  /** Absolute ISO (Z/offset) — save with UTC, no wall-clock remap. */
  timestampsAbsolute?: boolean
}

export type ImportBatchSaveRequest = {
  id: string
  symbol: string
  contractSize?: number
  /** Explicit CSV data timezone chosen on confirm (required). */
  dataTimezone: string
  item: ImportBatchItem
}

type ImportBatchConfirmModalProps = {
  items: ImportBatchItem[] | null
  /** When set (symbol panel), lock every row to this symbol. */
  lockedSymbol?: string
  busy?: boolean
  progress?: ImportProgress | null
  serverError?: string | null
  onConfirm: (saves: ImportBatchSaveRequest[]) => void
  onCancel: () => void
  /** Called when the user removes a row so the caller can discard parse tokens. */
  onItemsChange?: (next: ImportBatchItem[]) => void
}

function normalizeSymbol(value: string): string {
  return normalizeSymbolKey(value)
}

function spanDays(firstTime: number, lastTime: number): number {
  if (!firstTime || !lastTime || lastTime < firstTime) return 0
  return (lastTime - firstTime) / 86400
}

function coverageDayKeys(firstTime: number, lastTime: number): string[] {
  if (!firstTime || !lastTime || lastTime < firstTime) return []
  const start = toUtcParts(firstTime).date
  const end = toUtcParts(lastTime).date
  if (!start || !end) return []
  const out: string[] = []
  const cur = new Date(`${start}T00:00:00.000Z`)
  const last = new Date(`${end}T00:00:00.000Z`)
  while (cur.getTime() <= last.getTime()) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

type SymbolDraft = {
  /** Editable when filename lacked a symbol and no lock. */
  symbolText: string
  contractSizeText: string
}

export default function ImportBatchConfirmModal({
  items,
  lockedSymbol,
  busy = false,
  progress = null,
  serverError = null,
  onConfirm,
  onCancel,
  onItemsChange
}: ImportBatchConfirmModalProps): ReactNode {
  const { t } = useT()
  const [rows, setRows] = useState<ImportBatchItem[]>([])
  const [drafts, setDrafts] = useState<Record<string, SymbolDraft>>({})
  const [formError, setFormError] = useState<string | null>(null)
  /** Empty until the user explicitly chooses — never guess UTC. */
  const [dataTimezone, setDataTimezone] = useState('')

  useEffect(() => {
    if (!items) {
      setRows([])
      setDrafts({})
      setFormError(null)
      setDataTimezone('')
      return
    }
    setRows(items)
    const next: Record<string, SymbolDraft> = {}
    for (const item of items) {
      const locked = lockedSymbol ? normalizeSymbol(lockedSymbol) : ''
      const initial = locked || (item.symbol ? normalizeSymbol(item.symbol) : '')
      next[item.id] = { symbolText: initial, contractSizeText: '' }
    }
    setDrafts(next)
    setFormError(null)
    const ok = items.filter((item) => item.status === 'ok')
    const allAbs = ok.length > 0 && ok.every((item) => Boolean(item.timestampsAbsolute))
    setDataTimezone(allAbs ? 'UTC' : '')
  }, [items, lockedSymbol])

  useEffect(() => {
    if (!items) return undefined

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !busy) onCancel()
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [items, busy, onCancel])

  const okRows = useMemo(() => rows.filter((r) => r.status === 'ok'), [rows])
  const allTimestampsAbsolute = useMemo(
    () => okRows.length > 0 && okRows.every((r) => Boolean(r.timestampsAbsolute)),
    [okRows]
  )
  const isSingle = okRows.length === 1 && rows.length === 1

  const resolvedById = useMemo(() => {
    const map = new Map<string, string>()
    const lock = lockedSymbol ? normalizeSymbol(lockedSymbol) : ''
    for (const row of rows) {
      if (row.status !== 'ok') continue
      if (lock) {
        map.set(row.id, lock)
        continue
      }
      if (row.symbolFromFilename && row.symbol) {
        map.set(row.id, normalizeSymbol(row.symbol))
      } else {
        map.set(row.id, normalizeSymbol(drafts[row.id]?.symbolText ?? ''))
      }
    }
    return map
  }, [rows, drafts, lockedSymbol])

  const symbolGroups = useMemo(() => {
    const groups = new Map<string, ImportBatchItem[]>()
    for (const row of okRows) {
      const sym = resolvedById.get(row.id) || ''
      const key = sym || `__pending__${row.id}`
      const list = groups.get(key) ?? []
      list.push(row)
      groups.set(key, list)
    }
    return groups
  }, [okRows, resolvedById])

  const summary = useMemo(() => {
    const symbols = new Set<string>()
    const dayUnion = new Set<string>()
    let minT = 0
    let maxT = 0
    for (const row of okRows) {
      const sym = resolvedById.get(row.id)
      if (sym) symbols.add(sym)
      for (const day of coverageDayKeys(row.firstTime, row.lastTime)) dayUnion.add(day)
      if (!minT || row.firstTime < minT) minT = row.firstTime
      if (!maxT || row.lastTime > maxT) maxT = row.lastTime
    }
    return {
      fileCount: okRows.length,
      symbolCount: symbols.size,
      coverageDays: dayUnion.size,
      datasetCount: okRows.length,
      minT,
      maxT
    }
  }, [okRows, resolvedById])

  function updateRows(next: ImportBatchItem[]): void {
    setRows(next)
    onItemsChange?.(next)
  }

  function removeRow(id: string): void {
    if (busy) return
    const removed = rows.find((r) => r.id === id)
    if (removed?.parseToken) {
      void window.api.discardImportParse(removed.parseToken)
    }
    updateRows(rows.filter((r) => r.id !== id))
  }

  function setDraft(id: string, patch: Partial<SymbolDraft>): void {
    setDrafts((prev) => {
      const cur = prev[id]
      return {
        ...prev,
        [id]: {
          symbolText: cur?.symbolText ?? '',
          contractSizeText: cur?.contractSizeText ?? '',
          ...patch
        }
      }
    })
  }

  /** Contract-size draft is stored on the first row id of each symbol group. */
  function contractDraftKeyForSymbol(symbol: string): string {
    for (const [id, sym] of resolvedById) {
      if (sym === symbol) return id
    }
    return ''
  }

  function submit(): void {
    if (!okRows.length) {
      setFormError(t('importConfirm.noValid'))
      return
    }
    const batchNeedsTz = okRows.some((row) => !row.timestampsAbsolute)
    if (batchNeedsTz && !isCsvDataTimezone(dataTimezone)) {
      setFormError(t('importConfirm.needTz'))
      return
    }

    const saves: ImportBatchSaveRequest[] = []
    const contractBySymbol = new Map<string, number | undefined>()

    for (const row of okRows) {
      const symbol = resolvedById.get(row.id) ?? ''
      if (!symbol) {
        setFormError(t('importConfirm.symbolRequiredErr', { name: row.fileName }))
        return
      }
      if (symbol.length < 3) {
        setFormError(t('importConfirm.symbolInvalid', { name: row.fileName }))
        return
      }

      if (!contractBySymbol.has(symbol)) {
        const key = contractDraftKeyForSymbol(symbol)
        const text = (drafts[key]?.contractSizeText ?? '').trim()
        let contractSize: number | undefined
        if (text !== '') {
          contractSize = Number(text)
          if (!Number.isFinite(contractSize) || contractSize <= 0) {
            setFormError(t('importConfirm.contractPositive', { symbol }))
            return
          }
        }
        contractBySymbol.set(symbol, contractSize)
      }

      saves.push({
        id: row.id,
        symbol,
        contractSize: contractBySymbol.get(symbol),
        // Absolute ISO must stay UTC — never remap/double-shift.
        dataTimezone: row.timestampsAbsolute ? 'UTC' : dataTimezone,
        item: row
      })
    }

    setFormError(null)
    onConfirm(saves)
  }

  if (!items || rows.length === 0) return null

  // ——— Single-file layout (preserve excellent detail) ———
  if (isSingle) {
    const details = okRows[0]
    const needSymbol =
      !lockedSymbol && !details.symbolFromFilename
    const draft = drafts[details.id] ?? { symbolText: '', contractSizeText: '' }
    const resolvedSymbol = lockedSymbol
      ? normalizeSymbol(lockedSymbol)
      : normalizeSymbol(needSymbol ? draft.symbolText : (details.symbol ?? ''))
    const firstTime = details.firstTime
    const lastTime = details.lastTime
    const candleCount = details.candleCount
    const previewCandle = details.firstCandle ?? details.candles[0]
    const span = spanDays(firstTime, lastTime)
    const contractInfo = resolvedSymbol ? contractSizeInfoForSymbol(resolvedSymbol) : null
    const savedContractSize = resolvedSymbol
      ? useSymbolParamsStore.getState().paramsFor(resolvedSymbol).contractSize
      : undefined
    const defaultContractSize = savedContractSize ?? contractInfo?.contractSize
    const uiWarnings = translateImportWarnings(details.warnings, t)

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
                {t('importConfirm.title')}
              </h2>
              <p className="mt-0.5 truncate text-[11px] text-zinc-500" title={details.fileName}>
                {details.fileName}
              </p>
            </div>
            <button
              type="button"
              aria-label={t('importConfirm.cancelAria')}
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
                  {needSymbol ? t('importConfirm.symbolRequired') : t('importConfirm.symbol')}
                </span>
                {needSymbol ? (
                  <input
                    type="text"
                    value={draft.symbolText}
                    disabled={busy}
                    autoFocus
                    placeholder={t('importConfirm.symbolPlaceholder')}
                    aria-label={t('importConfirm.symbol')}
                    onChange={(event) =>
                      setDraft(details.id, { symbolText: event.target.value.toUpperCase() })
                    }
                    className="mt-1 h-8 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-2 font-medium text-zinc-100 outline-none focus:border-primary-500/50 disabled:opacity-40"
                  />
                ) : (
                  <span className="mt-1 block font-medium text-zinc-100">{resolvedSymbol}</span>
                )}
                <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500">
                  {t('importConfirm.symbolSourceHint')}
                </p>
              </label>

              <div>
                <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  {t('importConfirm.sourceTf')}
                </span>
                <span className="mt-1 block font-medium text-zinc-100">
                  {IMPORT_SOURCE_TIMEFRAME}
                </span>
              </div>

              <div className="col-span-2">
                <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  {t('importConfirm.csvTz')}{' '}
                  {allTimestampsAbsolute ? (
                    <span className="text-emerald-400/90" title={t('importConfirm.tzLockedHint')}>
                      {t('importConfirm.tzLocked')}
                    </span>
                  ) : (
                    <span className="text-amber-400/90">{t('importConfirm.required')}</span>
                  )}
                </span>
                {allTimestampsAbsolute ? null : (
                  <>
                    <select
                      value={dataTimezone}
                      disabled={busy}
                      aria-label={t('importConfirm.csvTzAria')}
                      aria-required="true"
                      onChange={(event) => {
                        setDataTimezone(event.target.value)
                        setFormError(null)
                      }}
                      className="mt-1 h-8 w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 px-2 text-[12px] font-medium text-zinc-100 outline-none focus:border-primary-500/50 disabled:opacity-40"
                    >
                      <option value="">{t('importConfirm.selectTz')}</option>
                      {CSV_DATA_TIMEZONE_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
                      {dataTimezone
                        ? CSV_DATA_TIMEZONE_OPTIONS.find((o) => o.id === dataTimezone)?.hint ||
                          t('importConfirm.tzRemapHint')
                        : t('importConfirm.tzRequiredHint')}
                    </p>
                  </>
                )}
              </div>

              <div className="col-span-2">
                <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  {allTimestampsAbsolute
                    ? t('importConfirm.startUtc')
                    : t('importConfirm.startWall')}
                </span>
                <p className="mt-0.5 tabular-nums text-zinc-200">
                  {allTimestampsAbsolute
                    ? formatRemappedUtc(firstTime, 'UTC')
                    : formatCsvWallClock(firstTime)}
                </p>
                {!allTimestampsAbsolute && dataTimezone ? (
                  <p className="mt-0.5 text-[10px] tabular-nums text-zinc-500">
                    → {formatRemappedUtc(firstTime, dataTimezone)}
                  </p>
                ) : null}
              </div>
              <div className="col-span-2">
                <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  {allTimestampsAbsolute
                    ? t('importConfirm.endUtc')
                    : t('importConfirm.endWall')}
                </span>
                <p className="mt-0.5 tabular-nums text-zinc-200">
                  {allTimestampsAbsolute
                    ? formatRemappedUtc(lastTime, 'UTC')
                    : formatCsvWallClock(lastTime)}
                </p>
                {!allTimestampsAbsolute && dataTimezone ? (
                  <p className="mt-0.5 text-[10px] tabular-nums text-zinc-500">
                    → {formatRemappedUtc(lastTime, dataTimezone)}
                  </p>
                ) : null}
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  {t('importConfirm.candles1m')}
                </span>
                <p className="mt-0.5 tabular-nums text-zinc-200">{candleCount.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  {t('importConfirm.span')}
                </span>
                <p className="mt-0.5 tabular-nums text-zinc-200">
                  {t('importConfirm.spanDays', { days: Math.max(1, Math.round(span)) })}
                </p>
              </div>

              <div className="col-span-2">
                <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  {t('importConfirm.contractSize')}
                </span>
                {contractInfo ? (
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={draft.contractSizeText}
                      disabled={busy}
                      placeholder={defaultContractSize != null ? String(defaultContractSize) : ''}
                      aria-label={t('importConfirm.contractSize')}
                      onChange={(event) =>
                        setDraft(details.id, { contractSizeText: event.target.value })
                      }
                      className="h-8 w-[7.5rem] min-w-[7.5rem] rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 font-medium tabular-nums text-zinc-100 outline-none focus:border-primary-500/50 disabled:opacity-40"
                    />
                    <span className="text-[11px] text-zinc-500">
                      {t('importConfirm.unitsPerLot', {
                        size: defaultContractSize != null ? formatContractSize(defaultContractSize) : '—'
                      })}
                    </span>
                  </div>
                ) : (
                  <p className="mt-0.5 text-zinc-500">—</p>
                )}
              </div>

              <div className="col-span-2">
                <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  {t('importConfirm.builtTf')}
                </span>
                <p className="mt-0.5 text-zinc-200">5m · 15m · 1h · 4h · 1d</p>
              </div>

              {previewCandle ? (
                <div className="col-span-2">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                    {t('importConfirm.firstBar')}
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
                {t('importConfirm.symbolShort')}
              </p>
            ) : null}

            {uiWarnings.length > 0 && (
              <p className="text-[11px] leading-relaxed text-amber-400/90">
                {uiWarnings.join(' ')}
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
              {t('importConfirm.cancel')}
            </button>
            <button
              type="button"
              disabled={
                busy || (!allTimestampsAbsolute && !isCsvDataTimezone(dataTimezone))
              }
              onClick={submit}
              className="inline-flex h-8 items-center rounded-xl border border-primary-500/40 bg-primary-500/15 px-3 text-xs font-medium text-primary-300 hover:border-primary-400/70 hover:bg-primary-500/25 hover:text-primary-200 disabled:opacity-40"
            >
              {busy ? t('importConfirm.saving') : t('importConfirm.confirmLoad')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ——— Batch layout (N≥2 or mixed ok/error) ———
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
        aria-labelledby="import-batch-title"
        className="flex max-h-[min(92vh,44rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 id="import-batch-title" className="text-sm font-semibold text-zinc-100">
              {t('importConfirm.title')}
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {t('importConfirm.filesCount', {
                count: rows.length,
                suffix: rows.length === 1 ? '' : 's'
              })}
              {lockedSymbol
                ? t('importConfirm.lockedTo', { symbol: normalizeSymbol(lockedSymbol) })
                : ''}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('importConfirm.cancelAria')}
            disabled={busy}
            onClick={onCancel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-white/[0.06] bg-zinc-900/40 px-3 py-2 text-[11px] text-zinc-400">
            <span>
              {t('importConfirm.summaryFiles', { count: summary.fileCount })}
            </span>
            <span>
              {t('importConfirm.summarySymbols', { count: summary.symbolCount })}
            </span>
            <span>
              {t('importConfirm.summaryCoverage', { count: summary.coverageDays })}
            </span>
            <span>
              {t('importConfirm.summaryDatasets', { count: summary.datasetCount })}
            </span>
          </div>

          <div className="overflow-hidden rounded-xl border border-white/[0.06]">
            <div className="max-h-[min(36vh,18rem)] overflow-y-auto">
              <table className="w-full border-collapse text-left text-[11px]">
                <thead className="sticky top-0 bg-zinc-950/95 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t('importConfirm.colFile')}</th>
                    <th className="px-2 py-2 font-medium">{t('importConfirm.colSymbol')}</th>
                    <th className="px-2 py-2 font-medium">{t('importConfirm.colRange')}</th>
                    <th className="px-2 py-2 font-medium">{t('importConfirm.colDays')}</th>
                    <th className="px-2 py-2 font-medium">{t('importConfirm.colCandles')}</th>
                    <th className="px-2 py-2 font-medium">{t('importConfirm.colStatus')}</th>
                    <th className="px-2 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {rows.map((row) => {
                    const draft = drafts[row.id] ?? { symbolText: '', contractSizeText: '' }
                    const needSymbol =
                      row.status === 'ok' &&
                      !lockedSymbol &&
                      !row.symbolFromFilename
                    const resolved = resolvedById.get(row.id) || '—'
                    const start = toUtcParts(row.firstTime).date || '—'
                    const end = toUtcParts(row.lastTime).date || '—'
                    const days =
                      row.status === 'ok' ? spanDays(row.firstTime, row.lastTime).toFixed(1) : '—'
                    return (
                      <tr key={row.id} className="align-top text-zinc-300">
                        <td className="max-w-[10rem] px-3 py-2">
                          <p className="truncate font-medium text-zinc-100" title={row.fileName}>
                            {row.fileName}
                          </p>
                          {row.status === 'error' && row.error ? (
                            <p className="mt-0.5 text-[10px] leading-snug text-red-400">
                              {row.error}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-2 py-2">
                          {needSymbol ? (
                            <input
                              type="text"
                              value={draft.symbolText}
                              disabled={busy}
                              placeholder={t('importConfirm.symbol')}
                              aria-label={t('importConfirm.symbolAria', { name: row.fileName })}
                              onChange={(event) =>
                                setDraft(row.id, {
                                  symbolText: event.target.value.toUpperCase()
                                })
                              }
                              className="h-7 w-24 rounded-lg border border-zinc-800 bg-zinc-900 px-1.5 font-medium text-zinc-100 outline-none focus:border-primary-500/50 disabled:opacity-40"
                            />
                          ) : (
                            <span className="font-medium text-zinc-100">
                              {row.status === 'ok' ? resolved : '—'}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 tabular-nums text-zinc-400">
                          {row.status === 'ok' ? (
                            <>
                              {start} → {end}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-zinc-400">{days}</td>
                        <td className="px-2 py-2 tabular-nums text-zinc-400">
                          {row.status === 'ok' ? row.candleCount.toLocaleString() : '—'}
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className={cn(
                              'inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                              row.status === 'ok'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-red-500/15 text-red-300'
                            )}
                          >
                            {row.status === 'ok' ? 'ok' : 'error'}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <SoftButton
                            size="sm"
                            variant="ghost"
                            aria-label={t('importConfirm.removeAria', { name: row.fileName })}
                            disabled={busy}
                            onClick={() => removeRow(row.id)}
                            className="!h-7 !w-7 !px-0 hover:text-red-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </SoftButton>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              {t('importConfirm.contractSize')}
            </p>
            {Array.from(symbolGroups.entries()).map(([key, group]) => {
              const symbol =
                key.startsWith('__pending__') ? '' : key
              if (!symbol) {
                return (
                  <p key={key} className="text-[11px] text-zinc-500">
                    Assign symbols above to set contract size for {group.length} file
                    {group.length === 1 ? '' : 's'}.
                  </p>
                )
              }
              const draftKey = contractDraftKeyForSymbol(symbol)
              const draft = drafts[draftKey] ?? { symbolText: symbol, contractSizeText: '' }
              const contractInfo = contractSizeInfoForSymbol(symbol)
              const savedContractSize = useSymbolParamsStore
                .getState()
                .paramsFor(symbol).contractSize
              const defaultContractSize = savedContractSize ?? contractInfo?.contractSize
              return (
                <div
                  key={symbol}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-zinc-900/30 px-3 py-2"
                >
                  <span className="min-w-[4.5rem] text-[12px] font-medium text-zinc-100">
                    {symbol}
                  </span>
                  {contractInfo ? (
                    <>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={draft.contractSizeText}
                        disabled={busy}
                        placeholder={
                          defaultContractSize != null ? String(defaultContractSize) : ''
                        }
                        aria-label={t('importConfirm.contractAria', { symbol })}
                        onChange={(event) =>
                          setDraft(draftKey, { contractSizeText: event.target.value })
                        }
                        className="h-7 w-[7.5rem] min-w-[7.5rem] rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 font-medium tabular-nums text-zinc-100 outline-none focus:border-primary-500/50 disabled:opacity-40"
                      />
                      <span className="text-[11px] text-zinc-500">
                        {t('importConfirm.defaultSize', {
                          size:
                            defaultContractSize != null
                              ? formatContractSize(defaultContractSize)
                              : '—'
                        })}
                      </span>
                    </>
                  ) : (
                    <span className="text-[11px] text-zinc-500">{t('importConfirm.noContractDefault')}</span>
                  )}
                </div>
              )
            })}
          </div>

          
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
            <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              {t('importConfirm.csvTz')}{' '}
              {allTimestampsAbsolute ? (
                <span className="text-emerald-400/90" title={t('importConfirm.tzLockedHint')}>
                  {t('importConfirm.tzLocked')}
                </span>
              ) : (
                <span className="text-amber-400/90">{t('importConfirm.required')}</span>
              )}
            </span>
            {allTimestampsAbsolute ? null : (
              <>
                <select
                  value={dataTimezone}
                  disabled={busy}
                  aria-label={t('importConfirm.csvTzAria')}
                  aria-required="true"
                  onChange={(event) => {
                    setDataTimezone(event.target.value)
                    setFormError(null)
                  }}
                  className="mt-1.5 h-8 w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 px-2 text-[12px] font-medium text-zinc-100 outline-none focus:border-primary-500/50 disabled:opacity-40"
                >
                  <option value="">{t('importConfirm.selectTzBatch')}</option>
                  {CSV_DATA_TIMEZONE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">
                  {t('importConfirm.batchTzHint')}
                </p>
              </>
            )}
          </div>

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
            {t('importConfirm.cancel')}
          </button>
          <button
            type="button"
            disabled={
              busy ||
              okRows.length === 0 ||
              (!allTimestampsAbsolute && !isCsvDataTimezone(dataTimezone))
            }
            onClick={submit}
            className="inline-flex h-8 items-center rounded-xl border border-primary-500/40 bg-primary-500/15 px-3 text-xs font-medium text-primary-300 hover:border-primary-400/70 hover:bg-primary-500/25 hover:text-primary-200 disabled:opacity-40"
          >
            {busy
              ? t('importConfirm.saving')
              : okRows.length > 1
                ? t('importConfirm.confirmLoadN', { count: okRows.length })
                : t('importConfirm.confirmLoad')}
          </button>
        </div>
      </div>
    </div>
  )
}
