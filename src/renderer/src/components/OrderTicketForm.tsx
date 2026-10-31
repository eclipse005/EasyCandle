import { useEffect, useRef, useState } from 'react'
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
import { formatPnlCcy, quoteCurrencyForSymbol } from '@shared/pnlCurrency'
import { contractSizeForSymbol, formatAssetPrice, tradeSizeKindForSymbol } from '@shared/pricePrecision'
import { useReplayStore, selectPriceFollowCandle } from '@/store/replayStore'
import { useSessionStore } from '@/store/sessionStore'
import { useSymbolParamsStore } from '@/store/symbolParamsStore'

export type { TicketOrderType }

type OrderTicketFormProps = {
  compact?: boolean
}

type TicketSide = 'long' | 'short'
type RiskBasis = 'initial' | 'current'

const RISK_CHIPS = [0.5, 1, 2, 3, 5] as const

const ORDER_TYPES: { id: TicketOrderType; label: string }[] = [
  { id: 'market', label: 'Market' },
  { id: 'limit', label: 'Limit' },
  { id: 'stopLimit', label: 'Stop' }
]

export default function OrderTicketForm({ compact: _compact = false }: OrderTicketFormProps) {
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
  const realized = closedTrades.reduce((sum, t) => sum + t.pnl, 0)
  const currentBalance = startingBalance + realized
  const balanceForRisk = riskBasis === 'initial' ? startingBalance : currentBalance
  const quoteCurrency = quoteCurrencyForSymbol(symbol)

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

  const placeTooltip = !canPlace
    ? !canSubmit
      ? 'Waiting for price data'
      : isPendingTicketType(orderType) && limitPrice == null
        ? 'Pick or type an entry price'
        : side === 'long'
          ? orderType === 'stopLimit'
            ? 'Buy Stop needs a price above market, with TP above and SL below entry'
            : orderType === 'limit'
              ? 'Buy Limit needs a price below market, with TP above and SL below entry'
              : 'TP/SL levels do not allow a long'
          : orderType === 'stopLimit'
            ? 'Sell Stop needs a price below market, with TP below and SL above entry'
            : orderType === 'limit'
              ? 'Sell Limit needs a price above market, with TP below and SL above entry'
              : 'TP/SL levels do not allow a short'
    : side === 'long'
      ? orderType === 'stopLimit'
        ? 'Place Buy Stop — wait for price to trade up to the stop'
        : orderType === 'limit'
          ? 'Place Buy Limit — wait for price to trade down to the limit'
          : 'Place Buy — open long at the current close'
      : orderType === 'stopLimit'
        ? 'Place Sell Stop — wait for price to trade down to the stop'
        : orderType === 'limit'
          ? 'Place Sell Limit — wait for price to trade up to the limit'
          : 'Place Sell — open short at the current close'

  const showEst = estLoss != null || estProfit != null || estRr != null

  return (
    <div className="flex flex-col gap-2.5">
      {/* 1. Sell | Buy */}
      <div
        role="group"
        aria-label="Order side"
        className="flex rounded-xl border border-white/10 bg-zinc-950/60 p-0.5"
      >
        <button
          type="button"
          aria-pressed={side === 'short'}
          className={segmentClass(side === 'short', 'sell')}
          onClick={() => setSide('short')}
        >
          Sell
        </button>
        <button
          type="button"
          aria-pressed={side === 'long'}
          className={segmentClass(side === 'long', 'buy')}
          onClick={() => setSide('long')}
        >
          Buy
        </button>
      </div>

      {/* 2. Risk basis */}
      <div className="flex flex-wrap items-center gap-3 px-0.5" role="radiogroup" aria-label="Risk basis">
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-400">
          <input
            type="radio"
            name="risk-basis"
            className="accent-primary-500"
            checked={riskBasis === 'initial'}
            onChange={() => setRiskBasis('initial')}
          />
          Initial balance
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-400">
          <input
            type="radio"
            name="risk-basis"
            className="accent-primary-500"
            checked={riskBasis === 'current'}
            onChange={() => setRiskBasis('current')}
          />
          Current balance
        </label>
      </div>

      {/* 3. Risk % chips */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
            Set risk percentage
          </span>
          <span className="text-[10px] tabular-nums text-zinc-600">
            {riskPercent}% of{' '}
            {balanceForRisk.toLocaleString('en-US', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            })}{' '}
            {quoteCurrency}
          </span>
        </div>
        <div className="flex gap-1" role="group" aria-label="Risk percent">
          {RISK_CHIPS.map((chip) => {
            const active = riskPercent === chip
            return (
              <button
                key={chip}
                type="button"
                disabled={busy}
                aria-pressed={active}
                title={
                  slValue == null
                    ? `Risk ${chip}% (set SL to auto-size)`
                    : `Risk ${chip}% of ${riskBasis} balance and size lots from SL`
                }
                onClick={() => onRiskChip(chip)}
                className={`h-7 min-w-0 flex-1 rounded-xl border text-[11px] font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  active
                    ? 'border-primary-500 bg-primary-950/40 text-primary-300'
                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
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
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-zinc-800 bg-zinc-950/50 px-2 py-1.5 text-[10px]">
          <div className="min-w-0">
            <div className="text-zinc-500">Est. loss</div>
            <div
              className={`truncate font-semibold tabular-nums ${
                estLoss == null ? 'text-zinc-600' : 'text-red-400'
              }`}
            >
              {estLoss == null
                ? '—'
                : formatPnlCcy(estLoss <= 0 ? estLoss : -Math.abs(estLoss), quoteCurrency)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-zinc-500">Est. profit</div>
            <div
              className={`truncate font-semibold tabular-nums ${
                estProfit == null ? 'text-zinc-600' : 'text-primary-300'
              }`}
            >
              {estProfit == null ? '—' : formatPnlCcy(estProfit, quoteCurrency)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-zinc-500">R:R</div>
            <div className="truncate font-semibold tabular-nums text-zinc-200">
              {estRr != null ? formatRiskReward(estRr) : '—'}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-2 py-1.5 text-[10px] text-zinc-600">
          Set SL / TP to see estimated loss, profit, and R:R.
        </div>
      )}

      {/* 5. Market | Limit | Stop */}
      <div className="flex flex-col gap-1">
        <span className="px-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
          Type
        </span>
        <div
          role="group"
          aria-label="Order type"
          className="flex rounded-xl border border-white/10 bg-zinc-950/60 p-0.5"
        >
          {ORDER_TYPES.map((item) => (
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

      {/* 6. Size + entry price */}
      <div className="grid grid-cols-2 gap-1.5">
        <TradeSizeControl value={sizeValue} symbol={symbol} disabled={busy} onChange={setTradeSize} />
        {isPendingTicketType(orderType) ? (
          <LevelPriceControl
            label="Entry"
            ariaLabel={orderType === 'stopLimit' ? 'Stop price' : 'Limit price'}
            title={
              orderType === 'stopLimit'
                ? 'Stop price. Type or pick from the chart. Buy Stop must be above market; Sell Stop must be below market.'
                : 'Limit price. Type or pick from the chart. Buy Limit must be below market; Sell Limit must be above market.'
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
            className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5"
            title="Market entry uses the current close"
          >
            <span className="px-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
              Entry
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
        ariaLabel="Stop loss"
        title="Stop loss price. Type to set, or use the crosshair to pick from the chart. Long SL is below entry, short SL is above. First fill seeds the other level at the R:R guide."
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
        ariaLabel="Take profit"
        title="Take profit price. Type to set, or use the crosshair to pick from the chart. Long TP is above entry, short TP is below. First fill seeds the other level at the R:R guide."
        value={tpValue}
        precision={pricePrecision}
        disabled={busy}
        picking={pricePick === 'tp'}
        inputRef={tpInputRef}
        onChange={onTpChange}
        onPickClick={() => setPricePick('tp')}
      />

      <RiskRewardControl />

      {/* 8. Place order */}
      <Tooltip className="w-full" text={placeTooltip}>
        <button
          type="button"
          disabled={!canPlace}
          onClick={submit}
          className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary-500 text-sm font-semibold text-white transition-colors enabled:hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Place order
        </button>
      </Tooltip>

      {mark != null && !canPlace && canSubmit ? (
        <p className="text-[10px] leading-relaxed text-amber-400/80">
          {ticketValidationHint(orderType, mark, ticketLevels, side)}
        </p>
      ) : null}
    </div>
  )
}

function ticketValidationHint(
  orderType: TicketOrderType,
  markPrice: number | null,
  levels: { takeProfit: number | null; stopLoss: number | null; limitPrice: number | null },
  side: TicketSide
): string {
  if (markPrice == null) return 'Waiting for price data.'
  const entry = isPendingTicketType(orderType) ? levels.limitPrice : markPrice
  if (entry == null || !Number.isFinite(entry)) {
    return isPendingTicketType(orderType) ? 'Enter an entry price first.' : 'Waiting for price data.'
  }
  if (levels.takeProfit != null && levels.stopLoss != null) {
    return side === 'long'
      ? 'Long needs TP above entry and SL below entry.'
      : 'Short needs TP below entry and SL above entry.'
  }
  if (levels.stopLoss != null) {
    const slAbove = levels.stopLoss > entry
    if (side === 'long' && slAbove) return 'SL is above entry — valid for Sell, not for Buy.'
    if (side === 'short' && !slAbove) return 'SL is below entry — valid for Buy, not for Sell.'
  }
  if (levels.takeProfit != null) {
    const tpAbove = levels.takeProfit > entry
    if (side === 'long' && !tpAbove) return 'TP is below entry — valid for Sell, not for Buy.'
    if (side === 'short' && tpAbove) return 'TP is above entry — valid for Buy, not for Sell.'
  }
  return 'Order cannot be placed with the current levels.'
}
