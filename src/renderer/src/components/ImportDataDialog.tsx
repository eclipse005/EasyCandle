import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Database, FileUp, X } from 'lucide-react'
import ImportBatchConfirmModal, {
  type ImportBatchItem,
  type ImportBatchSaveRequest
} from '@/components/ImportBatchConfirmModal'
import type { ImportOrigin } from '@shared/importTypes'
import { IMPORT_BUILD_UI_PERCENT, type ImportJobProgress } from '@shared/importJobProgress'
import { yieldToEventLoop } from '@shared/yieldToEventLoop'
import { useReplayStore } from '@/store/replayStore'
import { useSymbolParamsStore } from '@/store/symbolParamsStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { isDesktopRuntime } from '@/lib/runtime'
import ImportProgressBar, { type ImportProgress } from '@/components/ImportProgressBar'

export type ImportFeedback = {
  tone: 'error' | 'info'
  message: string
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

function discardBatchTokens(items: ImportBatchItem[]): void {
  for (const item of items) {
    if (item.parseToken) void window.api.discardImportParse(item.parseToken)
  }
}

/**
 * Global Import: pick CSV(s) → parse → confirm → save each as its own dataset.
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
  const [pending, setPending] = useState<ImportBatchItem[] | null>(null)
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
    setMessage(null)
    setModalError(null)
    setPending(null)
    setOpen(false)
  }, [disabled, setOpen])

  useEffect(() => {
    if (!open) return undefined

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !disabled) closeDialog()
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, disabled, closeDialog])

  async function prepareFromFiles(
    files: { path: string; fileName: string }[]
  ): Promise<void> {
    setBusy(true)
    setMessage(null)
    setModalError(null)
    const total = files.length
    setLoadProgress({
      label: total > 1 ? `Parsing 1/${total}…` : 'Reading file…',
      percent: 2
    })
    await yieldToEventLoop()

    const unsub = window.api.onImportJobProgress((progress) => {
      if (progress.job !== 'parse') return
      setLoadProgress((prev) => ({
        label: parseProgressLabel(progress),
        percent: prev?.percent ?? progress.percent
      }))
    })

    const batch: ImportBatchItem[] = []

    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i]
        const idx = i + 1
        setLoadProgress({
          label: total > 1 ? `Parsing ${idx}/${total}…` : 'Reading file…',
          percent: Math.round((i / total) * 90) + 2
        })
        await yieldToEventLoop()

        const parsed = await window.api.parseImportFile(file.path)
        if (!parsed.ok) {
          batch.push({
            id: file.path,
            path: file.path,
            fileName: file.fileName || file.path,
            status: 'error',
            error: parsed.error,
            symbol: null,
            symbolFromFilename: false,
            candles: [],
            candleCount: 0,
            firstTime: 0,
            lastTime: 0,
            warnings: [],
            content: '',
            origin: 'csv' as ImportOrigin
          })
          continue
        }

        batch.push({
          id: file.path,
          path: file.path,
          fileName: file.fileName || file.path,
          status: 'ok',
          symbol: parsed.symbol,
          symbolFromFilename: parsed.symbolFromFilename,
          candles: parsed.candles,
          firstCandle: parsed.firstCandle ?? parsed.candles[0],
          candleCount: parsed.candleCount,
          firstTime: parsed.firstTime,
          lastTime: parsed.lastTime,
          parseToken: parsed.parseToken,
          warnings: parsed.warnings,
          content: '',
          origin: 'csv'
        })
      }

      setLoadProgress({ label: 'Ready…', percent: 98 })
      if (batch.every((b) => b.status === 'error')) {
        showInline(
          'error',
          batch.length === 1
            ? batch[0].error || 'Import failed.'
            : `All ${batch.length} files failed to parse.`
        )
        discardBatchTokens(batch)
        return
      }

      setPending(batch)
      setMessage(null)
      setModalError(null)
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
        showInline('error', dialog.error)
      }
      return
    }
    setMessage(null)
    setModalError(null)
    const files = dialog.files?.length
      ? dialog.files
      : [{ path: dialog.path, fileName: dialog.fileName }]
    await prepareFromFiles(files)
  }

  async function saveBatch(saves: ImportBatchSaveRequest[]): Promise<void> {
    if (!saves.length) return
    setConfirmBusy(true)
    setModalError(null)
    setMessage(null)
    const total = saves.length
    setConfirmProgress({
      label: total > 1 ? `Saving 1/${total}…` : 'Building timeframes…',
      percent: 4
    })
    await yieldToEventLoop()

    const unsub = window.api.onImportJobProgress((progress) => {
      if (progress.job === 'parse') return
      setConfirmProgress((prev) => ({
        label: parseProgressLabel(progress),
        percent: prev?.percent ?? progress.percent
      }))
    })

    const failures: ImportBatchSaveRequest[] = []
    let lastSaveError: string | null = null
    let lastMetaId: string | null = null
    let lastTimeframe: string | null = null
    let savedCount = 0

    try {
      for (let i = 0; i < saves.length; i += 1) {
        const save = saves[i]
        const idx = i + 1
        setConfirmProgress({
          label: total > 1 ? `Saving ${idx}/${total}…` : 'Building timeframes…',
          percent: Math.round((i / total) * 85) + 4
        })
        await yieldToEventLoop()

        const symbol = normalizeSymbol(save.symbol)
        ensureSymbol(
          symbol,
          save.contractSize != null ? { contractSize: save.contractSize } : undefined
        )

        const savedResult = await window.api.saveImport({
          content: save.item.content,
          originalFileName: save.item.fileName,
          symbol,
          parseToken: save.item.parseToken,
          candles1m: save.item.parseToken ? undefined : save.item.candles,
          origin: save.item.origin,
          contractSize: save.contractSize
        })

        if (!savedResult.ok) {
          lastSaveError = savedResult.error || lastSaveError
          failures.push(save)
          continue
        }

        savedCount += 1
        lastMetaId = savedResult.meta.id
        lastTimeframe = savedResult.meta.timeframe
        // Token consumed on success — clear so cancel won't double-discard.
        save.item.parseToken = undefined
      }

      if (failures.length && savedCount === 0) {
        setModalError(
          failures.length === 1
            ? `Failed to save ${failures[0].item.fileName}${lastSaveError ? `: ${lastSaveError}` : '.'}`
            : `Failed to save all ${failures.length} files${lastSaveError ? `: ${lastSaveError}` : '.'}`
        )
        return
      }

      if (lastMetaId) {
        setConfirmProgress({
          label: 'Loading chart…',
          percent: IMPORT_BUILD_UI_PERCENT.loadingChart
        })
        await selectImportedDataset(lastMetaId, lastTimeframe || undefined)
      }

      await refreshImportedList()

      if (failures.length) {
        setModalError(
          `Saved ${savedCount}/${total}. ${failures.length} failed — retry failed below.`
        )
        // Keep modal open with only failed items still pending for retry.
        setPending(
          failures.map((f) => ({
            ...f.item,
            status: 'ok' as const
          }))
        )
        showBanner(
          'info',
          `Imported ${savedCount} dataset${savedCount === 1 ? '' : 's'}; ${failures.length} failed.`
        )
        return
      }

      setPending(null)
      setModalError(null)
      setOpen(false)
      showBanner(
        'info',
        savedCount === 1
          ? `Imported ${normalizeSymbol(saves[0].symbol)} (${saves[0].item.candleCount.toLocaleString()} × 1m). Built 5m · 15m · 1h · 4h · 1d.`
          : `Imported ${savedCount} datasets. Built 5m · 15m · 1h · 4h · 1d for each.`
      )
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
                    ? 'CSV files · multi-select · confirm to save locally'
                    : 'CSV files · multi-select · confirm to save in this browser'}
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
                  Select one or more CSVs. Each file becomes its own dataset. Manage files per
                  symbol on Datasets → Edit.
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

      <ImportBatchConfirmModal
        items={pending}
        busy={confirmBusy}
        progress={confirmProgress}
        serverError={modalError}
        onItemsChange={(next) => setPending(next.length ? next : null)}
        onCancel={() => {
          if (!confirmBusy) {
            if (pending) discardBatchTokens(pending)
            setPending(null)
            setModalError(null)
                  }
        }}
        onConfirm={(saves) => {
          // Confirm (or retry remaining after a partial save failure).
          void saveBatch(saves)
        }}
      />
    </>
  )
}
