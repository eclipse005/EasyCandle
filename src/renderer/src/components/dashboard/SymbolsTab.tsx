import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import {
  contractSizeInfoForSymbol,
  formatContractSize,
  normalizeSymbolKey,
  resolvePricePrecision
} from '@shared/pricePrecision'
import { quoteCurrencyForSymbol } from '@shared/pnlCurrency'
import { SYMBOL_GROUPS, findGroupForSymbol, type SymbolGroup } from '@shared/symbols'
import { useReplayStore } from '@/store/replayStore'
import { useSymbolParamsStore } from '@/store/symbolParamsStore'
import SoftCard from '@/components/ui/SoftCard'
import SoftEmpty from '@/components/ui/SoftEmpty'
import { SoftInput } from '@/components/ui/SoftInput'
import { cn } from '@/components/ui/cn'
import { softMotion, softNav, softType } from '@/components/ui/softTokens'

type SymbolRow = {
  symbol: string
  label: string
  candleCount: number
  datasetCount: number
  hasData: boolean
}

function CategoryTabList({
  groups,
  activeKey,
  onChange
}: {
  groups: SymbolGroup[]
  activeKey: string
  onChange: (key: string) => void
}): ReactNode {
  const listRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [underline, setUnderline] = useState({ left: 0, width: 0, ready: false })

  const measure = useCallback(() => {
    const list = listRef.current
    const idx = groups.findIndex((g) => g.key === activeKey)
    const btn = btnRefs.current[idx]
    if (!list || !btn) return
    const listRect = list.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    setUnderline({
      left: btnRect.left - listRect.left + list.scrollLeft,
      width: btnRect.width,
      ready: true
    })
  }, [activeKey, groups])

  useLayoutEffect(() => {
    measure()
  }, [measure])

  useEffect(() => {
    const list = listRef.current
    if (!list || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(list)
    for (const btn of btnRefs.current) {
      if (btn) ro.observe(btn)
    }
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure, groups])

  return (
    <div
      ref={listRef}
      className="relative flex flex-wrap items-center gap-6 border-b border-white/[0.06]"
      role="tablist"
      aria-label="Symbol categories"
    >
      {groups.map((group, i) => {
        const active = group.key === activeKey
        return (
          <button
            key={group.key}
            ref={(el) => {
              btnRefs.current[i] = el
            }}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(group.key)}
            className={cn(
              'relative -mb-px pb-3',
              softMotion.colorsFast,
              softType.tab,
              active ? softNav.tabActive : softNav.tabIdle
            )}
          >
            {group.label}
          </button>
        )
      })}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-zinc-100',
          softMotion.underline,
          underline.ready ? 'opacity-100' : 'opacity-0'
        )}
        style={{ left: underline.left, width: underline.width }}
      />
    </div>
  )
}

