import { useMemo, type ReactNode } from 'react'
import {
  contractSizeInfoForSymbol,
  formatContractSize,
  resolvePricePrecision
} from '@shared/pricePrecision'
import { quoteCurrencyForSymbol } from '@shared/pnlCurrency'
import { useReplayStore } from '@/store/replayStore'
import { useSymbolParamsStore } from '@/store/symbolParamsStore'

/** Per-symbol parameter editor: contract size, spread, commission, precision. */
export default function SymbolsTab(): ReactNode {
  const imports = useReplayStore((s) => s.importedList)
  const params = useSymbolParamsStore((s) => s.params)
  const setContractSize = useSymbolParamsStore((s) => s.setContractSize)
  const setSpread = useSymbolParamsStore((s) => s.setSpread)
  const setCommissionPerLot = useSymbolParamsStore((s) => s.setCommissionPerLot)

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
        Contract size is units per 1.0 lot. Spread (full bid–ask in price) and round-turn commission
        per lot apply to paper fills. Explicit values always win over name-derived defaults.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-white/5 bg-zinc-900/40 px-3 py-8 text-center text-xs text-zinc-500">
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
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-zinc-900/50 px-3.5 py-3 shadow-lg shadow-black/20"
              >
                <div className="min-w-0 flex-1 basis-40">
                  <div className="text-xs font-semibold text-zinc-100">{row.symbol}</div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">
                    {row.datasetCount} dataset{row.datasetCount === 1 ? '' : 's'} ·{' '}
                    {row.candleCount.toLocaleString()} candles · quote {quote} · precision{' '}
                    {precision}
                  </div>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-[11px] text-zinc-500">
                  Contract
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
                    className={`h-8 w-24 rounded-xl border bg-zinc-900 px-2 font-medium tabular-nums text-zinc-100 outline-none focus:border-primary-500/50 ${
                      userSize != null ? 'border-primary-500/40' : 'border-zinc-800'
                    }`}
                  />
                </label>
                <label className="flex shrink-0 items-center gap-2 text-[11px] text-zinc-500">
                  Spread
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    aria-label={`Spread for ${row.symbol}`}
                    title="Full bid–ask width in price units"
                    value={spec.spread ?? ''}
                    onChange={(event) => {
                      const text = event.target.value.trim()
                      setSpread(row.symbol, text === '' ? null : Number(text))
                    }}
                    className={`h-8 w-24 rounded-xl border bg-zinc-900 px-2 font-medium tabular-nums text-zinc-100 outline-none focus:border-primary-500/50 ${
                      spec.spread != null ? 'border-primary-500/40' : 'border-zinc-800'
                    }`}
                  />
                </label>
                <label className="flex shrink-0 items-center gap-2 text-[11px] text-zinc-500">
                  Comm/lot
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    aria-label={`Commission per lot for ${row.symbol}`}
                    title={`Round-turn commission in ${quote} per 1.0 lot`}
                    value={spec.commissionPerLot ?? ''}
                    onChange={(event) => {
                      const text = event.target.value.trim()
                      setCommissionPerLot(row.symbol, text === '' ? null : Number(text))
                    }}
                    className={`h-8 w-24 rounded-xl border bg-zinc-900 px-2 font-medium tabular-nums text-zinc-100 outline-none focus:border-primary-500/50 ${
                      spec.commissionPerLot != null ? 'border-primary-500/40' : 'border-zinc-800'
                    }`}
                  />
                </label>
                <span className="w-28 shrink-0 text-right text-[11px] tabular-nums text-zinc-500">
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
