import { useMemo, type ReactNode } from 'react'
import {
  contractSizeInfoForSymbol,
  formatContractSize,
  resolvePricePrecision
} from '@shared/pricePrecision'
import { quoteCurrencyForSymbol } from '@shared/pnlCurrency'
import { useReplayStore } from '@/store/replayStore'
import { useSymbolParamsStore } from '@/store/symbolParamsStore'

/** Per-symbol parameter editor: contract size and precision overrides. */
export default function SymbolsTab(): ReactNode {
  const imports = useReplayStore((s) => s.importedList)
  const params = useSymbolParamsStore((s) => s.params)
  const setContractSize = useSymbolParamsStore((s) => s.setContractSize)

  // One row per symbol, derived from the imported datasets (deduped).
  const rows = useMemo(() => {
    const bySymbol = new Map<string, { symbol: string; candleCount: number; datasetCount: number }>()
    for (const meta of imports) {
      const key = meta.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
      const entry = bySymbol.get(key) ?? { symbol: meta.symbol, candleCount: 0, datasetCount: 0 }
      entry.candleCount += meta.candleCount
      entry.datasetCount += 1
      bySymbol.set(key, entry)
    }
    return [...bySymbol.values()].sort((a, b) => (a.symbol < b.symbol ? -1 : 1))
  }, [imports])

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-zinc-100">Symbol parameters</h2>
      <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
        Contract size is units per 1.0 lot and is broker-specific — the default is inferred from
        the symbol name, but your explicit value always wins (P/L, balances, risk sizing).
      </p>

      {rows.length === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-6 text-center text-xs text-zinc-500">
          Import a dataset to manage its symbol parameters.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const key = row.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
            const spec = params[key] ?? {}
            const info = contractSizeInfoForSymbol(row.symbol)
            const userSize = spec.contractSize
            const effective = userSize ?? info.contractSize
            const quote = quoteCurrencyForSymbol(row.symbol)
            const precision = spec.precision ?? resolvePricePrecision(row.symbol)
            return (
              <div
                key={key}
                className="flex flex-wrap items-center gap-3 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-zinc-100">{row.symbol}</div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">
                    {row.datasetCount} dataset{row.datasetCount === 1 ? '' : 's'} ·{' '}
                    {row.candleCount.toLocaleString()} candles · quote {quote} · precision{' '}
                    {precision}
                  </div>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-[11px] text-zinc-500">
                  Contract size
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder={String(info.contractSize)}
                    aria-label={`Contract size for ${row.symbol}`}
                    value={userSize ?? ''}
                    onChange={(event) => {
                      const text = event.target.value.trim()
                      setContractSize(row.symbol, text === '' ? null : Number(text))
                    }}
                    className={`h-8 w-28 rounded border bg-zinc-900 px-2 font-medium tabular-nums text-zinc-100 outline-none focus:border-amber-500/60 ${
                      userSize != null ? 'border-amber-500/40' : 'border-zinc-700'
                    }`}
                  />
                </label>
                <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-zinc-500">
                  1 lot = {formatContractSize(effective)} {quote}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
