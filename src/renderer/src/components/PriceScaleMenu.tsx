import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownRight, ArrowUpRight, Minus, Plus } from 'lucide-react'
import { PriceScaleMode } from 'lightweight-charts'
import { formatTradeSizeForSymbol, pendingKindForEntry } from '@/lib/paperTrade'
import { formatPriceBarRatio } from '@/lib/priceScale'
import { roundPriceToPrecision } from '@shared/pricePrecision'
import { useT } from '@/i18n/useT'
import { useChartSettingsStore } from '@/store/chartSettingsStore'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

type PriceScaleMenuProps = {
  clientX: number
  clientY: number
  ratio: number | null
  onClose: () => void
}

function Item({
  label,
  checked,
  hint,
  onSelect
}: {
  label: string
  checked?: boolean
  hint?: string
  onSelect: () => void
}): ReactNode {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-200 transition-colors hover:bg-zinc-800"
    >
      <span className="w-3 shrink-0 text-[11px] text-primary-300">{checked ? '✓' : ''}</span>
      <span className="min-w-0 flex-1">{label}</span>
      {hint ? <span className="shrink-0 text-[10px] text-zinc-500">{hint}</span> : null}
    </button>
  )
}

function Heading({ children }: { children: string }): ReactNode {
  return (
    <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
      {children}
    </div>
  )
}

/**
 * Price-scale right-click menu (FX Replay + TradingView).
 * Portaled so the chart overflow does not clip it.
 */
