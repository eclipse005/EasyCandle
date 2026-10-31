import { useMemo, type ReactNode } from 'react'
import { FileUp, Trash2 } from 'lucide-react'
import type { ImportedDatasetMeta } from '@shared/importTypes'
import { coverageDaysFromMetas } from '@shared/dateCoverage'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import DateCoverageCalendar from '@/components/dashboard/DateCoverageCalendar'
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

/**
 * Manage drawer for one symbol: list CSV files, delete one, import more,
 * and a read-only date-coverage calendar (union of file spans).
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
  const setImportOpen = useUiLayoutStore((s) => s.setImportDataDialogOpen)

  const coverage = useMemo(() => coverageDaysFromMetas(files), [files])

  async function deleteFile(id: string): Promise<void> {
    const result = await window.api.deleteImport(id)
    if (!result.ok) return
    if (importMeta?.id === id) clearImportedDataset()
    await refreshImportedList()
  }

  return (
    <SoftDialog
      open={open}
      onClose={onClose}
      labelledBy="symbol-datasets-title"
      title={`${symbol} datasets`}
      description="Each CSV is a dataset under this symbol. Overlapping bars: newer import wins."
      className="max-w-lg"
      footer={
        <>
          <SoftButton
            variant="secondary"
            onClick={() => {
              setImportOpen(true)
            }}
          >
            <FileUp className="h-3.5 w-3.5" aria-hidden />
            Import more CSV
          </SoftButton>
          <SoftButton variant="primary" onClick={onClose}>
            Done
          </SoftButton>
        </>
      }
    >
      <div className="space-y-4">
        {files.length === 0 ? (
          <SoftEmpty>No files for this symbol — import a CSV.</SoftEmpty>
        ) : (
          <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.06]">
            {files.map((meta) => {
              const active = importMeta?.id === meta.id
              return (
                <li key={meta.id} className="flex items-start gap-3 px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-zinc-100">
                      <span className="truncate">{meta.originalFileName}</span>
                      {active ? (
                        <span className="rounded-lg border border-sky-700/60 bg-sky-950/50 px-1.5 py-px text-[10px] uppercase tracking-wide text-sky-300">
                          Active
                        </span>
                      ) : null}
                    </p>
                    <p className={cn('mt-1', softType.caption)}>
                      {meta.candleCount.toLocaleString()} × 1m ·{' '}
                      {formatUtcCandleTime(meta.firstTime)} → {formatUtcCandleTime(meta.lastTime)}
                    </p>
                  </div>
                  <SoftButton
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${meta.originalFileName}`}
                    onClick={() => void deleteFile(meta.id)}
                    className="!h-7 !w-7 shrink-0 !px-0 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </SoftButton>
                </li>
              )
            })}
          </ul>
        )}

        <div>
          <h3 className={cn(softType.caption, 'mb-2 font-medium text-zinc-400')}>
            Date coverage (UTC)
          </h3>
          <DateCoverageCalendar coverageDays={coverage} />
        </div>
      </div>
    </SoftDialog>
  )
}
