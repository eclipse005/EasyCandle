import { cn } from '@/components/ui/cn'
import { ChevronDown, ChevronUp, Crosshair } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  formatRiskReward,
  pnlScaleForSymbol,
  realizedRiskReward,
  sessionPerformance,
  unrealizedPnl,
  unrealizedPnlTotal,
  type ClosedTrade,
  type HistoricOrder,
  type PendingOrder,
  type Position
} from '@/lib/paperTrade'
import { accountPnlFromQuote, formatPnlCcy, quoteCurrencyForSymbol } from '@shared/pnlCurrency'
import { formatAccountDateTime } from '@/lib/displayTime'
import { useAccountPrefsStore } from '@/store/accountPrefsStore'
import { useSessionStore } from '@/store/sessionStore'
import { formatAssetPrice } from '@shared/pricePrecision'
import { usePricePrecision } from '@/hooks/usePricePrecision'
import { useReplayStore, selectPriceFollowCandle } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import Tooltip from '@/components/Tooltip'
import { softType } from '@/components/ui/softTokens'
import { useT } from '@/i18n/useT'
import {
  exitReasonLabel,
  orderSideLabel,
  orderStatusLabel,
  positionSizeLabel,
  sideLetter,
  sideWord
} from '@/i18n/tradeLabels'

type HistoryTab = 'positions' | 'openOrders' | 'orderHistory' | 'positionHistory'

function tabClass(active: boolean): string {
  return `shrink-0 rounded-lg px-2.5 py-1.5 text-caption font-medium transition-colors ${
    active
      ? 'bg-zinc-800/80 text-zinc-100'
      : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'
  }`
}

function sideClass(side: 'long' | 'short', muted = false): string {
  if (side === 'long')
    return muted ? 'font-semibold text-emerald-400/90' : 'font-semibold text-emerald-400'
  return muted ? 'font-semibold text-red-400/90' : 'font-semibold text-red-400'
}

function EmptyRow({ children }: { children: ReactNode }) {
  return <p className={cn("py-2", softType.caption)}>{children}</p>
}

function HistoryList({ children }: { children: ReactNode }) {
  return <ul className={cn("divide-y divide-zinc-800/80", softType.caption)}>{children}</ul>
}

