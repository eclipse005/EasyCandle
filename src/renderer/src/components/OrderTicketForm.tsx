import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import LevelPriceControl, { parseLevelPrice } from '@/components/LevelPriceControl'
import RiskRewardControl from '@/components/RiskRewardControl'
import Tooltip from '@/components/Tooltip'
import TradeSizeControl from '@/components/TradeSizeControl'
import {
  canPlaceTicketSide,
  clampRiskPercent,
  DEFAULT_RISK_PERCENT,
  formatRiskReward,
  isPendingTicketType,
  lotsFromRiskPercent,
  pnlForSide,
  pnlScaleForSymbol,
  realizedRiskReward,
  ticketEntryPrice,
  type TicketOrderType
} from '@/lib/paperTrade'
import { usePricePrecision } from '@/hooks/usePricePrecision'
import { accountPnlFromQuote, formatUsdBalance } from '@shared/pnlCurrency'
import { accountPnlValue, formatAccountValue } from '@/lib/accountPnl'
import { contractSizeForSymbol, formatAssetPrice, tradeSizeKindForSymbol } from '@shared/pricePrecision'
import { useReplayStore, selectPriceFollowCandle } from '@/store/replayStore'
import { useSessionStore } from '@/store/sessionStore'
import { useSymbolParamsStore } from '@/store/symbolParamsStore'
import { useT } from '@/i18n/useT'

export type { TicketOrderType }

type OrderTicketFormProps = {
  compact?: boolean
}

type TicketSide = 'long' | 'short'
type RiskBasis = 'initial' | 'current'

const RISK_CHIPS = [0.5, 1, 2, 3, 5] as const

