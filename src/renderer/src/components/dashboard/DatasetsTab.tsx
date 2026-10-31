import { useMemo, useState, type ReactNode } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { coverageSpanLabel, groupImportsBySymbol } from '@shared/dateCoverage'
import { useReplayStore } from '@/store/replayStore'
import ImportDataDialog from '@/components/ImportDataDialog'
import SymbolDatasetsDialog from '@/components/dashboard/SymbolDatasetsDialog'
import SoftButton from '@/components/ui/SoftButton'
import SoftConfirmDialog from '@/components/ui/SoftConfirmDialog'
import SoftCard from '@/components/ui/SoftCard'
import SoftEmpty from '@/components/ui/SoftEmpty'
import { softType } from '@/components/ui/softTokens'
import { cn } from '@/components/ui/cn'
import { useT } from '@/i18n/useT'

/**
 * Datasets page — one SoftCard per SYMBOL that has ≥1 imported CSV.
 * Edit opens the manage drawer; trash deletes all files for that symbol.
 * New session lives on Testing, not here.
 */
export default function DatasetsTab(): ReactNode {
  const { t } = useT()
  const imports = useReplayStore((s) => s.importedList)
  const refreshImportedList = useReplayStore((s) => s.refreshImportedList)
  const importMeta = useReplayStore((s) => s.importMeta)
  const clearImportedDataset = useReplayStore((s) => s.clearImportedDataset)

  const groups = useMemo(() => groupImportsBySymbol(imports), [imports])
  const [manageKey, setManageKey] = useState<string | null>(null)

  const managing = useMemo(
    () => (manageKey ? groups.find((g) => g.key === manageKey) ?? null : null),
    [groups, manageKey]
  )

  const [pendingDelete, setPendingDelete] = useState<{
    key: string
    symbol: string
    ids: string[]
  } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  async function confirmDeleteAll(): Promise<void> {
    if (!pendingDelete) return
    const { key, ids } = pendingDelete
    setDeleteBusy(true)
    try {
      for (const id of ids) {
        await window.api.deleteImport(id)
        if (importMeta?.id === id) clearImportedDataset()
      }
      await refreshImportedList()
      if (manageKey === key) setManageKey(null)
      setPendingDelete(null)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className={cn(softType.section)}>{t('datasets.title')}</h2>
          <p className={cn('mt-1', softType.bodyMuted)}>{t('datasets.subtitle')}</p>
        </div>
        <ImportDataDialog />
      </div>

      {groups.length === 0 ? (
        <SoftEmpty>{t('datasets.empty')}</SoftEmpty>
      ) : (
        <div className="space-y-2.5">
          {groups.map((group) => {
            const span = coverageSpanLabel(group.coverageDays)
            const dayCount = group.coverageDays.size
            const daysLabel = `${dayCount.toLocaleString()} day${dayCount === 1 ? '' : 's'}`
            // Product rule: omit file-count labels in Datasets chrome (detail via Edit).
            const metaLine = `${daysLabel} · ${span}`
            return (
              <SoftCard
                key={group.key}
                elevated
                className="flex min-w-0 items-center gap-4 px-4 py-3.5 transition-colors hover:border-white/10"
              >
                <div
                  className={cn(
                    'w-[8.5rem] shrink-0 truncate text-[13px] font-semibold text-zinc-100',
                    'dark:text-zinc-100'
                  )}
                  title={group.symbol}
                >
                  {group.symbol}
                </div>
                <div
                  className="min-w-0 flex-1 truncate text-[12px] tabular-nums text-zinc-400"
                  title={metaLine}
                >
                  {metaLine}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <SoftButton
                    size="sm"
                    variant="secondary"
                    aria-label={`Edit datasets for ${group.symbol}`}
                    onClick={() => setManageKey(group.key)}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    {t('datasets.edit')}
                  </SoftButton>
                  <SoftButton
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete datasets for ${group.symbol}`}
                    onClick={() =>
                      setPendingDelete({
                        key: group.key,
                        symbol: group.symbol,
                        ids: group.files.map((f) => f.id)
                      })
                    }
                    className="!h-7 !w-7 !px-0 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </SoftButton>
                </div>
              </SoftCard>
            )
          })}
        </div>
      )}

      <p className="mt-4 text-[12px] text-zinc-600">
        {t('datasets.symbolCount', {
          count: groups.length,
          suffix: groups.length === 1 ? '' : 's'
        })}{' '}
        ·{' '}
        <button
          type="button"
          onClick={() => void refreshImportedList()}
          className="underline decoration-zinc-700 underline-offset-2 hover:text-zinc-400"
        >
          {t('datasets.refresh')}
        </button>
      </p>

      <SymbolDatasetsDialog
        open={managing != null}
        symbol={managing?.symbol ?? ''}
        files={managing?.files ?? []}
        onClose={() => setManageKey(null)}
      />

      <SoftConfirmDialog
        open={pendingDelete != null}
        title={t('datasets.deleteTitle')}
        description={
          pendingDelete
            ? pendingDelete.ids.length === 1
              ? t('datasets.deleteOne', { symbol: pendingDelete.symbol })
              : t('datasets.deleteMany', {
                  count: pendingDelete.ids.length,
                  symbol: pendingDelete.symbol
                })
            : undefined
        }
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        busy={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setPendingDelete(null)
        }}
        onConfirm={() => {
          void confirmDeleteAll()
        }}
      />
    </section>
  )
}