/** Per-symbol parameter editor with category tabs (Forex / Metals / …). */
export default function SymbolsTab(): ReactNode {
  const imports = useReplayStore((s) => s.importedList)
  const params = useSymbolParamsStore((s) => s.params)
  const ensureCatalogDefaults = useSymbolParamsStore((s) => s.ensureCatalogDefaults)
  const setContractSize = useSymbolParamsStore((s) => s.setContractSize)
  const setSpread = useSymbolParamsStore((s) => s.setSpread)
  const setCommissionPerLot = useSymbolParamsStore((s) => s.setCommissionPerLot)

  useEffect(() => {
    ensureCatalogDefaults()
  }, [ensureCatalogDefaults])

  const importStats = useMemo(() => {
    const bySymbol = new Map<string, { candleCount: number; datasetCount: number; symbol: string }>()
    for (const meta of imports) {
      const key = normalizeSymbolKey(meta.symbol)
      if (!key) continue
      const entry = bySymbol.get(key) ?? {
        symbol: meta.symbol,
        candleCount: 0,
        datasetCount: 0
      }
      entry.candleCount += meta.candleCount
      entry.datasetCount += 1
      bySymbol.set(key, entry)
    }
    return bySymbol
  }, [imports])

  const visibleGroups = useMemo(() => {
    const hasOther = [...importStats.keys()].some((key) => findGroupForSymbol(key) == null)
    return SYMBOL_GROUPS.filter((g) => g.key !== 'other' || hasOther)
  }, [importStats])

  const [activeKey, setActiveKey] = useState(() => visibleGroups[0]?.key ?? 'forex')

  useEffect(() => {
    if (!visibleGroups.some((g) => g.key === activeKey)) {
      setActiveKey(visibleGroups[0]?.key ?? 'forex')
    }
  }, [visibleGroups, activeKey])

  const rows = useMemo((): SymbolRow[] => {
    if (activeKey === 'other') {
      const out: SymbolRow[] = []
      for (const [key, stats] of importStats) {
        if (findGroupForSymbol(key) != null) continue
        out.push({
          symbol: stats.symbol,
          label: stats.symbol,
          candleCount: stats.candleCount,
          datasetCount: stats.datasetCount,
          hasData: true
        })
      }
      return out.sort((a, b) => (a.symbol < b.symbol ? -1 : 1))
    }

    const group = SYMBOL_GROUPS.find((g) => g.key === activeKey)
    if (!group) return []
    return group.symbols.map((entry) => {
      const key = normalizeSymbolKey(entry.id)
      const stats = importStats.get(key)
      return {
        symbol: entry.id,
        label: entry.label,
        candleCount: stats?.candleCount ?? 0,
        datasetCount: stats?.datasetCount ?? 0,
        hasData: (stats?.datasetCount ?? 0) > 0
      }
    })
  }, [activeKey, importStats])

  return (
    <section className="space-y-6">
      <div>
        <h2 className={softType.section}>Per-symbol defaults</h2>
        <p className={cn('mt-2 max-w-3xl', softType.bodyMuted)}>
          Contract size is units per 1.0 lot. Spread (full bid–ask in price) and round-turn commission
          per lot apply to paper fills. Explicit values always win over name-derived defaults.
        </p>
      </div>

      <CategoryTabList groups={visibleGroups} activeKey={activeKey} onChange={setActiveKey} />

      {rows.length === 0 ? (
        <SoftEmpty>
          {activeKey === 'other'
            ? 'No non-catalog imports yet.'
            : 'No symbols in this category.'}
        </SoftEmpty>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const key = normalizeSymbolKey(row.symbol)
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
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5"
              >
                <div className="min-w-0 flex-1 basis-40">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="truncate text-body font-semibold text-zinc-50">{row.label}</span>
                    <span className={cn('truncate', softType.micro)}>
                      {row.hasData
                        ? `${row.datasetCount} file${row.datasetCount === 1 ? '' : 's'} · ${row.candleCount.toLocaleString()} · ${quote} · p${precision}`
                        : `No data · ${quote} · p${precision}`}
                    </span>
                  </div>
                </div>
                <label className="flex items-center gap-2">
                  <span className={cn('w-14 shrink-0 text-right', softType.micro)}>Contract</span>
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
                      'h-9 w-24 text-caption tabular-nums',
                      userSize != null ? 'border-primary-500/35' : undefined
                    )}
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className={cn('w-12 shrink-0 text-right', softType.micro)}>Spread</span>
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
                      'h-9 w-20 text-caption tabular-nums',
                      spec.spread != null ? 'border-primary-500/35' : undefined
                    )}
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className={cn('w-14 shrink-0 text-right', softType.micro)}>Comm/lot</span>
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
                      'h-9 w-20 text-caption tabular-nums',
                      spec.commissionPerLot != null ? 'border-primary-500/35' : undefined
                    )}
                  />
                </label>
                <span className={cn('w-32 shrink-0 text-right tabular-nums', softType.micro)}>
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
