import { useMemo, type ReactNode } from 'react'
import {
  contractSizeInfoForSymbol,
  formatContractSize,
  resolvePricePrecision
} from '@shared/pricePrecision'
import { quoteCurrencyForSymbol } from '@shared/pnlCurrency'
import { useReplayStore } from '@/store/replayStore'
import { useSymbolParamsStore } from '@/store/symbolParamsStore'
import SoftCard from '@/components/ui/SoftCard'
import SoftEmpty from '@/components/ui/SoftEmpty'
import { SoftInput } from '@/components/ui/SoftInput'
import { cn } from '@/components/ui/cn'
import { softSpace, softType } from '@/components/ui/softTokens'

/** Per-symbol parameter editor: contract size, spread, commission, precision. */
export default function SymbolsTab(): ReactNode {
  const imports = useReplayStore((s) => s.importedList)
  const params = useSymbolParamsStore((s) => s.params)
  const setContractSize = useSymbolParamsStore((s) => s.setContractSize)
  const setSpread = useSymbolParamsStore((s) => s.setSpread)
  const setCommissionPerLot = useSymbolParamsStore((s) => s.setCommissionPerLot)

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
    <section className={softSpace.sectionGap}>
      <div>
        <h2 className={softType.section}>Per-symbol defaults</h2>
        <p className={cn('mt-2 max-w-3xl', softType.bodyMuted)}>
          Contract size is units per 1.0 lot. Spread (full bid–ask in price) and round-turn commission
          per lot apply to paper fills. Explicit values always win over name-derived defaults.
        </p>
      </div>

      {rows.length === 0 ? (
        <SoftEmpty>Import a dataset to manage its symbol parameters.</SoftEmpty>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => {
            const key = row.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
            const spec = params[key] ?? {}
            const info = contractSizeInfoForSymbol(row.symbol)
            const userSize = spec.contractSize
            const effective = userSize ?? info.contractSize
            const quote = quoteCurrencyForSymbol(row.symbol)
            const precision = spec.precision ?? resolvePricePrecision(row.symbol)
            return (
              <SoftCard
                key={key}
                elevated
                className={cn(softSpace.cardPadSm, 'flex flex-wrap items-end gap-4')}
              >
                <div className="min-w-0 flex-1 basis-48">
                  <div className={cn(softType.cardTitle, 'truncate text-zinc-50')}>{row.symbol}</div>
                  <div className={cn('mt-1.5', softType.caption)}>
                    {row.datasetCount} dataset{row.datasetCount === 1 ? '' : 's'} ·{' '}
                    {row.candleCount.toLocaleString()} candles · quote {quote} · precision{' '}
                    {precision}
                  </div>
                </div>
                <label className="flex min-w-[8rem] flex-col gap-1.5">
                  <span className={softType.caption}>Contract</span>
                  <SoftInput
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
                    className={cn(
                      'h-11 w-28 text-body tabular-nums',
                      userSize != null ? 'border-primary-500/35' : undefined
                    )}
                  />
                </label>
                <label className="flex min-w-[8rem] flex-col gap-1.5">
                  <span className={softType.caption}>Spread</span>
                  <SoftInput
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
                    className={cn(
                      'h-11 w-28 text-body tabular-nums',
                      spec.spread != null ? 'border-primary-500/35' : undefined
                    )}
                  />
                </label>
                <label className="flex min-w-[8rem] flex-col gap-1.5">
                  <span className={softType.caption}>Comm/lot</span>
                  <SoftInput
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
                    className={cn(
                      'h-11 w-28 text-body tabular-nums',
                      spec.commissionPerLot != null ? 'border-primary-500/35' : undefined
                    )}
                  />
                </label>
                <span className={cn('w-36 shrink-0 pb-2.5 text-right tabular-nums', softType.caption)}>
                  1 lot = {formatContractSize(effective)} {quote}
                </span>
              </SoftCard>
            )
          })}
        </div>
      )}
    </section>
  )
}
