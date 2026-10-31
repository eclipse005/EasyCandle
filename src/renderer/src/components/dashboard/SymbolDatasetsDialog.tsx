import { useCallback, useState, useMemo, type ReactNode } from 'react'
import { FileUp, Trash2 } from 'lucide-react'
import type { ImportedDatasetMeta, ImportOrigin } from '@shared/importTypes'
import { coverageDaysFromMetas } from '@shared/dateCoverage'
import { IMPORT_BUILD_UI_PERCENT, type ImportJobProgress } from '@shared/importJobProgress'
import { yieldToEventLoop } from '@shared/yieldToEventLoop'
import { toUtcParts } from '@/lib/utcDateTime'
import { useReplayStore } from '@/store/replayStore'
import { useSymbolParamsStore } from '@/store/symbolParamsStore'
import DateCoveragePopover from '@/components/dashboard/DateCoveragePopover'
import ImportBatchConfirmModal, {
  type ImportBatchItem,
  type ImportBatchSaveRequest
} from '@/components/ImportBatchConfirmModal'
import ImportProgressBar, { type ImportProgress } from '@/components/ImportProgressBar'
import SoftButton from '@/components/ui/SoftButton'
import SoftDialog from '@/components/ui/SoftDialog'
import SoftConfirmDialog from '@/components/ui/SoftConfirmDialog'
import SoftEmpty from '@/components/ui/SoftEmpty'
import { cn } from '@/components/ui/cn'
import { softType } from '@/components/ui/softTokens'
import { useT } from '@/i18n/useT'
import type { MessageKey } from '@/i18n/messages'

export type SymbolDatasetsDialogProps = {
  open: boolean
  symbol: string
  files: ImportedDatasetMeta[]
  onClose: () => void
}

type InlineMessage = { tone: 'error' | 'info' | 'success'; message: string } | null