export default function OrderTicketForm({ compact: _compact = false }: OrderTicketFormProps) {
  const { t } = useT()
  const orderTypes: { id: TicketOrderType; label: string }[] = [
    { id: 'market', label: t('ticket.market') },
    { id: 'limit', label: t('ticket.limit') },
    { id: 'stopLimit', label: t('ticket.stop') }
  ]
  const limitInputRef = useRef<HTMLInputElement>(null)
  const tpInputRef = useRef<HTMLInputElement>(null)
  const slInputRef = useRef<HTMLInputElement>(null)

  const replayStatus = useReplayStore((s) => s.replayStatus)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const currentCandle = useReplayStore(selectPriceFollowCandle)
  const paperBuy = useReplayStore((s) => s.paperBuy)
  const paperSell = useReplayStore((s) => s.paperSell)
  const placeLimit = useReplayStore((s) => s.placeLimit)
  const ticketTakeProfit = useReplayStore((s) => s.ticketTakeProfit)
  const ticketStopLoss = useReplayStore((s) => s.ticketStopLoss)
  const ticketLimitPrice = useReplayStore((s) => s.ticketLimitPrice)
  const setTicketTakeProfit = useReplayStore((s) => s.setTicketTakeProfit)
  const setTicketStopLoss = useReplayStore((s) => s.setTicketStopLoss)
  const setTicketLimitPrice = useReplayStore((s) => s.setTicketLimitPrice)
  const ticketOrderType = useReplayStore((s) => s.ticketOrderType)
  const setTicketOrderType = useReplayStore((s) => s.setTicketOrderType)
  const pricePick = useReplayStore((s) => s.pricePick)
  const setPricePick = useReplayStore((s) => s.setPricePick)
  const tradeSize = useReplayStore((s) => s.tradeSize)
  const setTradeSize = useReplayStore((s) => s.setTradeSize)
  const symbol = useReplayStore((s) => s.symbol)
  const importMeta = useReplayStore((s) => s.importMeta)
  const closedTrades = useReplayStore((s) => s.closedTrades)
  const pricePrecision = usePricePrecision()
  const activeSession = useSessionStore((s) =>
    s.activeSessionId ? (s.sessions.find((x) => x.id === s.activeSessionId) ?? null) : null
  )

  const [side, setSide] = useState<TicketSide>('long')
  const [riskBasis, setRiskBasis] = useState<RiskBasis>('initial')
  const [riskPercent, setRiskPercent] = useState(DEFAULT_RISK_PERCENT)

  const busy = replayLoading || replayStatus === 'ended' || !currentCandle
  const mark = currentCandle?.close
  const orderType = ticketOrderType
  const canSubmit = !busy
  const sizeValue = tradeSize
  const limitPrice = ticketLimitPrice
  const tpValue = ticketTakeProfit
  const slValue = ticketStopLoss
  const ticketLevels = {
    orderType,
    markPrice: mark,
    limitPrice,
    takeProfit: tpValue,
    stopLoss: slValue
  }
  const canBuy = canSubmit && canPlaceTicketSide('long', ticketLevels)
  const canSell = canSubmit && canPlaceTicketSide('short', ticketLevels)
  const canPlace = side === 'long' ? canBuy : canSell

  const startingBalance = activeSession?.startingBalance ?? 100000
  const realizedUsd = closedTrades.reduce<number | null>((sum, trade) => {
    if (sum == null) return null
    const usd = accountPnlFromQuote(trade.pnl, symbol, trade.exitPrice)
    return usd == null ? null : sum + usd
  }, 0)
  const currentBalance = realizedUsd == null ? null : startingBalance + realizedUsd
  const balanceForRisk =
    riskBasis === 'initial' || currentBalance == null ? startingBalance : currentBalance

  const entry = ticketEntryPrice(ticketLevels)
  const scale = pnlScaleForSymbol(symbol, sizeValue, importMeta?.contractSize)
  const estLoss =
    entry != null && slValue != null && Number.isFinite(slValue)
      ? pnlForSide(side, entry, slValue, scale)
      : null
  const estProfit =
    entry != null && tpValue != null && Number.isFinite(tpValue)
      ? pnlForSide(side, entry, tpValue, scale)
      : null
  const signedLoss = estLoss == null ? null : estLoss <= 0 ? estLoss : -Math.abs(estLoss)
  const accountLoss = accountPnlValue(signedLoss, symbol, mark)
  const accountProfit = accountPnlValue(estProfit, symbol, mark)
  const estRr =
    entry != null ? realizedRiskReward(side, entry, slValue, tpValue) : null

  // Clear chart pick when order type no longer needs an entry price.
  useEffect(() => {
    if (!isPendingTicketType(orderType) && pricePick === 'limit') {
      setPricePick(null)
    }
  }, [orderType, pricePick, setPricePick])

  function readLevel(input: HTMLInputElement | null, fallback: number | null): number | null {
    const parsed = parseLevelPrice(input?.value ?? '')
    if (parsed === undefined) return fallback
    return parsed
  }

  function onTpChange(value: number | null): void {
    setTicketTakeProfit(value, { linkRr: true })
  }

  function onSlChange(value: number | null): void {
    setTicketStopLoss(value, { linkRr: true })
  }

  function onLimitChange(value: number | null): void {
    setTicketLimitPrice(value)
  }

  function applyRiskSize(percent: number, stopLoss: number | null = slValue): void {
    const entryPrice = ticketEntryPrice({
      orderType,
      markPrice: mark,
      limitPrice,
      takeProfit: tpValue,
      stopLoss
    })
    if (entryPrice == null || stopLoss == null) return
    const params = useSymbolParamsStore.getState().paramsFor(symbol)
    const contract =
      params.contractSize ?? importMeta?.contractSize ?? contractSizeForSymbol(symbol)
    const sized = lotsFromRiskPercent({
      balance: balanceForRisk,
      riskPercent: percent,
      entryPrice,
      stopLoss,
      contractSize: contract,
      kind: tradeSizeKindForSymbol(symbol)
    })
    if (sized != null) setTradeSize(sized)
  }

  function onRiskChip(percent: number): void {
    const next = clampRiskPercent(percent)
    setRiskPercent(next)
    applyRiskSize(next)
  }

  function submit(): void {
    if (!canPlace) return
    if (pricePick) setPricePick(null)
    const tp = readLevel(tpInputRef.current, tpValue)
    const sl = readLevel(slInputRef.current, slValue)
    setTicketTakeProfit(tp)
    setTicketStopLoss(sl)
    if (isPendingTicketType(orderType)) {
      const price = readLevel(limitInputRef.current, limitPrice)
      setTicketLimitPrice(price)
      placeLimit(side, price ?? Number.NaN, orderType)
    } else if (side === 'long') {
      paperBuy()
    } else {
      paperSell()
    }
  }

  const segmentClass = (active: boolean, tone: 'neutral' | 'buy' | 'sell' = 'neutral') => {
    if (!active) {
      return 'flex-1 rounded px-2 py-1.5 text-xs font-semibold transition-colors text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200'
    }
    if (tone === 'buy') {
      return 'flex-1 rounded px-2 py-1.5 text-xs font-semibold transition-colors bg-primary-500 text-white'
    }
    if (tone === 'sell') {
      return 'flex-1 rounded px-2 py-1.5 text-xs font-semibold transition-colors bg-red-400 text-white'
    }
    return 'flex-1 rounded px-2 py-1.5 text-xs font-semibold transition-colors bg-zinc-800 text-zinc-100'
  }

  function onFormKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return
    if (!canPlace) return
    event.preventDefault()
    submit()
  }

  const placeTooltip = !canPlace
    ? !canSubmit
      ? t('ticket.waitingPrice')
      : isPendingTicketType(orderType) && limitPrice == null
        ? t('ticket.pickEntry')
        : side === 'long'
          ? orderType === 'stopLimit'
            ? t('ticket.buyStopHint')
            : orderType === 'limit'
              ? t('ticket.buyLimitHint')
              : t('ticket.longTpSlBad')
          : orderType === 'stopLimit'
            ? t('ticket.sellStopHint')
            : orderType === 'limit'
              ? t('ticket.sellLimitHint')
              : t('ticket.shortTpSlBad')
    : side === 'long'
      ? orderType === 'stopLimit'
        ? t('ticket.placeBuyStop')
        : orderType === 'limit'
          ? t('ticket.placeBuyLimit')
          : t('ticket.placeBuy')
      : orderType === 'stopLimit'
        ? t('ticket.placeSellStop')
        : orderType === 'limit'
          ? t('ticket.placeSellLimit')
          : t('ticket.placeSell')

  const showEst = estLoss != null || estProfit != null || estRr != null

  return (
    <div className="flex flex-col gap-3" onKeyDown={onFormKeyDown}>
      {/* 1. Sell | Buy */}
      <div
        role="group"
        aria-label={t('ticket.sideAria')}
        className="flex rounded-xl border border-white/[0.08] bg-zinc-950/40 p-0.5"
      >
        <button
          type="button"
          aria-pressed={side === 'short'}
          className={segmentClass(side === 'short', 'sell')}
          onClick={() => setSide('short')}
        >
          {t('ticket.sell')}
        </button>
        <button
          type="button"
          aria-pressed={side === 'long'}
          className={segmentClass(side === 'long', 'buy')}
          onClick={() => setSide('long')}
        >
          {t('ticket.buy')}
        </button>
      </div>

      {/* 2. Risk basis */}
      <div
        className="flex flex-wrap items-center gap-3 px-0.5"
        role="radiogroup"
        aria-label={t('ticket.riskBasis')}
      >
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-400">
          <input
            type="radio"
            name="risk-basis"
            className="accent-primary-500"
            checked={riskBasis === 'initial'}
            onChange={() => setRiskBasis('initial')}
          />
          {t('ticket.initialBalance')}
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-400">
          <input
            type="radio"
            name="risk-basis"
            className="accent-primary-500"
            checked={riskBasis === 'current'}
            onChange={() => setRiskBasis('current')}
          />
          {t('ticket.currentBalance')}
        </label>
      </div>

      {/* 3. Risk % chips */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[11px] font-medium text-zinc-400">
            {t('ticket.riskPercent')}
          </span>
          <span className="text-[10px] tabular-nums text-zinc-600">
            {t('ticket.riskPercentOf', {
              percent: riskPercent,
              balance: formatUsdBalance(balanceForRisk)
            })}
          </span>
        </div>
        <div className="flex gap-1" role="group" aria-label={t('ticket.riskPercent')}>
          {RISK_CHIPS.map((chip) => {
            const active = riskPercent === chip
            return (
              <button
                key={chip}
                type="button"
                disabled={busy}
                aria-pressed={active}
                title={t('ticket.riskHint', {
                  percent: chip,
                  basis:
                    riskBasis === 'initial'
                      ? t('ticket.basisInitial')
                      : t('ticket.basisCurrent')
                })}
                onClick={() => onRiskChip(chip)}
                className={`h-8 min-w-0 flex-1 rounded-xl border text-[11px] font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  active
                    ? 'border-primary-500/50 bg-primary-500/15 text-primary-200'
                    : 'border-white/10 text-zinc-400 hover:border-white/15 hover:bg-white/[0.03] hover:text-zinc-200'
                }`}
              >
                {chip}%
              </button>
            )
          })}
        </div>
      </div>

      {/* 4. Est. loss / profit / R:R */}
      {showEst ? (
        <div className="grid grid-cols-[minmax(0,4fr)_minmax(0,4fr)_minmax(0,2fr)] gap-1 rounded-xl border border-white/[0.06] bg-zinc-950/40 px-2.5 py-2 text-[11px]">
          <div className="min-w-0">
            <div className="text-zinc-500">{t('ticket.estLoss')}</div>
            <div
              className={`truncate font-semibold tabular-nums ${
                estLoss == null ? 'text-zinc-600' : 'text-red-400'
              }`}
            >
              {estLoss == null ? '—' : formatAccountValue(accountLoss)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-zinc-500">{t('ticket.estProfit')}</div>
            <div
              className={`truncate font-semibold tabular-nums ${
                estProfit == null ? 'text-zinc-600' : 'text-primary-300'
              }`}
            >
              {estProfit == null ? '—' : formatAccountValue(accountProfit)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-zinc-500">{t('ticket.rr')}</div>
            <div className="truncate font-semibold tabular-nums text-zinc-200">
              {estRr != null ? formatRiskReward(estRr) : '—'}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-zinc-950/30 px-2.5 py-2 text-[11px] text-zinc-500">
          {t('ticket.estHint')}
        </div>
      )}

      {/* 5. Market | Limit | Stop */}
      <div className="flex flex-col gap-1">
        <span className="px-0.5 text-[11px] font-medium text-zinc-400">
          {t('ticket.typeAria')}
        </span>
        <div
          role="group"
          aria-label={t('ticket.typeAria')}
          className="flex rounded-xl border border-white/[0.08] bg-zinc-950/40 p-0.5"
        >
          {orderTypes.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={orderType === item.id}
              className={segmentClass(orderType === item.id, 'neutral')}
              onClick={() => setTicketOrderType(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 6. Size, then entry price on its own row so 5-digit prices fit. */}
      <div className="flex flex-col gap-1.5">
        <TradeSizeControl value={sizeValue} symbol={symbol} disabled={busy} onChange={setTradeSize} />
        {isPendingTicketType(orderType) ? (
          <LevelPriceControl
            label={t('ticket.entry')}
            ariaLabel={
              orderType === 'stopLimit' ? t('ticket.stopPrice') : t('ticket.limitPrice')
            }
            title={
              orderType === 'stopLimit'
                ? t('ticket.stopPriceTip')
                : t('ticket.limitPriceTip')
            }
            value={limitPrice}
            precision={pricePrecision}
            disabled={busy}
            picking={pricePick === 'limit'}
            inputRef={limitInputRef}
            onChange={onLimitChange}
            onPickClick={() => setPricePick('limit')}
          />
        ) : (
          <div
            className="flex items-center gap-1 rounded-xl border border-white/10 bg-zinc-900/50 px-1.5 py-0.5"
            title={t('ticket.marketEntryHint')}
          >
            <span className="px-0.5 text-[11px] font-medium text-zinc-400">
              {t('ticket.entry')}
            </span>
            <span className="min-w-0 flex-1 text-center text-xs font-semibold tabular-nums text-zinc-300">
              {mark != null ? formatAssetPrice(mark, pricePrecision) : '—'}
            </span>
          </div>
        )}
      </div>

      {/* 7. SL / TP */}
      <LevelPriceControl
        label="SL"
        ariaLabel={t('ticket.stopLoss')}
        title={t('ticket.slTip')}
        value={slValue}
        precision={pricePrecision}
        disabled={busy}
        picking={pricePick === 'sl'}
        inputRef={slInputRef}
        onChange={onSlChange}
        onPickClick={() => setPricePick('sl')}
      />
      <LevelPriceControl
        label="TP"
        ariaLabel={t('ticket.takeProfit')}
        title={t('ticket.tpTip')}
        value={tpValue}
        precision={pricePrecision}
        disabled={busy}
        picking={pricePick === 'tp'}
        inputRef={tpInputRef}
        onChange={onTpChange}
        onPickClick={() => setPricePick('tp')}
      />

      <RiskRewardControl
        displayRr={estRr}
        manualLevels={slValue != null && tpValue != null}
      />

      {/* 8. Place order */}
      <Tooltip className="w-full" text={placeTooltip}>
        <button
          type="button"
          disabled={!canPlace}
          onClick={submit}
          className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary-500/95 text-sm font-semibold text-white shadow-sm shadow-primary-950/30 transition-colors enabled:hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('ticket.placeOrder')}
        </button>
      </Tooltip>

      {mark != null && !canPlace && canSubmit ? (
        <p className="text-[11px] leading-relaxed text-zinc-400">
          {ticketValidationHint(t, orderType, mark, ticketLevels, side)}
        </p>
      ) : null}
    </div>
  )
}

function ticketValidationHint(
  t: ReturnType<typeof useT>['t'],
  orderType: TicketOrderType,
  markPrice: number | null,
  levels: { takeProfit: number | null; stopLoss: number | null; limitPrice: number | null },
  side: TicketSide
): string {
  if (markPrice == null) return t('ticket.waitingPriceDot')
  const entry = isPendingTicketType(orderType) ? levels.limitPrice : markPrice
  if (entry == null || !Number.isFinite(entry)) {
    return isPendingTicketType(orderType)
      ? t('ticket.enterEntryFirst')
      : t('ticket.waitingPriceDot')
  }
  if (levels.takeProfit != null && levels.stopLoss != null) {
    return side === 'long' ? t('ticket.longNeedsLevels') : t('ticket.shortNeedsLevels')
  }
  if (levels.stopLoss != null) {
    const slAbove = levels.stopLoss > entry
    if (side === 'long' && slAbove) return t('ticket.slAbove')
    if (side === 'short' && !slAbove) return t('ticket.slBelow')
  }
  if (levels.takeProfit != null) {
    const tpAbove = levels.takeProfit > entry
    if (side === 'long' && !tpAbove) return t('ticket.tpBelow')
    if (side === 'short' && tpAbove) return t('ticket.tpAbove')
  }
  return t('ticket.cannotPlace')
}