function PendingOrderRow({
  order,
  symbol,
  pricePrecision,
  selected,
  onSelect,
  onCancel
}: {
  order: PendingOrder
  symbol: string
  pricePrecision: number
  selected: boolean
  onSelect: () => void
  onCancel: () => void
}) {
  const accountTimezone = useAccountPrefsStore((s) => s.accountTimezone)
  const { t } = useT()
  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 tabular-nums ${
        selected ? 'bg-zinc-800/70' : 'hover:bg-zinc-800/40'
      }`}
    >
      <button type="button" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 text-left" onClick={onSelect}>
        <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-micro font-medium text-primary-300/90">
          {t('blotter.pendingOrders')}
        </span>
      <span className={sideClass(order.side)}>{orderSideLabel(order.side, order.kind)}</span>
      <span className="text-zinc-500">{positionSizeLabel(order.lots, symbol)}</span>
      <span className="text-zinc-400">
        {order.kind === 'stopLimit' ? 'Stop' : 'Limit'}{' '}
        {formatAssetPrice(order.price, pricePrecision)} · {formatAccountDateTime(order.placedTime, accountTimezone)}
      </span>
      {order.takeProfit != null && (
        <span className="text-teal-400/90">
          TP {formatAssetPrice(order.takeProfit, pricePrecision)}
        </span>
      )}
      {order.stopLoss != null && (
        <span className="text-orange-400/90">
          SL {formatAssetPrice(order.stopLoss, pricePrecision)}
        </span>
      )}
      </button>
      <button
        type="button"
        className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-micro font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        onClick={onCancel}
      >
        Cancel
      </button>
    </li>
  )
}

function OpenPositionRow({
  position,
  symbol,
  pricePrecision,
  openPnl,
  openRr,
  rrLabel,
  selected,
  onSelect,
  onClose
}: {
  position: Position
  symbol: string
  pricePrecision: number
  openPnl: number | null
  openRr: number | null
  rrLabel: string
  selected: boolean
  onSelect: () => void
  onClose: () => void
}) {
  const accountTimezone = useAccountPrefsStore((s) => s.accountTimezone)
  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 tabular-nums ${
        selected ? 'bg-zinc-800/70' : 'hover:bg-zinc-800/40'
      }`}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 text-left"
        onClick={onSelect}
      >
        <span className="rounded-md bg-primary-950/40 px-1.5 py-0.5 text-micro font-medium text-primary-300">
          Open
        </span>
        <span className={sideClass(position.side)}>{position.side.toUpperCase()}</span>
        <span className="text-zinc-500">{positionSizeLabel(position.lots, symbol)}</span>
        <span className="text-zinc-400">
          Entry {formatAssetPrice(position.entryPrice, pricePrecision)} ·{' '}
          {formatAccountDateTime(position.entryTime, accountTimezone)}
        </span>
        {position.takeProfit != null && (
          <span className="text-teal-400/90">
            TP {formatAssetPrice(position.takeProfit, pricePrecision)}
            {openRr != null ? ` · ${formatRiskReward(openRr)}` : ` · ${rrLabel}`}
          </span>
        )}
        {position.stopLoss != null && (
          <span className="text-orange-400/90">
            SL {formatAssetPrice(position.stopLoss, pricePrecision)}
          </span>
        )}
        <span
          className={`ml-auto font-medium ${
            openPnl != null && openPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {formatPnlCcy(openPnl, quoteCurrencyForSymbol(symbol))}
        </span>
      </button>
      <button
        type="button"
        className="shrink-0 rounded px-1.5 py-0.5 text-micro font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        onClick={onClose}
      >
        Close
      </button>
    </li>
  )
}

function HistoricOrderRow({
  order,
  symbol,
  pricePrecision
}: {
  order: HistoricOrder
  symbol: string
  pricePrecision: number
}) {
  const canceled = order.status === 'canceled'
  const accountTimezone = useAccountPrefsStore((s) => s.accountTimezone)
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 tabular-nums text-zinc-400">
      <span
        className={`rounded px-1.5 py-0.5 text-micro font-medium ${
          canceled ? 'bg-zinc-900 text-zinc-500' : 'bg-zinc-900 text-emerald-400/80'
        }`}
      >
        {orderStatusLabel(order.status)}
      </span>
      <span className={sideClass(order.side, true)}>
        {orderSideLabel(order.side, order.type)}
      </span>
      <span className="text-zinc-500">{positionSizeLabel(order.lots, symbol)}</span>
      <span>
        {formatAssetPrice(order.price, pricePrecision)}
        {canceled ? ' · canceled' : ''}
      </span>
      <span className="text-zinc-600">
        {formatAccountDateTime(order.placedTime, accountTimezone)}
        {order.updateTime !== order.placedTime ? ` → ${formatAccountDateTime(order.updateTime, accountTimezone)}` : ''}
      </span>
      {order.takeProfit != null && (
        <span className="text-teal-400/80">
          TP {formatAssetPrice(order.takeProfit, pricePrecision)}
        </span>
      )}
      {order.stopLoss != null && (
        <span className="text-orange-400/80">
          SL {formatAssetPrice(order.stopLoss, pricePrecision)}
        </span>
      )}
    </li>
  )
}

function ClosedPositionRow({
  trade,
  symbol,
  pricePrecision,
  onLocate,
  onNoteChange
}: {
  trade: ClosedTrade
  symbol: string
  pricePrecision: number
  onLocate: () => void
  onNoteChange: (note: string) => void
}) {
  const accountTimezone = useAccountPrefsStore((s) => s.accountTimezone)
  const { t } = useT()
  return (
    <li className="flex flex-col gap-0.5 py-1.5 text-zinc-400">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums">
        <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-micro font-medium text-zinc-500">
          {t('blotter.closedPositions')}
        </span>
        <span className="inline-flex items-center gap-1" title={trade.side === 'long' ? t('trade.buyToSell') : t('trade.sellToBuy')}>
          <span
            className={
              trade.side === 'long'
                ? 'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded bg-emerald-500/15 px-1 text-micro font-bold text-emerald-400'
                : 'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded bg-red-500/15 px-1 text-micro font-bold text-red-400'
            }
          >
            {sideLetter(trade.side, 'entry')}
          </span>
          <span className="text-zinc-600" aria-hidden>
            →
          </span>
          <span
            className={
              trade.side === 'long'
                ? 'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded bg-red-500/15 px-1 text-micro font-bold text-red-400'
                : 'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded bg-emerald-500/15 px-1 text-micro font-bold text-emerald-400'
            }
          >
            {sideLetter(trade.side, 'exit')}
          </span>
        </span>
        <span className={sideClass(trade.side, true)}>{sideWord(trade.side)}</span>
        <span className="text-zinc-500">{positionSizeLabel(trade.lots, symbol)}</span>
        <span className="rounded bg-zinc-900/80 px-1 py-0.5 text-micro font-medium text-zinc-500">
          {exitReasonLabel(trade.exitReason)}
        </span>
        <span>
          {formatAssetPrice(trade.entryPrice, pricePrecision)} →{' '}
          {formatAssetPrice(trade.exitPrice, pricePrecision)}
        </span>
        <span className="text-zinc-600">
          {formatAccountDateTime(trade.entryTime, accountTimezone)} → {formatAccountDateTime(trade.exitTime, accountTimezone)}
        </span>
        <Tooltip text={t('trade.scrollEntry')} side="top">
          <button
            type="button"
            aria-label={t('trade.scrollTo', { time: formatAccountDateTime(trade.entryTime, accountTimezone) })}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            onClick={onLocate}
          >
            <Crosshair className="h-3.5 w-3.5" aria-hidden />
          </button>
        </Tooltip>
        <span
          className={`ml-auto font-medium ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
        >
          {formatPnlCcy(trade.pnl, quoteCurrencyForSymbol(symbol))}
        </span>
      </div>
      <input
        type="text"
        defaultValue={trade.note ?? ''}
        key={`${trade.id}-${trade.exitTime}-${trade.note ?? ''}`}
        placeholder="Add note…"
        aria-label="Trade note"
        maxLength={500}
        onBlur={(event) => onNoteChange(event.currentTarget.value)}
        className="h-6 w-full rounded-xl border border-transparent bg-transparent px-1 text-micro text-zinc-400 outline-none placeholder:text-zinc-700 hover:border-zinc-800 focus:border-zinc-800 focus:bg-zinc-900/60"
      />
    </li>
  )
}

