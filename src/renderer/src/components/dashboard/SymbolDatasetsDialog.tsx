import { useCallback, useState, useMemo, type ReactNode } from 'react'
import { FileUp, Trash2 } from 'lucide-react'
import type { ImportedDatasetMeta, ImportOrigin } from '@shared/importTypes'
import { coverageDaysFromMetas } from '@shared/dateCoverage'
import { IMPORT_BUILD_UI_PERCENT, type ImportJobProgress } from '@shared/importJobProgress'
import { yieldToEventLoop } from '@shared/yieldToEventLoop'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import { useReplayStore } from '@/store/replayStore'
import { useSymbolParamsStore } from '@/store/symbolParamsStore'
import DateCoveragePopover from '@/components/dashboard/DateCoveragePopover'
import ImportConfirmModal, { type ImportConfirmDetails } from '@/components/ImportConfirmModal'
import ImportProgressBar, { type ImportProgress } from '@/components/ImportProgressBar'
import SoftButton from '@/components/ui/SoftButton'
import SoftDialog from '@/components/ui/SoftDialog'
import SoftEmpty from '@/components/ui/SoftEmpty'
import { cn } from '@/components/ui/cn'
import { softType } from '@/components/ui/softTokens'

export type SymbolDatasetsDialogProps = {
  open: boolean
  symbol: string
  files: ImportedDatasetMeta[]
  onClose: () => void
}

