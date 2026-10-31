import { useRef, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import LevelPriceControl, { parseLevelPrice } from '@/components/LevelPriceControl'
import RiskRewardControl from '@/components/RiskRewardControl'
import Tooltip from '@/components/Tooltip'
import TradeSizeControl from '@/components/TradeSizeControl'
import {
  canPlaceTicketSide,
  clampRiskPercent,
  DEFAULT_RISK_PERCENT,
  isPendingTicketType,
  lotsFromRiskPercent,
  ticketEntryPrice,
  type TicketOrderType
} from '@/lib/paperTrade'
import { usePricePrecision } from '@/hooks/usePricePrecision'
import { contractSizeForSymbol, tradeSizeKindForSymbol } from '@shared/pricePrecision'
import { useReplayStore, selectPriceFollowCandle } from '@/store/replayStore'
import { useSessionStore } from '@/store/sessionStore'
import { useSymbolParamsStore } from '@/store/symbolParamsStore'

export type { TicketOrderType }

type OrderTicketFormProps = {
  compact?: boolean
}

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

  function submit(side: 'long' | 'short'): void {
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

  function onLimitChange(value: number | null): void {
    setTicketLimitPrice(value)
  }

  const tabClass = (active: boolean) =>
    `flex-1 rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap transition-colors ${
      active
        ? 'bg-zinc-800 text-zinc-100'
        : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300'
    }`

  return (
    <div className="flex flex-col gap-2">
      <div className="flex rounded border border-zinc-800 bg-zinc-900/40 p-0.5">
        <button
          type="button"
          aria-pressed={orderType === 'market'}
          className={tabClass(orderType === 'market')}
          onClick={() => setTicketOrderType('market')}
        >
          Market
        </button>
        <button
          type="button"
          aria-pressed={orderType === 'limit'}
          className={tabClass(orderType === 'limit')}
          onClick={() => setTicketOrderType('limit')}
        >
          Limit
        </button>
        <button
          type="button"
          aria-pressed={orderType === 'stopLimit'}
          className={tabClass(orderType === 'stopLimit')}
          onClick={() => setTicketOrderType('stopLimit')}
        >
          Stop Limit
        </button>
      </div>

      <TradeSizeControl
        value={sizeValue}
        symbol={symbol}
        disabled={busy}
        onChange={setTradeSize}
      />

      <div
        className="flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900/60 px-1 py-0.5"
        title="Size from risk % of session balance and current SL distance"
      >
        <span className="px-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
          Risk %
        </span>
        <input
          type="text"
          inputMode="decimal"
          aria-label="Risk percent of balance"
          disabled={busy}
          value={String(riskPercent)}
          onChange={(event) => {
            const parsed = Number(String(event.target.value).trim().replace(',', '.'))
            if (Number.isFinite(parsed)) setRiskPercent(clampRiskPercent(parsed))
            else setRiskPercent(DEFAULT_RISK_PERCENT)
          }}
          className="h-6 w-12 bg-transparent text-center text-xs font-semibold tabular-nums text-zinc-200 outline-none disabled:opacity-40"
        />
        <button
          type="button"
          disabled={busy || slValue == null}
          title={
            slValue == null
              ? 'Set a stop loss first'
              : 'Set lot size so SL risks this % of session balance'
          }
          onClick={() => {
            const entry = ticketEntryPrice({
              orderType,
              markPrice: mark,
              limitPrice,
              takeProfit: tpValue,
              stopLoss: slValue
            })
            if (entry == null || slValue == null) return
            const params = useSymbolParamsStore.getState().paramsFor(symbol)
            const contract =
              params.contractSize ?? importMeta?.contractSize ?? contractSizeForSymbol(symbol)
            const realized = closedTrades.reduce((sum, t) => sum + t.pnl, 0)
            const balance = (activeSession?.startingBalance ?? 100000) + realized
            const sized = lotsFromRiskPercent({
              balance,
              riskPercent,
              entryPrice: entry,
              stopLoss: slValue,
              contractSize: contract,
              kind: tradeSizeKindForSymbol(symbol)
            })
            if (sized != null) setTradeSize(sized)
          }}
          className="ml-auto h-6 rounded border border-zinc-700 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Size
        </button>
      </div>

      {isPendingTicketType(orderType) && (
        <LevelPriceControl
          label="Price"
          ariaLabel={orderType === 'stopLimit' ? 'Stop limit price' : 'Limit price'}
          title={
            orderType === 'stopLimit'
              ? 'Stop-limit price. Type or pick from the chart. Buy Stop Limit must be above market; Sell Stop Limit must be below market.'
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
      )}

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
      <LevelPriceControl
        label="SL"
        ariaLabel="Stop loss"
        title="Stop loss price. Type to set, or use the crosshair to pick from the chart. Long SL is below current price, short SL is above. First fill seeds the other level at the R:R guide."
        value={slValue}
        precision={pricePrecision}
        disabled={busy}
        picking={pricePick === 'sl'}
        inputRef={slInputRef}
        onChange={onSlChange}
        onPickClick={() => setPricePick('sl')}
      />

      <RiskRewardControl />

      <div className="grid w-full grid-cols-2 gap-1">
        <Tooltip
          className="min-w-0 w-full"
          text={
            !canBuy && isPendingTicketType(orderType) && limitPrice == null
              ? 'Pick or type a price'
              : !canBuy && orderType === 'stopLimit'
                ? 'Buy Stop Limit needs a price above market, with TP above and SL below entry'
                : !canBuy && orderType === 'limit'
                  ? 'Buy Limit needs a price below market, with TP above and SL below entry'
                  : !canBuy
                    ? 'TP/SL levels do not allow a long'
                    : orderType === 'stopLimit'
                      ? 'Buy Stop Limit — wait for price to trade up to the stop'
                      : orderType === 'limit'
                        ? 'Buy Limit — wait for price to trade down to the limit'
                        : 'Buy — open long at the current close'
          }
        >
          <button
            type="button"
            disabled={!canBuy}
            onClick={() => submit('long')}
            className="inline-flex h-8 w-full items-center justify-center gap-1 rounded border border-primary-500/80 bg-primary-500/90 text-white transition-colors enabled:hover:border-primary-400 enabled:hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUpCircle className="h-4 w-4" />
            <span className="text-xs font-semibold">Buy</span>
          </button>
        </Tooltip>
        <Tooltip
          className="min-w-0 w-full"
          text={
            !canSell && isPendingTicketType(orderType) && limitPrice == null
              ? 'Pick or type a price'
              : !canSell && orderType === 'stopLimit'
                ? 'Sell Stop Limit needs a price below market, with TP below and SL above entry'
                : !canSell && orderType === 'limit'
                  ? 'Sell Limit needs a price above market, with TP below and SL above entry'
                  : !canSell
                    ? 'TP/SL levels do not allow a short'
                    : orderType === 'stopLimit'
                      ? 'Sell Stop Limit — wait for price to trade down to the stop'
                      : orderType === 'limit'
                        ? 'Sell Limit — wait for price to trade up to the limit'
                        : 'Sell — open short at the current close'
          }
        >
          <button
            type="button"
            disabled={!canSell}
            onClick={() => submit('short')}
            className="inline-flex h-8 w-full items-center justify-center gap-1 rounded border border-red-400/80 bg-red-400/90 text-white transition-colors enabled:hover:border-red-300 enabled:hover:bg-red-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowDownCircle className="h-4 w-4" />
            <span className="text-xs font-semibold">Sell</span>
          </button>
        </Tooltip>
      </div>

      {mark != null && (!canBuy || !canSell) ? (
        <p className="text-[10px] leading-relaxed text-amber-400/80">
          {ticketValidationHint(orderType, mark, ticketLevels)}
        </p>
      ) : null}
    </div>
  )
}

function ticketValidationHint(
  orderType: TicketOrderType,
  markPrice: number | null,
  levels: { takeProfit: number | null; stopLoss: number | null; limitPrice: number | null }
): string {
  if (markPrice == null) return 'Waiting for price data.'
  const entry = isPendingTicketType(orderType) ? levels.limitPrice : markPrice
  if (entry == null || !Number.isFinite(entry)) {
    return isPendingTicketType(orderType) ? 'Enter a limit price first.' : 'Waiting for price data.'
  }
  if (levels.takeProfit != null && levels.stopLoss != null) {
    return 'Long: TP above entry, SL below. Short: TP below, SL above.'
  }
  if (levels.stopLoss != null) {
    const slAbove = levels.stopLoss > entry
    return slAbove
      ? 'SL is above entry — valid for Short, not for Long.'
      : 'SL is below entry — valid for Long, not for Short.'
  }
  if (levels.takeProfit != null) {
    const tpAbove = levels.takeProfit > entry
    return tpAbove
      ? 'TP is above entry — valid for Long, not for Short.'
      : 'TP is below entry — valid for Short, not for Long.'
  }
  return 'Order cannot be placed with the current TP/SL levels.'
}