function normalizeSymbol(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function parseProgressLabel(
  progress: ImportJobProgress,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
): string {
  if (progress.job === 'parse') {
    if (progress.phase === 'preparing') return t('importProgress.preparing')
    if (progress.phase === 'parsing') {
      if (progress.totalRows && progress.totalRows > 0) {
        return t('importProgress.parsingCount', {
          processed: (progress.processedRows ?? 0).toLocaleString(),
          total: progress.totalRows.toLocaleString()
        })
      }
      return t('importProgress.parsing')
    }
    return t('importProgress.validating')
  }
  if (progress.job === 'save') return t('importProgress.saving')
  return progress.phase
}

function discardBatchTokens(items: ImportBatchItem[]): void {
  for (const item of items) {
    if (item.parseToken) void window.api.discardImportParse(item.parseToken)
  }
}

/**
 * Manage drawer for one symbol: list CSV files, delete one, import more (multi),
 * and a read-only date-coverage popover (union of file spans).
 */
export default function SymbolDatasetsDialog({
  open,
  symbol,
  files,
  onClose
}: SymbolDatasetsDialogProps): ReactNode {
  const { t } = useT()
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
  const [pending, setPending] = useState<ImportBatchItem[] | null>(null)
  const [message, setMessage] = useState<InlineMessage>(null)
  const [pendingFileDelete, setPendingFileDelete] = useState<ImportedDatasetMeta | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const coverage = useMemo(() => coverageDaysFromMetas(files), [files])
  const panelSymbol = normalizeSymbol(symbol)
  const importDisabled = busy || pending != null || confirmBusy

  const showInline = useCallback(
    (tone: NonNullable<InlineMessage>['tone'], messageText: string): void => {
      setMessage({ tone, message: messageText })
    },
    []
  )

  async function confirmDeleteFile(): Promise<void> {
    if (!pendingFileDelete) return
    setDeleteBusy(true)
    try {
      const id = pendingFileDelete.id
      const result = await window.api.deleteImport(id)
      if (!result.ok) return
      if (importMeta?.id === id) clearImportedDataset()
      await refreshImportedList()
      setPendingFileDelete(null)
    } finally {
      setDeleteBusy(false)
    }
  }

  async function prepareFromFiles(
    fileList: { path: string; fileName: string }[]
  ): Promise<void> {
    setBusy(true)
    setMessage(null)
    setModalError(null)
    const total = fileList.length
    setLoadProgress({
      label: total > 1 ? t('importProgress.parsingN', { idx: 1, total }) : t('importProgress.reading'),
      percent: 2
    })
    await yieldToEventLoop()

    const unsub = window.api.onImportJobProgress((progress) => {
      if (progress.job !== 'parse') return
      setLoadProgress((prev) => ({
        label: parseProgressLabel(progress, t),
        percent: prev?.percent ?? progress.percent
      }))
    })

    const batch: ImportBatchItem[] = []

    try {
      for (let i = 0; i < fileList.length; i += 1) {
        const file = fileList[i]
        const idx = i + 1
        setLoadProgress({
          label: total > 1 ? t('importProgress.parsingN', { idx, total }) : t('importProgress.reading'),
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
            symbol: panelSymbol,
            symbolFromFilename: true,
            candles: [],
            candleCount: 0,
            firstTime: 0,
            lastTime: 0,
            warnings: [],
            content: '',
            origin: 'csv' as ImportOrigin,
            timestampsAbsolute: false
          })
          continue
        }

        // Lock confirm to this panel's symbol when parse is empty or differs.
        const parsedSym = parsed.symbol ? normalizeSymbol(parsed.symbol) : ''
        const forceLock = !parsedSym || parsedSym !== panelSymbol

        batch.push({
          id: file.path,
          path: file.path,
          fileName: file.fileName || file.path,
          status: 'ok',
          symbol: forceLock ? panelSymbol : parsed.symbol,
          symbolFromFilename: forceLock ? true : parsed.symbolFromFilename,
          candles: parsed.candles,
          firstCandle: parsed.firstCandle ?? parsed.candles[0],
          candleCount: parsed.candleCount,
          firstTime: parsed.firstTime,
          lastTime: parsed.lastTime,
          parseToken: parsed.parseToken,
          warnings: parsed.warnings,
          content: '',
          origin: 'csv',
          timestampsAbsolute: Boolean(parsed.timestampsAbsolute)
        })
      }

      setLoadProgress({ label: t('importProgress.ready'), percent: 98 })
      if (batch.every((b) => b.status === 'error')) {
        showInline(
          'error',
          batch.length === 1
            ? batch[0].error || t('importProgress.failed')
            : t('importProgress.allFailed', { count: batch.length })
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
    const fileList = dialog.files?.length
      ? dialog.files
      : [{ path: dialog.path, fileName: dialog.fileName }]
    await prepareFromFiles(fileList)
  }

  async function saveBatch(saves: ImportBatchSaveRequest[]): Promise<void> {
    if (!saves.length) return
    setConfirmBusy(true)
    setModalError(null)
    setMessage(null)
    const total = saves.length
    setConfirmProgress({
      label: total > 1 ? t('importProgress.savingN', { idx: 1, total }) : t('importProgress.buildingTf'),
      percent: 4
    })
    await yieldToEventLoop()

    const unsub = window.api.onImportJobProgress((progress) => {
      if (progress.job === 'parse') return
      setConfirmProgress((prev) => ({
        label: parseProgressLabel(progress, t),
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
          label: total > 1 ? t('importProgress.savingN', { idx, total }) : t('importProgress.buildingTf'),
          percent: Math.round((i / total) * 85) + 4
        })
        await yieldToEventLoop()

        // Prefer panel symbol so the file lands under this manage dialog.
        const nextSymbol = panelSymbol || normalizeSymbol(save.symbol)
        ensureSymbol(
          nextSymbol,
          save.contractSize != null ? { contractSize: save.contractSize } : undefined
        )

        const savedResult = await window.api.saveImport({
          content: save.item.content,
          originalFileName: save.item.fileName,
          symbol: nextSymbol,
          parseToken: save.item.parseToken,
          candles1m: save.item.parseToken ? undefined : save.item.candles,
          origin: save.item.origin,
          contractSize: save.contractSize,
          dataTimezone: save.dataTimezone
        })

        if (!savedResult.ok) {
          lastSaveError = savedResult.error || lastSaveError
          failures.push(save)
          continue
        }

        savedCount += 1
        lastMetaId = savedResult.meta.id
        lastTimeframe = savedResult.meta.timeframe
        save.item.parseToken = undefined
      }

      if (failures.length && savedCount === 0) {
        setModalError(
          failures.length === 1
            ? t('importProgress.saveFailedOne', {
                name: failures[0].item.fileName,
                detail: lastSaveError ? `: ${lastSaveError}` : '.'
              })
            : t('importProgress.saveFailedAll', {
                count: failures.length,
                detail: lastSaveError ? `: ${lastSaveError}` : '.'
              })
        )
        return
      }

      if (lastMetaId) {
        setConfirmProgress({
          label: t('importProgress.loadingChart'),
          percent: IMPORT_BUILD_UI_PERCENT.loadingChart
        })
        await selectImportedDataset(lastMetaId, lastTimeframe || undefined)
      }

      await refreshImportedList()

      if (failures.length) {
        setModalError(
          t('importProgress.partialSaved', {
            saved: savedCount,
            total,
            failed: failures.length
          })
        )
        setPending(
          failures.map((f) => ({
            ...f.item,
            status: 'ok' as const
          }))
        )
        showInline(
          'info',
          t('importProgress.importedPartial', {
            saved: savedCount,
            suffix: savedCount === 1 ? '' : 's',
            failed: failures.length
          })
        )
        return
      }

      setPending(null)
      setModalError(null)
      showInline(
        'success',
        savedCount === 1
          ? t('importProgress.importedOne', {
              name: saves[0].item.fileName,
              count: saves[0].item.candleCount.toLocaleString()
            })
          : t('importProgress.importedMany', { count: savedCount, symbol: panelSymbol })
      )
    } finally {
      unsub()
      setConfirmBusy(false)
      setConfirmProgress(null)
    }
  }

  function handleClose(): void {
    // SoftDialog close is disabled while busy/pending; batch modal owns cancel.
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
        title={t('symbolDatasets.title', { symbol })}
        description={t('symbolDatasets.description')}
        className="max-h-[min(90vh,48rem)] max-w-3xl"
        closeDisabled={importDisabled}
        footer={
          <>
            <SoftButton
              variant="secondary"
              disabled={importDisabled}
              onClick={() => void onImportMore()}
            >
              <FileUp className="h-3.5 w-3.5" aria-hidden />
              {loadProgress ? t('symbolDatasets.importing') : t('symbolDatasets.import')}
            </SoftButton>
            <SoftButton variant="primary" disabled={importDisabled} onClick={handleClose}>
              {t('symbolDatasets.done')}
            </SoftButton>
          </>
        }
      >
        <div className="space-y-4">
          {files.length === 0 ? (
            <SoftEmpty>{t('symbolDatasets.empty')}</SoftEmpty>
          ) : (
            <div className="max-h-[min(40vh,22rem)] overflow-y-auto rounded-xl border border-white/[0.06]">
              <ul className="divide-y divide-white/[0.05]">
                {files.map((meta) => {
                  return (
                    <li key={meta.id} className="flex items-start gap-3 px-3.5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-zinc-100">
                          {meta.originalFileName}
                        </p>
                        <p className={cn('mt-1', softType.caption)}>
                          {t('symbolDatasets.candlesMeta', {
                            count: meta.candleCount.toLocaleString(),
                            from: toUtcParts(meta.firstTime).date || '—',
                            to: toUtcParts(meta.lastTime).date || '—'
                          })}
                        </p>
                      </div>
                      <SoftButton
                        size="sm"
                        variant="ghost"
                        aria-label={t('symbolDatasets.deleteAria', { name: meta.originalFileName })}
                        disabled={importDisabled}
                        onClick={() => setPendingFileDelete(meta)}
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
            caption={t('symbolDatasets.dateCoverage')}
            disabled={importDisabled}
          />
        </div>
      </SoftDialog>

      <SoftConfirmDialog
        open={pendingFileDelete != null}
        title={t('symbolDatasets.deleteTitle')}
        description={
          pendingFileDelete
            ? t('symbolDatasets.deleteBody', { name: pendingFileDelete.originalFileName })
            : undefined
        }
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        busy={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setPendingFileDelete(null)
        }}
        onConfirm={() => {
          void confirmDeleteFile()
        }}
      />

      <ImportBatchConfirmModal
        items={pending}
        lockedSymbol={panelSymbol}
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
        onConfirm={(saves) => void saveBatch(saves)}
      />
    </>
  )
}