type PendingImport = ImportConfirmDetails & {
  content: string
  origin: ImportOrigin
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
 * Manage drawer for one symbol: list CSV files, delete one, import more (inline),
 * and a read-only date-coverage popover (union of file spans).
 */
export default function SymbolDatasetsDialog({
  open,
  symbol,
  files,
  onClose
}: SymbolDatasetsDialogProps): ReactNode {
  const refreshImportedList = useReplayStore((s) => s.refreshImportedList)
  const importMeta = useReplayStore((s) => s.importMeta)
  const clearImportedDataset = useReplayStore((s) => s.clearImportedDataset)
  const selectImportedDataset = useReplayStore((s) => s.selectImportedDataset)
  const ensureSymbol = useSymbolParamsStore((s) => s.ensureSymbol)

  const [busy, setBusy] = useState(false)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [loadProgress, setLoadProgress] = useState<ImportProgress | null>(null)
  const [confirmProgress, setConfirmProgress] = useState<ImportProgress | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)
  const [message, setMessage] = useState<InlineMessage>(null)

  const coverage = useMemo(() => coverageDaysFromMetas(files), [files])
  const panelSymbol = normalizeSymbol(symbol)
  const importDisabled = busy || pending != null || confirmBusy

  const showInline = useCallback(
    (tone: NonNullable<InlineMessage>['tone'], messageText: string): void => {
      setMessage({ tone, message: messageText })
    },
    []
  )

  async function deleteFile(id: string): Promise<void> {
    const result = await window.api.deleteImport(id)
    if (!result.ok) return
    if (importMeta?.id === id) clearImportedDataset()
    await refreshImportedList()
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

      // Lock confirm to this panel's symbol when parse is empty or differs.
      const parsedSym = parsed.symbol ? normalizeSymbol(parsed.symbol) : ''
      const lockedSymbol = panelSymbol
      const forceLock = !parsedSym || parsedSym !== lockedSymbol

      const next: PendingImport = {
        content: '',
        fileName: fileName || path,
        candles: parsed.candles,
        firstCandle: parsed.firstCandle ?? parsed.candles[0],
        candleCount: parsed.candleCount,
        firstTime: parsed.firstTime,
        lastTime: parsed.lastTime,
        parseToken: parsed.parseToken,
        symbol: forceLock ? lockedSymbol : parsed.symbol,
        symbolFromFilename: forceLock ? true : parsed.symbolFromFilename,
        warnings: parsed.warnings,
        origin: 'csv'
      }

      setPending(next)
      setMessage(null)
      setModalError(null)
    } finally {
      unsub()
      setBusy(false)
      setLoadProgress(null)
    }
  }

  async function onImportMore(): Promise<void> {
    if (importDisabled) return
    const dialog = await window.api.openImportDialog()
    if (!dialog.ok) {
      if (!dialog.canceled && dialog.error) {
        showInline('error', dialog.error)
      }
      return
    }
    setMessage(null)
    setModalError(null)
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
      // Prefer panel symbol so the file lands under this manage dialog.
      const nextSymbol = panelSymbol || normalizeSymbol(values.symbol)
      const replaceId = pending.replaceId

      ensureSymbol(
        nextSymbol,
        values.contractSize != null ? { contractSize: values.contractSize } : undefined
      )

      const savedResult = await window.api.saveImport({
        content: pending.content,
        originalFileName: pending.fileName,
        symbol: nextSymbol,
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
      await refreshImportedList()
      showInline(
        'success',
        `Imported ${savedResult.meta.originalFileName} (${savedResult.meta.candleCount.toLocaleString()} × 1m).`
      )
    } finally {
      unsub()
      setConfirmBusy(false)
      setConfirmProgress(null)
    }
  }

  function handleClose(): void {
    // SoftDialog close is disabled while busy/pending; ImportConfirmModal owns cancel.
    if (busy || confirmBusy || pending != null) return
    setMessage(null)
    onClose()
  }

  const messageClass =
    message?.tone === 'error'
      ? 'text-red-400'
      : message?.tone === 'success'
        ? 'text-emerald-400/90'
        : 'text-amber-400/90'

  return (
    <>
      <SoftDialog
        open={open}
        onClose={handleClose}
        labelledBy="symbol-datasets-title"
        title={`${symbol} datasets`}
        description="Each CSV is a dataset under this symbol. Overlapping bars: newer import wins."
        className="max-w-2xl"
        closeDisabled={importDisabled}
        footer={
          <>
            <SoftButton
              variant="secondary"
              disabled={importDisabled}
              onClick={() => void onImportMore()}
            >
              <FileUp className="h-3.5 w-3.5" aria-hidden />
              {loadProgress ? 'Importing…' : 'Import more CSV'}
            </SoftButton>
            <SoftButton variant="primary" disabled={importDisabled} onClick={handleClose}>
              Done
            </SoftButton>
          </>
        }
      >
        <div className="space-y-4">
          {files.length === 0 ? (
            <SoftEmpty>No files for this symbol — import a CSV.</SoftEmpty>
          ) : (
            <div className="max-h-[11.5rem] overflow-y-auto rounded-xl border border-white/[0.06]">
              <ul className="divide-y divide-white/[0.05]">
                {files.map((meta) => {
                  return (
                    <li key={meta.id} className="flex items-start gap-3 px-3.5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-zinc-100">
                          {meta.originalFileName}
                        </p>
                        <p className={cn('mt-1', softType.caption)}>
                          {meta.candleCount.toLocaleString()} × 1m ·{' '}
                          {formatUtcCandleTime(meta.firstTime)} →{' '}
                          {formatUtcCandleTime(meta.lastTime)}
                        </p>
                      </div>
                      <SoftButton
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${meta.originalFileName}`}
                        disabled={importDisabled}
                        onClick={() => void deleteFile(meta.id)}
                        className="!h-7 !w-7 shrink-0 !px-0 hover:text-red-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </SoftButton>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {loadProgress ? (
            <div>
              <ImportProgressBar progress={loadProgress} />
            </div>
          ) : null}

          {message ? (
            <p
              className={cn(
                'rounded-xl border px-3 py-2 text-[11px] leading-relaxed',
                message.tone === 'error'
                  ? 'border-red-900/60 bg-red-950/20'
                  : message.tone === 'success'
                    ? 'border-emerald-900/60 bg-emerald-950/20'
                    : 'border-amber-900/60 bg-amber-950/20',
                messageClass
              )}
            >
              {message.message}
            </p>
          ) : null}

          <DateCoveragePopover
            mode="coverage"
            coverageDays={coverage}
            caption="Date coverage (UTC)"
            disabled={importDisabled}
          />
        </div>
      </SoftDialog>

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
            if (cancelled?.parseToken) {
              void window.api.discardImportParse(cancelled.parseToken)
            }
          }
        }}
        onConfirm={(values) => void onConfirmImport(values)}
      />
    </>
  )
}