export default function PriceScaleMenu({
  clientX,
  clientY,
  ratio,
  onClose
}: PriceScaleMenuProps): ReactNode {
  const { t } = useT()
  const rootRef = useRef<HTMLDivElement>(null)
  const priceScale = useChartSettingsStore((s) => s.priceScale)
  const setPriceScale = useChartSettingsStore((s) => s.setPriceScale)
  const resetPriceScale = useChartSettingsStore((s) => s.resetPriceScale)
  const setChartSettingsDialogOpen = useUiLayoutStore((s) => s.setChartSettingsDialogOpen)
  const [pos, setPos] = useState({ left: clientX, top: clientY })

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pad = 8
    let left = clientX
    let top = clientY
    if (left + rect.width > window.innerWidth - pad) left = clientX - rect.width
    if (left < pad) left = pad
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad)
    }
    setPos({ left, top })
  }, [clientX, clientY])

  useEffect(() => {
    function onPointerDown(event: PointerEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onClose()
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const ratioText = ratio != null ? formatPriceBarRatio(ratio) : ''
  const mode = priceScale.mode

  function setMode(next: PriceScaleMode): void {
    setPriceScale({ mode: next })
  }

  return createPortal(
    <div
      ref={rootRef}
      role="menu"
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-[80] max-h-[min(34rem,calc(100vh-1rem))] w-[17.5rem] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 py-1.5 shadow-xl shadow-black/40 backdrop-blur-sm"
    >
      <Item
        label={t('scale.reset')}
        hint="Alt+R"
        onSelect={() => {
          resetPriceScale()
        }}
      />
      <div className="my-1 h-px bg-zinc-800" />
      <Item
        label={t('scale.auto')}
        checked={priceScale.autoScale && !priceScale.lockToBarRatio}
        onSelect={() => setPriceScale({ autoScale: !priceScale.autoScale })}
      />
      <Item
        label={t('scale.lockRatio')}
        checked={priceScale.lockToBarRatio}
        hint={ratioText}
        onSelect={() => {
          if (priceScale.lockToBarRatio) {
            setPriceScale({ lockToBarRatio: false, autoScale: true })
            return
          }
          setPriceScale({
            lockToBarRatio: true,
            barRatio: ratio != null && ratio > 0 ? ratio : priceScale.barRatio
          })
        }}
      />
      <Item
        label={t('scale.scaleChartOnly')}
        checked={priceScale.scalePriceChartOnly}
        onSelect={() => setPriceScale({ scalePriceChartOnly: !priceScale.scalePriceChartOnly })}
      />
      <Item
        label={t('scale.invert')}
        checked={priceScale.invertScale}
        hint="Alt+I"
        onSelect={() => setPriceScale({ invertScale: !priceScale.invertScale })}
      />
      <div className="my-1 h-px bg-zinc-800" />
      <Item
        label={t('scale.regular')}
        checked={mode === PriceScaleMode.Normal}
        onSelect={() => setMode(PriceScaleMode.Normal)}
      />
      <Item
        label={t('scale.percent')}
        checked={mode === PriceScaleMode.Percentage}
        hint="Alt+P"
        onSelect={() => setMode(PriceScaleMode.Percentage)}
      />
      <Item
        label={t('scale.indexed')}
        checked={mode === PriceScaleMode.IndexedTo100}
        onSelect={() => setMode(PriceScaleMode.IndexedTo100)}
      />
      <Item
        label={t('scale.log')}
        checked={mode === PriceScaleMode.Logarithmic}
        hint="Alt+L"
        onSelect={() => setMode(PriceScaleMode.Logarithmic)}
      />
      <div className="my-1 h-px bg-zinc-800" />
      <Item
        label={t('scale.moveLeft')}
        checked={priceScale.scaleOnLeft}
        onSelect={() => setPriceScale({ scaleOnLeft: !priceScale.scaleOnLeft })}
      />
      <Heading>{t('scale.labels')}</Heading>
      <Item
        label={t('scale.noOverlap')}
        checked={priceScale.noOverlappingLabels}
        onSelect={() => setPriceScale({ noOverlappingLabels: !priceScale.noOverlappingLabels })}
      />
      <Item
        label={t('scale.countdown')}
        checked={priceScale.countdownToBarClose}
        onSelect={() => setPriceScale({ countdownToBarClose: !priceScale.countdownToBarClose })}
      />
      <Heading>{t('scale.lines')}</Heading>
      <Item
        label={t('scale.prevClose')}
        checked={priceScale.previousDayClose}
        onSelect={() => setPriceScale({ previousDayClose: !priceScale.previousDayClose })}
      />
      <Item
        label={t('scale.highLow')}
        checked={priceScale.highAndLow}
        onSelect={() => setPriceScale({ highAndLow: !priceScale.highAndLow })}
      />
      <div className="my-1 h-px bg-zinc-800" />
      <Item
        label={t('scale.plus')}
        checked={priceScale.plusButton}
        onSelect={() => setPriceScale({ plusButton: !priceScale.plusButton })}
      />
      <Item
        label={t('scale.more')}
        onSelect={() => {
          setChartSettingsDialogOpen(true, 'scales')
          onClose()
        }}
      />
    </div>,
    document.body
  )
}

type PriceScalePlusProps = {
  y: number
  price: number
  pricePrecision: number
  onLeft: boolean
}

/**
 * FXR-style + on the price scale. It follows the crosshair and opens quick
 * order actions plus a horizontal-line drawing at the hovered price.
 */
export function PriceScalePlus({
  y,
  price,
  pricePrecision,
  onLeft
}: PriceScalePlusProps): ReactNode {
  const { t } = useT()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const mode = useReplayStore((s) => s.mode)
  const tradeSize = useReplayStore((s) => s.tradeSize)
  const symbol = useReplayStore((s) => s.symbol)
  const currentClose = useReplayStore((s) => s.currentCandle?.close ?? null)
  const placeLimit = useReplayStore((s) => s.placeLimit)
  const paperBuy = useReplayStore((s) => s.paperBuy)
  const paperSell = useReplayStore((s) => s.paperSell)
  const addHorizontalLine = useReplayStore((s) => s.addHorizontalLine)
  const quotePrice = roundPriceToPrecision(price, pricePrecision)
  const priceText = quotePrice.toFixed(pricePrecision)
  const sizeText = formatTradeSizeForSymbol(tradeSize, symbol)
  const mark = currentClose
  const atMarket =
    mark != null &&
    Number.isFinite(mark) &&
    Math.abs(quotePrice - mark) < Math.pow(10, -(pricePrecision + 1))

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function place(side: 'buy' | 'sell'): void {
    if (mode !== 'replay') return
    if (atMarket) {
      if (side === 'buy') paperBuy()
      else paperSell()
      setOpen(false)
      return
    }
    const marketSide = side === 'buy' ? 'long' : 'short'
    const kind = pendingKindForEntry(marketSide, mark ?? quotePrice, quotePrice)
    if (!kind) return
    placeLimit(marketSide, quotePrice, kind)
    setOpen(false)
  }

  const above = mark != null && quotePrice > mark
  function kindWord(side: 'buy' | 'sell'): string {
    if (atMarket) return t('context.orderKind.market')
    const stop = above ? side === 'buy' : side !== 'buy'
    return t(stop ? 'context.orderKind.stop' : 'context.orderKind.limit')
  }

  // Sit in the gutter reserved at the outer edge of the price scale.
  const inset = 2
  const iconClass = 'h-3.5 w-3.5 shrink-0 text-zinc-400'
  const itemClass =
    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800'

  return (
    <div
      ref={rootRef}
      className="absolute z-[6]"
      style={{ top: y - 11, [onLeft ? 'left' : 'right']: inset }}
      onMouseDown={(event) => event.stopPropagation()}
      onMouseMove={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        aria-label={t('scale.plus')}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-[22px] w-[22px] items-center justify-center rounded-md text-white shadow-md shadow-black/30 transition-colors ${
          open ? 'bg-primary-400' : 'bg-primary-500 hover:bg-primary-400'
        }`}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
      {open ? (
        <div
          role="menu"
          className={`absolute top-0 z-[7] w-max min-w-[13rem] rounded-xl border border-white/10 bg-zinc-950/95 py-1 shadow-xl shadow-black/40 ${
            onLeft ? 'left-7' : 'right-7'
          }`}
        >
          {mode === 'replay' ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => place('buy')}
                className={itemClass}
              >
                <ArrowUpRight className={iconClass} />
                <span>
                  {t('context.orderBuy', {
                    size: sizeText,
                    price: priceText,
                    kind: kindWord('buy')
                  })}
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => place('sell')}
                className={itemClass}
              >
                <ArrowDownRight className={iconClass} />
                <span>
                  {t('context.orderSell', {
                    size: sizeText,
                    price: priceText,
                    kind: kindWord('sell')
                  })}
                </span>
              </button>
              <div className="my-1 h-px bg-white/10" />
            </>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              addHorizontalLine(quotePrice)
              setOpen(false)
            }}
            className={itemClass}
          >
            <Minus className={iconClass} />
            <span>{t('scale.drawHorizontal')}</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}