/** Session PnL + Positions / Open Orders / Order History / Position History. */
export default function TradePanel() {
  const { t } = useT()
  const TABS: { id: HistoryTab; label: string }[] = [
    { id: 'positions', label: t('blotter.openPositions') },
    { id: 'openOrders', label: t('blotter.pendingOrders') },
    { id: 'orderHistory', label: t('blotter.orderHistory') },
    { id: 'positionHistory', label: t('blotter.closedPositions') }
  ]

  const [showPositions, setShowPositions] = useState(true)
  const [tab, setTab] = useState<HistoryTab>('positions')
  const mode = useReplayStore((s) => s.mode)
  const positions = useReplayStore((s) => s.positions)
  const pendingOrders = useReplayStore((s) => s.pendingOrders)
  const selectedWorkingId = useReplayStore((s) => s.selectedWorkingId)
  const selectWorking = useReplayStore((s) => s.selectWorking)
  const paperClose = useReplayStore((s) => s.paperClose)
  const cancelPending = useReplayStore((s) => s.cancelPending)
  const closedTrades = useReplayStore((s) => s.closedTrades)
  const focusChartTime = useReplayStore((s) => s.focusChartTime)
  const setClosedTradeNote = useReplayStore((s) => s.setClosedTradeNote)
  const orderHistory = useReplayStore((s) => s.orderHistory)
  const currentCandle = useReplayStore(selectPriceFollowCandle)
  const riskReward = useReplayStore((s) => s.riskReward)
  const pricePrecision = usePricePrecision()
  const symbol = useReplayStore((s) => s.symbol)
  const contractSizeOverride = useReplayStore((s) => s.importMeta?.contractSize)
  const activeSession = useSessionStore((s) =>
    s.activeSessionId ? s.sessions.find((x) => x.id === s.activeSessionId) ?? null : null
  )
  const preview = useUiLayoutStore((s) => s.tourPaperTradePreview)

  if (mode !== 'replay' && !preview) return null

  const quoteCurrency = quoteCurrencyForSymbol(symbol)
  const mark = currentCandle?.close
  const openPnl = unrealizedPnlTotal(positions, mark, (p) =>
    pnlScaleForSymbol(symbol, p.lots, contractSizeOverride)
  )
  const perf = sessionPerformance(closedTrades, positions, mark, (p) =>
    pnlScaleForSymbol(symbol, p.lots, contractSizeOverride)
  )
  // Account-currency (USD) equivalents, only when every exit price on this
  // chart can provide the rate — otherwise stay in the quote currency (#51).
  let realizedUsd: number | null = null
  if (quoteCurrency !== 'USD') {
    realizedUsd = 0
    for (const trade of closedTrades) {
      const usd = accountPnlFromQuote(trade.pnl, symbol, trade.exitPrice)
      if (usd == null) {
        realizedUsd = null
        break
      }
      realizedUsd += usd
    }
  }
  const openUsd =
    quoteCurrency !== 'USD' && mark != null
      ? accountPnlFromQuote(openPnl, symbol, mark)
      : null
  const sessionUsd =
    realizedUsd != null && openUsd != null ? realizedUsd + openUsd : null
  const rrLabel = formatRiskReward(riskReward)

  const counts: Record<HistoryTab, number> = {
    positions: positions.length,
    openOrders: pendingOrders.length,
    orderHistory: orderHistory.length,
    positionHistory: closedTrades.length
  }

  const howTo = (
    <EmptyRow>
      Use the order ticket to Buy or Sell at market, or place a Limit or Stop Limit. Size is lots
      for FX/metals and coin amount for crypto. Ticket TP/SL apply to the next order, then the form
      resets. Drag a position's levels on the chart to edit them. First SL/TP placement seeds the
      other at {rrLabel} as a guide — then move either level freely.
    </EmptyRow>
  )

  const neverTraded =
    positions.length === 0 &&
    pendingOrders.length === 0 &&
    orderHistory.length === 0 &&
    closedTrades.length === 0

  let body: ReactNode
  if (tab === 'positions') {
    body =
      positions.length > 0 ? (
        <HistoryList>
          {positions.map((open) => (
            <OpenPositionRow
              key={open.id}
              position={open}
              symbol={symbol}
              pricePrecision={pricePrecision}
              openPnl={unrealizedPnl(
                open,
                mark,
                pnlScaleForSymbol(symbol, open.lots, contractSizeOverride)
              )}
              openRr={realizedRiskReward(open.side, open.entryPrice, open.stopLoss, open.takeProfit)}
              rrLabel={rrLabel}
              selected={selectedWorkingId === open.id}
              onSelect={() => selectWorking(selectedWorkingId === open.id ? null : open.id)}
              onClose={() => paperClose(open.id)}
            />
          ))}
        </HistoryList>
      ) : neverTraded ? (
        howTo
      ) : (
        <EmptyRow>{t('blotter.emptyPositions')}</EmptyRow>
      )
  } else if (tab === 'openOrders') {
    body =
      pendingOrders.length > 0 ? (
        <HistoryList>
          {pendingOrders.map((order) => (
            <PendingOrderRow
              key={order.id}
              order={order}
              symbol={symbol}
              pricePrecision={pricePrecision}
              selected={selectedWorkingId === order.id}
              onSelect={() => selectWorking(selectedWorkingId === order.id ? null : order.id)}
              onCancel={() => cancelPending(order.id)}
            />
          ))}
        </HistoryList>
      ) : (
        <EmptyRow>{t('blotter.emptyOrders')}</EmptyRow>
      )
  } else if (tab === 'orderHistory') {
    body =
      orderHistory.length > 0 ? (
        <HistoryList>
          {[...orderHistory].reverse().map((order) => (
            <HistoricOrderRow
              key={`${order.id}-${order.status}-${order.updateTime}`}
              order={order}
              symbol={symbol}
              pricePrecision={pricePrecision}
            />
          ))}
        </HistoryList>
      ) : (
        <EmptyRow>{t('blotter.emptyHistory')}</EmptyRow>
      )
  } else {
    body =
      closedTrades.length > 0 ? (
        <HistoryList>
          {[...closedTrades].reverse().map((trade) => (
            <ClosedPositionRow
              key={`${trade.id}-${trade.exitTime}`}
              trade={trade}
              symbol={symbol}
              pricePrecision={pricePrecision}
              onLocate={() => void focusChartTime(trade.entryTime)}
              onNoteChange={(note) => setClosedTradeNote(trade.id, note)}
            />
          ))}
        </HistoryList>
      ) : (
        <EmptyRow>{t('blotter.emptyClosed')}</EmptyRow>
      )
  }

  return (
    <div
      inert={preview || undefined}
      className={`mt-2 shrink-0 rounded-2xl border border-white/[0.08] bg-zinc-900/75 pb-12 shadow-lg shadow-black/20 ${
        preview ? 'pointer-events-none' : ''
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-3.5 py-2.5">
        <span className={cn(softType.body, "font-medium text-zinc-400")}>{t('blotter.paperTrade')}</span>

        <div className="ml-auto flex flex-wrap items-center gap-3 text-caption tabular-nums">
          {activeSession ? (
            <span className="text-zinc-500">
              Balance{' '}
              <span
                className={
                  activeSession.startingBalance + perf.realized >= 0
                    ? 'text-emerald-400'
                    : 'text-red-400'
                }
              >
                {formatPnlCcy(activeSession.startingBalance + perf.realized, quoteCurrency)}
              </span>
            </span>
          ) : null}
          <span className="text-zinc-500">
            Realized{' '}
            <span className={perf.realized >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {formatPnlCcy(perf.realized, quoteCurrency)}
            </span>
          </span>
          <span className="text-zinc-500">
            Open{' '}
            <span
              className={
                openPnl == null
                  ? 'text-zinc-600'
                  : openPnl >= 0
                    ? 'text-emerald-400'
                    : 'text-red-400'
              }
            >
              {formatPnlCcy(openPnl, quoteCurrency)}
            </span>
          </span>
          <span className="font-medium text-zinc-300">
            Session{' '}
            <span className={perf.total >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {formatPnlCcy(perf.total, quoteCurrency)}
            </span>
            {sessionUsd != null ? (
              <span className="ml-1.5 text-micro text-zinc-500">
                ({formatPnlCcy(sessionUsd, 'USD')})
              </span>
            ) : null}
          </span>
          <Tooltip text={showPositions ? t('trade.hideHistory') : t('trade.showHistory')} side="top">
            <button
              type="button"
              onClick={() => setShowPositions((v) => !v)}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300"
            >
              {showPositions ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronUp className="h-5 w-5" />
              )}
            </button>
          </Tooltip>
        </div>
      </div>

      {showPositions && (
        <>
          <div
            role="tablist"
            aria-label="Trade history"
            className="flex gap-1 overflow-x-auto border-b border-white/[0.06] px-2.5 py-1.5"
          >
            {TABS.map((item) => {
              const active = tab === item.id
              const count = counts[item.id]
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={tabClass(active)}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                  <span
                    className={`ml-1 tabular-nums ${active ? 'text-zinc-400' : 'text-zinc-600'}`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="max-h-36 overflow-y-auto px-3 py-1.5">{body}</div>
        </>
      )}
    </div>
  )
}
