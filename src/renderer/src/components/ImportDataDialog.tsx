import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Database, FileUp, Replace, X } from 'lucide-react'
import ImportConfirmModal, { type ImportConfirmDetails } from '@/components/ImportConfirmModal'
import { type ImportOrigin } from '@shared/importTypes'
import { IMPORT_BUILD_UI_PERCENT, type ImportJobProgress } from '@shared/importJobProgress'
import { yieldToEventLoop } from '@shared/yieldToEventLoop'
import { useReplayStore } from '@/store/replayStore'
import { useSymbolParamsStore } from '@/store/symbolParamsStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { isDesktopRuntime } from '@/lib/runtime'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import ImportProgressBar, { type ImportProgress } from '@/components/ImportProgressBar'

export type ImportFeedback = {
  tone: 'error' | 'info'
  message: string
}

type PendingImport = ImportConfirmDetails & {
  content: string
  origin: ImportOrigin
  skipMessage?: string
}

type ImportDataDialogProps = {
  onFeedback?: (feedback: ImportFeedback | null) => void
}

type InlineMessage = { tone: 'error' | 'info' | 'success'; message: string } | null

function normalizeSymbol(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function parseProgressLabel(progress: ImportJobProgress): string {
  if (progress.job === 'parse') {
    if (progress.phase === 'preparing') return 'Preparing file…'
    if (progress.phase === 'parsing') {
      if (progress.totalRows && progress.totalRows > 0) {
        return `Parsing candles… ${(progress.processedRows ?? 0).toLocaleString()} / ${progress.totalRows.toLocaleString()}`
      }
      return 'Parsing candles…'
    }
    return 'Validating candles…'
  }
  if (progress.job === 'save') return 'Saving…'
  return progress.phase
}

/**
 * Global Import: pick CSV → parse → confirm → save.
 * Dataset manage/delete lives in SymbolDatasetsDialog.
 */
export default function ImportDataDialog({ onFeedback }: ImportDataDialogProps): ReactNode {
  const mode = useReplayStore((s) => s.mode)
  const status = useReplayStore((s) => s.status)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const refreshImportedList = useReplayStore((s) => s.refreshImportedList)
  const selectImportedDataset = useReplayStore((s) => s.selectImportedDataset)
  const ensureSymbol = useSymbolParamsStore((s) => s.ensureSymbol)
  const desktop = isDesktopRuntime()

  const open = useUiLayoutStore((s) => s.importDataDialogOpen)
  const setOpen = useUiLayoutStore((s) => s.setImportDataDialogOpen)

  const [busy, setBusy] = useState(false)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [loadProgress, setLoadProgress] = useState<ImportProgress | null>(null)
  const [confirmProgress, setConfirmProgress] = useState<ImportProgress | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)
  const [staleOffer, setStaleOffer] = useState<PendingImport | null>(null)
  const [message, setMessage] = useState<InlineMessage>(null)

  const disabled =
    mode === 'replay' || status === 'loading' || replayLoading || busy || pending != null

  const showBanner = useCallback(
    (tone: ImportFeedback['tone'], messageText: string): void => {
      onFeedback?.({ tone, message: messageText })
    },
    [onFeedback]
  )

  const showInline = useCallback(
    (tone: NonNullable<InlineMessage>['tone'], messageText: string): void => {
      setMessage({ tone, message: messageText })
    },
    []
  )

  const closeDialog = useCallback((): void => {
    if (disabled) return
    const staleToken = staleOffer?.parseToken
    if (staleToken) {
      void window.api.discardImportParse(staleToken)
    }
    setMessage(null)
    setModalError(null)
    setStaleOffer(null)
    setPending(null)
    setOpen(false)
  }, [disabled, setOpen, staleOffer])

  useEffect(() => {
    if (!open) return undefined

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !disabled) closeDialog()
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, disabled, closeDialog])

  function openConfirm(params: PendingImport): void {
    setMessage(null)
    setModalError(null)
    setStaleOffer(null)
    setPending(params)
  }

  function offerStaleReplace(params: PendingImport, skipMessage: string): void {
    setStaleOffer({ ...params, noNewer: true, skipMessage })
    showInline('info', skipMessage)
  }

  async function prepareFromPath(path: string, fileName: string): Promise<void> {
    setBusy(true)
    setMessage(null)
    setModalError(null)
    setLoadProgress({ label: 'Reading file…', percent: 2 })
    await yieldToEventLoop()

    const unsub = window.api.onImportJobProgress((progress) => {
      if (progress.job !== 'parse') return
      setLoadProgress({ label: parseProgressLabel(progress), percent: progress.percent })
    })

    try {
      const parsed = await window.api.parseImportFile(path)
      if (!parsed.ok) {
        showInline('error', parsed.error)
        return
      }

      setLoadProgress({ label: 'Checking existing imports…', percent: 98 })
      const next: PendingImport = {
        content: '',
        fileName: fileName || path,
        candles: parsed.candles,
        firstCandle: parsed.firstCandle ?? parsed.candles[0],
        candleCount: parsed.candleCount,
        firstTime: parsed.firstTime,
        lastTime: parsed.lastTime,
        parseToken: parsed.parseToken,
        symbol: parsed.symbol,
        symbolFromFilename: parsed.symbolFromFilename,
        warnings: parsed.warnings,
        origin: 'csv'
      }

      // Symbol-first model: each CSV is a new dataset under the symbol.
      openConfirm(next)
    } finally {
      unsub()
      setBusy(false)
      setLoadProgress(null)
    }
  }

  async function onImportNew(): Promise<void> {
    const dialog = await window.api.openImportDialog()
    if (!dialog.ok) {
      if (!dialog.canceled && dialog.error) {
        setStaleOffer(null)
        showInline('error', dialog.error)
      }
      return
    }
    setMessage(null)
    setModalError(null)
    setStaleOffer(null)
    await prepareFromPath(dialog.path, dialog.fileName)
  }

  async function onConfirmImport(values: { symbol: string; contractSize?: number }): Promise<void> {
    if (!pending) return
    setConfirmBusy(true)
    setModalError(null)
    setMessage(null)
    setConfirmProgress({ label: 'Building timeframes…', percent: 4 })
    await yieldToEventLoop()

    const unsub = window.api.onImportJobProgress((progress) => {
      if (progress.job === 'parse') return
      setConfirmProgress({ label: parseProgressLabel(progress), percent: progress.percent })
    })

    try {
      const symbol = normalizeSymbol(values.symbol)
      const replaceId = pending.replaceId

      ensureSymbol(symbol, values.contractSize != null ? { contractSize: values.contractSize } : undefined)

      const savedResult = await window.api.saveImport({
        content: pending.content,
        originalFileName: pending.fileName,
        symbol,
        parseToken: pending.parseToken,
        candles1m: pending.parseToken ? undefined : pending.candles,
        replaceId,
        origin: pending.origin,
        contractSize: values.contractSize
      })

      if (!savedResult.ok) {
        setModalError(savedResult.error)
        return
      }

      setConfirmProgress({
        label: 'Loading chart…',
        percent: IMPORT_BUILD_UI_PERCENT.loadingChart
      })
      await selectImportedDataset(savedResult.meta.id, savedResult.meta.timeframe)
      setPending(null)
      setModalError(null)
      setOpen(false)

      const last = formatUtcCandleTime(savedResult.meta.lastTime)
      const source = pending.origin === 'metatrader' ? 'MetaTrader' : 'CSV'
      if (pending.noNewer) {
        showBanner(
          'info',
          `Replaced ${savedResult.meta.symbol} from ${source} (${savedResult.meta.candleCount.toLocaleString()} × 1m). Built 5m · 15m · 1h · 4h · 1d.`
        )
      } else if (savedResult.updated) {
        showBanner(
          'info',
          `Updated ${savedResult.meta.symbol} from ${source}: new candles through ${last}. Built 5m · 15m · 1h · 4h · 1d.`
        )
      } else {
        showBanner(
          'info',
          `Imported ${savedResult.meta.symbol} from ${source} (${savedResult.meta.candleCount.toLocaleString()} × 1m). Built 5m · 15m · 1h · 4h · 1d.`
        )
      }

      await refreshImportedList()
    } finally {
      unsub()
      setConfirmBusy(false)
      setConfirmProgress(null)
    }
  }

  const messageClass =
    message?.tone === 'error'
      ? 'text-red-400'
      : message?.tone === 'success'
        ? 'text-emerald-400/90'
        : 'text-amber-400/90'

  return (
    <>
      <button
        type="button"
        data-tour="import-data"
        disabled={disabled}
        title="Import MT4/MT5 1-minute CSV"
        aria-label="Import data"
        onClick={() => {
          setMessage(null)
          setModalError(null)
          setStaleOffer(null)
          setOpen(true)
        }}
        className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-primary-500/90 px-3 text-xs font-medium text-white shadow-sm shadow-primary-950/30 hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Database className="h-3.5 w-3.5" aria-hidden />
        Import CSV
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-3 sm:p-6"
          role="presentation"
          onClick={() => closeDialog()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-data-title"
            className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/40"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
              <div>
                <h2 id="import-data-title" className="text-sm font-semibold text-zinc-100">
                  Import data
                </h2>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {desktop
                    ? 'CSV files · confirm to save locally'
                    : 'CSV files · confirm to save in this browser'}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                disabled={disabled}
                onClick={() => closeDialog()}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-4 py-4">
              <section>
                <span className="text-[11px] font-medium text-zinc-400">Import CSV</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void onImportNew()}
                  className="mt-1.5 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-primary-500/90 px-3 text-xs font-medium text-white shadow-sm shadow-primary-950/30 hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loadProgress ? (
                    <span>Importing…</span>
                  ) : busy ? (
                    <span>Reading…</span>
                  ) : (
                    <>
                      <FileUp className="h-4 w-4" aria-hidden />
                      Import MT4/MT5 1-minute CSV
                    </>
                  )}
                </button>
                {loadProgress && (
                  <div className="mt-2">
                    <ImportProgressBar progress={loadProgress} />
                  </div>
                )}
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
                  Manage files per symbol on Datasets → Edit.
                </p>
              </section>

              {message && (
                <div
                  className={`space-y-2 rounded-xl border px-3 py-2.5 ${
                    message.tone === 'error'
                      ? 'border-red-900/60 bg-red-950/20'
                      : message.tone === 'success'
                        ? 'border-emerald-900/60 bg-emerald-950/20'
                        : 'border-amber-900/60 bg-amber-950/20'
                  }`}
                >
                  <p className={`text-[11px] leading-relaxed ${messageClass}`}>{message.message}</p>
                  {staleOffer && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => openConfirm(staleOffer)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-primary-500/90 px-3 text-xs font-medium text-white shadow-sm shadow-primary-950/30 hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Replace className="h-3.5 w-3.5" aria-hidden />
                      Replace existing import
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] px-4 py-3">
              <button
                type="button"
                disabled={disabled}
                onClick={() => closeDialog()}
                className="inline-flex h-8 items-center rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <ImportConfirmModal
        details={pending}
        busy={confirmBusy}
        progress={confirmProgress}
        serverError={modalError}
        onCancel={() => {
          if (!confirmBusy) {
            const cancelled = pending
            setPending(null)
            setModalError(null)
            if (cancelled?.noNewer) {
              offerStaleReplace(
                cancelled,
                cancelled.skipMessage ||
                  `${cancelled.existingSymbol || cancelled.symbol || 'This symbol'} is already imported. This has no newer candles — nothing was updated.`
              )
            } else if (cancelled?.parseToken) {
              void window.api.discardImportParse(cancelled.parseToken)
            }
          }
        }}
        onConfirm={(values) => void onConfirmImport(values)}
      />
    </>
  )
}
