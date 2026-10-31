import { useMemo, useState, type ReactNode } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { coverageSpanLabel, groupImportsBySymbol } from '@shared/dateCoverage'
import { useReplayStore } from '@/store/replayStore'
import ImportDataDialog from '@/components/ImportDataDialog'
import SymbolDatasetsDialog from '@/components/dashboard/SymbolDatasetsDialog'
import SoftButton from '@/components/ui/SoftButton'
import SoftCard from '@/components/ui/SoftCard'
import SoftEmpty from '@/components/ui/SoftEmpty'
import { softType } from '@/components/ui/softTokens'
import { cn } from '@/components/ui/cn'

/**
 * Datasets page — one SoftCard per SYMBOL that has ≥1 imported CSV.
 * Edit opens the manage drawer; trash deletes all files for that symbol.
 * New session lives on Testing, not here.
 */
export default function DatasetsTab(): ReactNode {
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

  async function deleteAllForSymbol(key: string, symbol: string, ids: string[]): Promise<void> {
    if (
      !window.confirm(
        `Delete all ${ids.length} file${ids.length === 1 ? '' : 's'} for ${symbol}? This cannot be undone.`
      )
    ) {
      return
    }
    for (const id of ids) {
      await window.api.deleteImport(id)
      if (importMeta?.id === id) clearImportedDataset()
    }
    await refreshImportedList()
    if (manageKey === key) setManageKey(null)
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className={cn(softType.section)}>Symbols with data</h2>
          <p className={cn('mt-1', softType.bodyMuted)}>
            One row per symbol. Edit to manage CSV files, coverage, and imports.
          </p>
        </div>
        <ImportDataDialog />
      </div>

      {groups.length === 0 ? (
        <SoftEmpty>
          No datasets yet — import a MT4/MT5 1-minute CSV. Catalog symbols without data stay on the
          Symbols page.
        </SoftEmpty>
      ) : (
        <div className="space-y-2.5">
          {groups.map((group) => {
            const span = coverageSpanLabel(group.coverageDays)
            const dayCount = group.coverageDays.size
            const daysLabel = `${dayCount.toLocaleString()} day${dayCount === 1 ? '' : 's'}`
            return (
              <SoftCard
                key={group.key}
                elevated
                className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:border-white/10"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-zinc-100">
                    {group.symbol}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="rounded-lg border border-white/[0.08] bg-zinc-950/50 px-2 py-0.5 text-[11px] text-zinc-400">
                      {group.fileCount} file{group.fileCount === 1 ? '' : 's'}
                    </span>
                    <span className="rounded-lg border border-white/[0.08] bg-zinc-950/50 px-2 py-0.5 text-[11px] text-zinc-400">
                      {daysLabel}
                    </span>
                    <span className="truncate text-[12px] text-zinc-500">{span}</span>
                  </div>
                </div>
                <SoftButton
                  size="sm"
                  variant="secondary"
                  aria-label={`Edit datasets for ${group.symbol}`}
                  onClick={() => setManageKey(group.key)}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Edit
                </SoftButton>
                <SoftButton
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete all files for ${group.symbol}`}
                  onClick={() =>
                    void deleteAllForSymbol(
                      group.key,
                      group.symbol,
                      group.files.map((f) => f.id)
                    )
                  }
                  className="!h-7 !w-7 !px-0 hover:text-red-300"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </SoftButton>
              </SoftCard>
            )
          })}
        </div>
      )}

      <p className="mt-4 text-[12px] text-zinc-600">
        {groups.length} symbol{groups.length === 1 ? '' : 's'} with data ·{' '}
        <button
          type="button"
          onClick={() => void refreshImportedList()}
          className="underline decoration-zinc-700 underline-offset-2 hover:text-zinc-400"
        >
          refresh
        </button>
      </p>

      <SymbolDatasetsDialog
        open={managing != null}
        symbol={managing?.symbol ?? ''}
        files={managing?.files ?? []}
        onClose={() => setManageKey(null)}
      />
    </section>
  )
}
