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
  contractSizeUnitLabel,
  formatContractSize,
  normalizeSymbolKey,
  resolvePricePrecision
} from '@shared/pricePrecision'
import { quoteCurrencyForSymbol } from '@shared/pnlCurrency'
import { coverageDaysFromMetas } from '@shared/dateCoverage'
import { SYMBOL_GROUPS, findGroupForSymbol, type SymbolGroup } from '@shared/symbols'
import { useReplayStore } from '@/store/replayStore'
import { useSymbolParamsStore } from '@/store/symbolParamsStore'
import SoftCard from '@/components/ui/SoftCard'
import SoftEmpty from '@/components/ui/SoftEmpty'
import { SoftInput } from '@/components/ui/SoftInput'
import { cn } from '@/components/ui/cn'
import { softMotion, softNav, softType } from '@/components/ui/softTokens'
import { useT } from '@/i18n/useT'

type SymbolRow = {
  symbol: string
  label: string
  coverageDays: number
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
  const { t } = useT()
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
      aria-label={t('symbols.categoriesAria')}
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
  const { t } = useT()
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
    const metasBySymbol = new Map<string, { symbol: string; metas: typeof imports }>()
    for (const meta of imports) {
      const key = normalizeSymbolKey(meta.symbol)
      if (!key) continue
      const entry = metasBySymbol.get(key) ?? { symbol: meta.symbol, metas: [] }
      entry.metas.push(meta)
      metasBySymbol.set(key, entry)
    }
    const bySymbol = new Map<string, { symbol: string; coverageDays: number }>()
    for (const [key, entry] of metasBySymbol) {
      bySymbol.set(key, {
        symbol: entry.symbol,
        coverageDays: coverageDaysFromMetas(entry.metas).size
      })
    }
    return bySymbol
  }, [imports])

  const visibleGroups = useMemo(() => {
    const hasOther = [...importStats.keys()].some((key) => findGroupForSymbol(key) == null)
    const catKey = (key: string): 'symbols.cat.forex' | 'symbols.cat.metals' | 'symbols.cat.indices' | 'symbols.cat.energy' | 'symbols.cat.other' => {
      if (key === 'metals') return 'symbols.cat.metals'
      if (key === 'indices') return 'symbols.cat.indices'
      if (key === 'energy') return 'symbols.cat.energy'
      if (key === 'other') return 'symbols.cat.other'
      return 'symbols.cat.forex'
    }
    return SYMBOL_GROUPS.filter((g) => g.key !== 'other' || hasOther).map((g) => ({
      ...g,
      label: t(catKey(g.key))
    }))
  }, [importStats, t])

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
          coverageDays: stats.coverageDays,
          hasData: stats.coverageDays > 0
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
        coverageDays: stats?.coverageDays ?? 0,
        hasData: (stats?.coverageDays ?? 0) > 0
      }
    })
  }, [activeKey, importStats])

  return (
    <section className="space-y-6">
      <div>
        <h2 className={softType.section}>{t('symbols.title')}</h2>
        <p className={cn('mt-2 max-w-3xl', softType.bodyMuted)}>{t('symbols.subtitle')}</p>
      </div>

      <CategoryTabList groups={visibleGroups} activeKey={activeKey} onChange={setActiveKey} />

      {rows.length === 0 ? (
        <SoftEmpty>
          {activeKey === 'other'
            ? t('symbols.emptyOther')
            : t('symbols.emptyCategory')}
        </SoftEmpty>
      ) : (
        <div className="symbols-list-container">
          <div className="symbols-list-grid">
            {rows.map((row) => {
              const key = normalizeSymbolKey(row.symbol)
              const spec = params[key] ?? {}
              const info = contractSizeInfoForSymbol(row.symbol)
              const userSize = spec.contractSize
              const effective = userSize ?? info.contractSize
              const quote = quoteCurrencyForSymbol(row.symbol)
              const precision = spec.precision ?? resolvePricePrecision(row.symbol)
              const daysPart = row.hasData
                ? row.coverageDays === 1
                  ? t('symbols.dayOne')
                  : t('symbols.days', { count: row.coverageDays.toLocaleString() })
                : t('symbols.noData')
              const metaText = `${quote} · p${precision} · ${daysPart}`
              // Soft Tooltip is single-line; native title carries a structured multiline tip.
              const metaTip = [
                metaText,
                t('symbols.metaTipQuote', { quote }),
                t('symbols.metaTipPrecision', { precision }),
                row.hasData
                  ? t('symbols.metaTipCoverage', { days: daysPart })
                  : t('symbols.metaTipNoData')
              ].join('\n')
              const lotUnit = contractSizeUnitLabel(row.symbol)
              const lotLabel = t('symbols.lotEquals', {
                size: formatContractSize(effective),
                unit: lotUnit
              })
              const emptyField =
                'border-dashed border-white/10 text-zinc-500 placeholder:text-zinc-600'
              const filledField = 'border-primary-500/35 text-zinc-100'
              return (
                <SoftCard
                  key={key}
                  elevated
                  className="grid min-w-0 items-center gap-x-2 overflow-hidden px-3 py-1.5 [grid-template-columns:max-content_minmax(calc(8ch+1.25rem),1fr)_max-content_max-content_max-content]"
                >
                  {/* Fixed ticker + meta; spacer ≥1 Contract width takes freed Spread/Comm width; all 3 inputs share 8ch. */}
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-[5rem] shrink-0 whitespace-nowrap text-body font-semibold text-zinc-50"
                      title={row.label !== row.symbol ? row.label : undefined}
                    >
                      {row.symbol}
                    </span>
                    <span
                      className="shrink-0 whitespace-nowrap text-left text-micro text-zinc-400"
                      title={metaTip}
                    >
                      {metaText}
                    </span>
                  </div>
                  <div className="min-w-0" aria-hidden="true" />
                  <label
                    className="flex shrink-0 items-center justify-start gap-1"
                    title={lotLabel}
                  >
                    <span className={cn('shrink-0', softType.micro)} title={lotLabel}>
                      {t('symbols.contract')}
                    </span>
                    <SoftInput
                      type="number"
                      min="0"
                      step="any"
                      placeholder={String(info.contractSize)}
                      aria-label={`Contract size for ${row.symbol}`}
                      title={lotLabel}
                      value={userSize ?? ''}
                      onChange={(event) => {
                        const text = event.target.value.trim()
                        setContractSize(row.symbol, text === '' ? null : Number(text))
                      }}
                      className={cn(
                        // Shared fixed width with Spread/Comm: 8ch + SoftInput px-2.5*2.
                        'h-8 w-[calc(8ch+1.25rem)] !min-w-[calc(8ch+1.25rem)] shrink-0 text-caption tabular-nums',
                        userSize != null ? filledField : emptyField
                      )}
                    />
                  </label>
                  <label className="flex shrink-0 items-center justify-start gap-1">
                    <span className={cn('shrink-0', softType.micro)}>{t('symbols.spread')}</span>
                    <SoftInput
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      aria-label={`Spread for ${row.symbol}`}
                      title={
                        spec.spread == null
                          ? 'Empty — no spread (0)'
                          : 'Full bid–ask width in price units'
                      }
                      value={spec.spread ?? ''}
                      onChange={(event) => {
                        const text = event.target.value.trim()
                        setSpread(row.symbol, text === '' ? null : Number(text))
                      }}
                      className={cn(
                        'h-8 w-[calc(8ch+1.25rem)] !min-w-[calc(8ch+1.25rem)] shrink-0 text-caption tabular-nums',
                        spec.spread != null ? filledField : emptyField
                      )}
                    />
                  </label>
                  <label className="flex shrink-0 items-center justify-start gap-1">
                    <span className={cn('shrink-0', softType.micro)}>{t('symbols.comm')}</span>
                    <SoftInput
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      aria-label={`Commission per lot for ${row.symbol}`}
                      title={
                        spec.commissionPerLot == null
                          ? `Empty — no commission (0 ${quote})`
                          : `Round-turn commission in ${quote} per 1.0 lot`
                      }
                      value={spec.commissionPerLot ?? ''}
                      onChange={(event) => {
                        const text = event.target.value.trim()
                        setCommissionPerLot(row.symbol, text === '' ? null : Number(text))
                      }}
                      className={cn(
                        'h-8 w-[calc(8ch+1.25rem)] !min-w-[calc(8ch+1.25rem)] shrink-0 text-caption tabular-nums',
                        spec.commissionPerLot != null ? filledField : emptyField
                      )}
                    />
                  </label>
                </SoftCard>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
