import { useMemo, type ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { contractSizeInfoForSymbol, formatContractSize } from '@shared/pricePrecision'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import { useReplayStore } from '@/store/replayStore'
import { useSymbolParamsStore } from '@/store/symbolParamsStore'
import ImportDataDialog from '@/components/ImportDataDialog'
import SoftButton from '@/components/ui/SoftButton'
import SoftCard from '@/components/ui/SoftCard'
import SoftEmpty from '@/components/ui/SoftEmpty'

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
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-medium text-zinc-400">Imported CSV files</h2>
        <ImportDataDialog />
      </div>

      {ordered.length === 0 ? (
        <SoftEmpty>No datasets yet — import a CSV to get started.</SoftEmpty>
      ) : (
        <div className="space-y-2.5">
          {ordered.map((meta) => {
            const spec = params[meta.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')]
            const contractSize =
              spec?.contractSize ??
              meta.contractSize ??
              contractSizeInfoForSymbol(meta.symbol).contractSize
            return (
              <SoftCard
                key={meta.id}
                elevated
                className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:border-white/10"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-zinc-100">
                    {meta.symbol}
                    <span className="ml-2 font-normal text-zinc-500">{meta.originalFileName}</span>
                  </div>
                  <div className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                    {meta.candleCount.toLocaleString()} × 1m · {formatUtcCandleTime(meta.firstTime)}{' '}
                    → {formatUtcCandleTime(meta.lastTime)} · contract {formatContractSize(contractSize)}
                  </div>
                </div>
                <SoftButton
                  size="sm"
                  variant="primary"
                  aria-label={`New session from ${meta.symbol}`}
                  onClick={() => onNewSession(meta.id)}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  New session
                </SoftButton>
                <SoftButton
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete dataset ${meta.symbol}`}
                  onClick={() => {
                    void window.api.deleteImport(meta.id).then(() => refreshImportedList())
                  }}
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
