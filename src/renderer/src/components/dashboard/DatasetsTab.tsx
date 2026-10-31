import { useMemo, type ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { contractSizeInfoForSymbol, formatContractSize } from '@shared/pricePrecision'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import { useReplayStore } from '@/store/replayStore'
import { useSymbolParamsStore } from '@/store/symbolParamsStore'
import ImportDataDialog from '@/components/ImportDataDialog'

export default function DatasetsTab({
  onNewSession
}: {
  onNewSession: (datasetId: string) => void
}): ReactNode {
  const imports = useReplayStore((s) => s.importedList)
  const refreshImportedList = useReplayStore((s) => s.refreshImportedList)
  const params = useSymbolParamsStore((s) => s.params)

  const ordered = useMemo(
    () => [...imports].sort((a, b) => (a.symbol < b.symbol ? -1 : 1)),
    [imports]
  )

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">Imported datasets</h2>
        <ImportDataDialog />
      </div>

      {ordered.length === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-6 text-center text-xs text-zinc-500">
          No datasets yet — import a CSV to get started.
        </p>
      ) : (
        <div className="space-y-2">
          {ordered.map((meta) => {
            const spec = params[meta.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')]
            const contractSize = spec?.contractSize ?? meta.contractSize ?? contractSizeInfoForSymbol(meta.symbol).contractSize
            return (
              <div
                key={meta.id}
                className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-zinc-100">
                    {meta.symbol}
                    <span className="ml-2 font-normal text-zinc-500">{meta.originalFileName}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">
                    {meta.candleCount.toLocaleString()} × 1m ·{' '}
                    {formatUtcCandleTime(meta.firstTime)} → {formatUtcCandleTime(meta.lastTime)} ·{' '}
                    contract {formatContractSize(contractSize)}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`New session from ${meta.symbol}`}
                  onClick={() => onNewSession(meta.id)}
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-zinc-700 px-2 text-[10px] font-semibold uppercase text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
                >
                  <Plus className="h-3 w-3" aria-hidden />
                  New session
                </button>
                <button
                  type="button"
                  aria-label={`Delete dataset ${meta.symbol}`}
                  onClick={() => {
                    void window.api.deleteImport(meta.id).then(() => refreshImportedList())
                  }}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <p className="mt-3 text-[11px] text-zinc-600">
        {ordered.length} dataset{ordered.length === 1 ? '' : 's'} ·{' '}
        <button
          type="button"
          onClick={() => void refreshImportedList()}
          className="underline decoration-zinc-700 underline-offset-2 hover:text-zinc-400"
        >
          refresh
        </button>
      </p>
    </section>
  )
}
