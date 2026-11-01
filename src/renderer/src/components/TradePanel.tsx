import ChartInstantTrade from '@/components/ChartInstantTrade'
import { GripVertical, List, Wallet, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  formatRiskReward,
  pnlScaleForSymbol,
  realizedRiskReward,
  sessionPerformance,
  unrealizedPnl,
  unrealizedPnlTotal,
  type ClosedTrade,
  type PendingOrder,
  type Position
} from '@/lib/paperTrade'
import { formatPnlCcy } from '@shared/pnlCurrency'
import {
  accountBalance,
  accountClosedTradePnl,
  accountCommission,
  accountPnlValue,
  accountSessionAmounts,
  formatAccountValue
} from '@/lib/accountPnl'
import { formatAccountDateTime } from '@/lib/displayTime'
import { useAccountPrefsStore } from '@/store/accountPrefsStore'
import { useSessionStore } from '@/store/sessionStore'
import { formatAssetPrice } from '@shared/pricePrecision'
import { usePricePrecision } from '@/hooks/usePricePrecision'
import { useReplayStore, selectPriceFollowCandle } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import Tooltip from '@/components/Tooltip'
import { useT } from '@/i18n/useT'
import { positionSizeLabel } from '@/i18n/tradeLabels'

type HistoryTab = 'positions' | 'openOrders' | 'positionHistory'

function tabClass(active: boolean): string {
  return `shrink-0 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
    active ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:text-zinc-200'
  }`
}

function pnlClass(value: number | null): string {
  if (value == null) return 'text-zinc-500'
  return value >= 0 ? 'text-emerald-400' : 'text-red-400'
}

function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap px-3 py-2 align-middle ${className}`}>{children}</td>
}

function sideClass(side: 'long' | 'short', muted = false): string {
  if (side === 'long')
    return muted ? 'font-semibold text-emerald-400/90' : 'font-semibold text-emerald-400'
  return muted ? 'font-semibold text-red-400/90' : 'font-semibold text-red-400'
}

function BookTable({
  columns,
  empty,
  hasRows,
  headStart,
  children
}: {
  columns: string[]
  empty: string
  hasRows: boolean
  headStart?: ReactNode
  children: ReactNode
}) {
  if (!hasRows) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="px-4 py-16 text-center text-sm text-zinc-500">{empty}</p>
      </div>
    )
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[52rem] border-collapse text-left text-xs">
        <thead className="sticky top-0 z-10 bg-zinc-950 text-zinc-500">
          <tr className="border-b border-white/[0.08]">
            {headStart != null ? <th className="w-8 px-3 py-2.5 font-medium">{headStart}</th> : null}
            {columns.map((label, index) => (
              <th key={`${label}-${index}`} className="whitespace-nowrap px-3 py-2.5 font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function sideLabel(side: 'long' | 'short', t: (key: 'trades.buy' | 'trades.sell') => string): string {
  return side === 'long' ? t('trades.buy') : t('trades.sell')
}

function JournalCell({ note }: { note?: string | null }) {
  if (!note) return <Td className="text-zinc-600">—</Td>
  return (
    <Td className="max-w-[14rem]">
      <span className="block truncate text-zinc-400" title={note}>
        {note}
      </span>
    </Td>
  )
}

function GripMenu({ label, items }: { label: string; items: { label: string; danger?: boolean; onSelect: () => void }[] }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ left: 0, top: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent): void {
      const target = event.target
      if (!(target instanceof Node)) return
      if (buttonRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('[data-grip-menu]')) return
      setOpen(false)
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          const rect = event.currentTarget.getBoundingClientRect()
          setCoords({ left: rect.left, top: rect.bottom + 4 })
          setOpen((value) => !value)
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-white/10 hover:text-zinc-100"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {open
        ? createPortal(
            <div
              data-grip-menu
              role="menu"
              style={{ left: coords.left, top: coords.top }}
              className="fixed z-[80] min-w-44 rounded-xl border border-white/10 bg-zinc-900 py-1 shadow-xl shadow-black/40"
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-white/5 ${
                    item.danger ? 'text-red-400' : 'text-zinc-100'
                  }`}
                  onClick={(event) => {
                    event.stopPropagation()
                    setOpen(false)
                    item.onSelect()
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  )
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
  const { t } = useT()
  return (
    <tr
      className={`cursor-pointer tabular-nums ${selected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
      onClick={onSelect}
    >
      <Td>{symbol}</Td>
      <Td className={sideClass(order.side)}>{sideLabel(order.side, t)}</Td>
      <Td>{order.kind === 'stopLimit' ? t('ticket.stop') : t('ticket.limit')}</Td>
      <Td className="text-zinc-400">{positionSizeLabel(order.lots, symbol)}</Td>
      <Td>{formatAssetPrice(order.price, pricePrecision)}</Td>
      <Td className="text-teal-400/90">
        {order.takeProfit == null ? '—' : formatAssetPrice(order.takeProfit, pricePrecision)}
      </Td>
      <Td className="text-orange-400/90">
        {order.stopLoss == null ? '—' : formatAssetPrice(order.stopLoss, pricePrecision)}
      </Td>
      <JournalCell />
      <Td>
        <button
          type="button"
          className="rounded px-1.5 py-0.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          onClick={(event) => {
            event.stopPropagation()
            onCancel()
          }}
        >
          {t('common.cancel')}
        </button>
      </Td>
    </tr>
  )
}

function OpenPositionRow({
  position,
  symbol,
  pricePrecision,
  openPnl,
  pnlCurrency,
  selected,
  onSelect,
  onClose,
  onCloseHalf
}: {
  position: Position
  symbol: string
  pricePrecision: number
  openPnl: number | null
  pnlCurrency: string
  selected: boolean
  onSelect: () => void
  onClose: () => void
  onCloseHalf: () => void
}) {
  const { t } = useT()
  const chartPositionsHidden = useUiLayoutStore((s) => s.chartPositionsHidden)
  const hiddenPositionIds = useUiLayoutStore((s) => s.hiddenPositionIds)
  const toggleHiddenPosition = useUiLayoutStore((s) => s.toggleHiddenPosition)
  const setHiddenPositionIds = useUiLayoutStore((s) => s.setHiddenPositionIds)
  const focusChartTime = useReplayStore((s) => s.focusChartTime)
  const openPositions = useReplayStore((s) => s.positions)
  const hidden = chartPositionsHidden || hiddenPositionIds.includes(position.id)
  return (
    <tr
      className={`cursor-pointer tabular-nums ${selected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
      onClick={onSelect}
    >
      <Td>
        <GripMenu
          label={t('pos.rowMenu')}
          items={[
            { label: t('pos.edit'), onSelect },
            { label: t('pos.goToEntry'), onSelect: () => void focusChartTime(position.entryTime) },
            {
              label: hidden ? t('pos.showOnChart') : t('pos.hideOnChart'),
              onSelect: () => {
                if (chartPositionsHidden) {
                  setHiddenPositionIds(
                    openPositions.filter((item) => item.id !== position.id).map((item) => item.id)
                  )
                  return
                }
                toggleHiddenPosition(position.id)
              }
            },
            { label: t('overlay.close50'), onSelect: onCloseHalf },
            { label: t('overlay.close100'), danger: true, onSelect: onClose }
          ]}
        />
      </Td>
      <Td>{symbol}</Td>
      <Td className={sideClass(position.side)}>{sideLabel(position.side, t)}</Td>
      <Td className="text-zinc-400">{positionSizeLabel(position.lots, symbol)}</Td>
      <Td>{formatAssetPrice(position.entryPrice, pricePrecision)}</Td>
      <Td className="text-teal-400/90">
        {position.takeProfit == null ? '—' : formatAssetPrice(position.takeProfit, pricePrecision)}
      </Td>
      <Td className="text-orange-400/90">
        {position.stopLoss == null ? '—' : formatAssetPrice(position.stopLoss, pricePrecision)}
      </Td>
      <Td className={pnlClass(openPnl)}>{formatPnlCcy(openPnl, pnlCurrency)}</Td>
    </tr>
  )
}

function ClosedPositionRow({
  trade,
  symbol,
  pricePrecision,
  checked,
  onCheck,
  onLocate
}: {
  trade: ClosedTrade
  symbol: string
  pricePrecision: number
  checked: boolean
  onCheck: () => void
  onLocate: () => void
}) {
  const accountTimezone = useAccountPrefsStore((s) => s.accountTimezone)
  const { t } = useT()
  const pnl = accountClosedTradePnl(trade, symbol)
  const commission = accountCommission(trade, symbol)
  const rr = realizedRiskReward(trade.side, trade.entryPrice, trade.stopLoss, trade.takeProfit)
  const started = formatAccountDateTime(trade.entryTime, accountTimezone)
  return (
    <tr className="tabular-nums text-zinc-300">
      <Td>
        <input
          type="checkbox"
          checked={checked}
          aria-label={t('blotter.showOnChart')}
          onClick={(event) => event.stopPropagation()}
          onChange={onCheck}
          className="h-3.5 w-3.5 accent-primary-500"
        />
      </Td>
      <Td>{symbol}</Td>
      <Td className={sideClass(trade.side)}>{sideLabel(trade.side, t)}</Td>
      <Td className="text-zinc-400">{positionSizeLabel(trade.lots, symbol)}</Td>
      <Td>{formatAssetPrice(trade.entryPrice, pricePrecision)}</Td>
      <Td>{formatAssetPrice(trade.exitPrice, pricePrecision)}</Td>
      <Td className={pnlClass(pnl.value)}>{formatAccountValue(pnl)}</Td>
      <Td className="text-zinc-400">{formatAccountValue(commission)}</Td>
      <JournalCell note={trade.note} />
      <Td>
        <button
          type="button"
          className="underline decoration-zinc-600 underline-offset-2 hover:text-zinc-50"
          onClick={(event) => {
            event.stopPropagation()
            onLocate()
          }}
        >
          {started}
        </button>
      </Td>
      <Td className="text-zinc-400">{formatAccountDateTime(trade.exitTime, accountTimezone)}</Td>
      <Td className="text-orange-400/90">
        {trade.stopLoss == null ? '—' : formatAssetPrice(trade.stopLoss, pricePrecision)}
      </Td>
      <Td className="text-teal-400/90">
        {trade.takeProfit == null ? '—' : formatAssetPrice(trade.takeProfit, pricePrecision)}
      </Td>
      <Td>{rr == null ? '—' : formatRiskReward(rr)}</Td>
    </tr>
  )
}

/** Session PnL + open positions, pending orders, and closed trades. */
export default function TradePanel() {
  const { t } = useT()
  const TABS: { id: HistoryTab; label: string }[] = [
    { id: 'positions', label: t('blotter.openPositions') },
    { id: 'openOrders', label: t('blotter.pendingOrders') },
    { id: 'positionHistory', label: t('blotter.closedPositions') }
  ]

  const [tab, setTab] = useState<HistoryTab>('positions')
  const tradeBookOpen = useUiLayoutStore((s) => s.tradeBookOpen)
  const setTradeBookOpen = useUiLayoutStore((s) => s.setTradeBookOpen)
  const shownIds = useUiLayoutStore((s) => s.shownClosedTradeIds)
  const setShownIds = useUiLayoutStore((s) => s.setShownClosedTradeIds)
  const chartPositionsHidden = useUiLayoutStore((s) => s.chartPositionsHidden)
  const setChartPositionsHidden = useUiLayoutStore((s) => s.setChartPositionsHidden)
  const mode = useReplayStore((s) => s.mode)
  const positions = useReplayStore((s) => s.positions)
  const pendingOrders = useReplayStore((s) => s.pendingOrders)
  const selectedWorkingId = useReplayStore((s) => s.selectedWorkingId)
  const selectWorking = useReplayStore((s) => s.selectWorking)
  const paperClose = useReplayStore((s) => s.paperClose)
  const paperClosePartial = useReplayStore((s) => s.paperClosePartial)
  const cancelPending = useReplayStore((s) => s.cancelPending)
  const closedTrades = useReplayStore((s) => s.closedTrades)
  const focusChartTime = useReplayStore((s) => s.focusChartTime)
  const currentCandle = useReplayStore(selectPriceFollowCandle)
  const pricePrecision = usePricePrecision()
  const symbol = useReplayStore((s) => s.symbol)
  const contractSizeOverride = useReplayStore((s) => s.importMeta?.contractSize)
  const preview = useUiLayoutStore((s) => s.tourPaperTradePreview)

  useEffect(() => {
    const live = new Set(closedTrades.map((trade) => trade.id))
    const pruned = shownIds.filter((id) => live.has(id))
    if (pruned.length !== shownIds.length) setShownIds(pruned)
  }, [closedTrades, shownIds, setShownIds])

  if ((mode !== 'replay' && !preview) || !tradeBookOpen) return null

  const mark = currentCandle?.close
  const openPnl = unrealizedPnlTotal(positions, mark, (p) =>
    pnlScaleForSymbol(symbol, p.lots, contractSizeOverride)
  )
  const perf = sessionPerformance(closedTrades, positions, mark, (p) =>
    pnlScaleForSymbol(symbol, p.lots, contractSizeOverride)
  )
  const account = accountSessionAmounts(symbol, closedTrades, perf.realized, openPnl, mark)

  const counts: Record<HistoryTab, number> = {
    positions: positions.length,
    openOrders: pendingOrders.length,
    positionHistory: closedTrades.length
  }

  const positionColumns = [
    t('blotter.asset'),
    t('blotter.side'),
    t('blotter.size'),
    t('ticket.entry'),
    t('ticket.takeProfit'),
    t('ticket.stopLoss'),
    t('blotter.unrealized')
  ]
  const orderColumns = [
    t('blotter.asset'),
    t('blotter.side'),
    t('blotter.type'),
    t('blotter.size'),
    t('blotter.entryPrice'),
    t('ticket.takeProfit'),
    t('ticket.stopLoss'),
    t('blotter.journal'),
    ''
  ]
  const closedColumns = [
    t('blotter.asset'),
    t('blotter.side'),
    t('blotter.size'),
    t('ticket.entry'),
    t('blotter.closeAvg'),
    t('blotter.realizedPnl'),
    t('blotter.commission'),
    t('blotter.journal'),
    t('blotter.dateStart'),
    t('blotter.dateEnd'),
    t('blotter.initialSl'),
    t('blotter.maxTp'),
    t('blotter.maxRr')
  ]
  const liveClosedIds = closedTrades.map((trade) => trade.id)
  const shownLive = shownIds.filter((id) => liveClosedIds.includes(id))
  const allClosedShown = liveClosedIds.length > 0 && shownLive.length === liveClosedIds.length

  let table: ReactNode
  if (tab === 'positions') {
    table = (
      <BookTable
        columns={positionColumns}
        empty={t('blotter.emptyPositions')}
        hasRows={positions.length > 0}
        headStart={
          <GripMenu
            label={t('pos.headerMenu')}
            items={[
              {
                label: chartPositionsHidden ? t('pos.showAll') : t('pos.hideAll'),
                onSelect: () => setChartPositionsHidden(!chartPositionsHidden)
              },
              {
                label: t('pos.closeAll'),
                danger: true,
                onSelect: () => {
                  for (const id of positions.map((position) => position.id)) paperClose(id)
                }
              }
            ]}
          />
        }
      >
        {positions.map((open) => {
          const quotePnl = unrealizedPnl(
            open,
            mark,
            pnlScaleForSymbol(symbol, open.lots, contractSizeOverride)
          )
          const pnl = accountPnlValue(quotePnl, symbol, mark)
          return (
            <OpenPositionRow
              key={open.id}
              position={open}
              symbol={symbol}
              pricePrecision={pricePrecision}
              openPnl={pnl.value}
              pnlCurrency={pnl.currency}
              selected={selectedWorkingId === open.id}
              onSelect={() => selectWorking(selectedWorkingId === open.id ? null : open.id)}
              onClose={() => paperClose(open.id)}
              onCloseHalf={() => paperClosePartial(0.5, open.id)}
            />
          )
        })}
      </BookTable>
    )
  } else if (tab === 'openOrders') {
    table = (
      <BookTable columns={orderColumns} empty={t('blotter.emptyOrders')} hasRows={pendingOrders.length > 0}>
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
      </BookTable>
    )
  } else {
    table = (
      <BookTable
        columns={closedColumns}
        empty={t('blotter.emptyClosed')}
        hasRows={closedTrades.length > 0}
        headStart={
          <input
            type="checkbox"
            checked={allClosedShown}
            aria-label={t('blotter.showOnChart')}
            onChange={() => setShownIds(allClosedShown ? [] : liveClosedIds)}
            className="h-3.5 w-3.5 accent-primary-500"
          />
        }
      >
        {[...closedTrades].reverse().map((trade) => (
          <ClosedPositionRow
            key={`${trade.id}-${trade.exitTime}`}
            trade={trade}
            symbol={symbol}
            pricePrecision={pricePrecision}
            checked={shownLive.includes(trade.id)}
            onCheck={() =>
              setShownIds(
                shownIds.includes(trade.id)
                  ? shownIds.filter((id) => id !== trade.id)
                  : [...shownIds, trade.id]
              )
            }
            onLocate={() => void focusChartTime(trade.entryTime)}
          />
        ))}
      </BookTable>
    )
  }

  return (
    <section
      inert={preview || undefined}
      className={`mt-1.5 flex h-[min(22rem,46%)] min-h-40 shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 ${
        preview ? 'pointer-events-none' : ''
      }`}
    >
          <div className="flex flex-col gap-1 border-b border-white/[0.08] px-3 py-2">
            <div className="flex items-center gap-1">
              <div role="tablist" aria-label={t('trade.history')} className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
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
                      {count > 0 ? <span className="ml-1 tabular-nums text-zinc-500">{count}</span> : null}
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                aria-label={t('trade.hideHistory')}
                onClick={() => setTradeBookOpen(false)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="flex items-center justify-end gap-3 text-xs tabular-nums text-zinc-500">
              <span>
                {t('blotter.realized')}{' '}
                <span className={pnlClass(account.realized.value)}>
                  {formatAccountValue(account.realized)}
                </span>
              </span>
              <span>
                {t('blotter.openPnl')}{' '}
                <span className={pnlClass(account.open.value)}>
                  {formatAccountValue(account.open)}
                </span>
              </span>
              <span>
                {t('blotter.session')}{' '}
                <span className={pnlClass(account.total.value)}>
                  {formatAccountValue(account.total)}
                </span>
              </span>
            </p>
          </div>
      {table}
    </section>
  )
}

/** Buy / Sell and the button that opens the book. Stays under the whole window. */
export function TradeDock() {
  const { t } = useT()
  const mode = useReplayStore((s) => s.mode)
  const preview = useUiLayoutStore((s) => s.tourPaperTradePreview)
  const tradeBookOpen = useUiLayoutStore((s) => s.tradeBookOpen)
  const setTradeBookOpen = useUiLayoutStore((s) => s.setTradeBookOpen)
  const positions = useReplayStore((s) => s.positions)
  const closedTrades = useReplayStore((s) => s.closedTrades)
  const currentCandle = useReplayStore(selectPriceFollowCandle)
  const symbol = useReplayStore((s) => s.symbol)
  const contractSizeOverride = useReplayStore((s) => s.importMeta?.contractSize)
  const activeSession = useSessionStore((s) =>
    s.activeSessionId ? s.sessions.find((x) => x.id === s.activeSessionId) ?? null : null
  )

  if (mode !== 'replay' && !preview) return null

  const mark = currentCandle?.close
  const openPnl = unrealizedPnlTotal(positions, mark, (position) =>
    pnlScaleForSymbol(symbol, position.lots, contractSizeOverride)
  )
  const perf = sessionPerformance(closedTrades, positions, mark, (position) =>
    pnlScaleForSymbol(symbol, position.lots, contractSizeOverride)
  )
  const account = accountSessionAmounts(symbol, closedTrades, perf.realized, openPnl, mark)
  const balance = accountBalance(activeSession?.startingBalance, account.realized)
  const balanceText = formatAccountValue(balance)
  const balanceTip = [
    `${t('blotter.realized')} ${formatAccountValue(account.realized)}`,
    `${t('blotter.openPnl')} ${formatAccountValue(account.open)}`,
    `${t('blotter.session')} ${formatAccountValue(account.total)}`
  ].join(' · ')

  return (
    <footer
      inert={preview || undefined}
      className={`flex h-12 shrink-0 items-center gap-2 border-t border-white/10 bg-zinc-950 px-3 ${
        preview ? 'pointer-events-none' : ''
      }`}
    >
      <ChartInstantTrade />
      <div className="ml-auto flex items-center gap-2">
        <Tooltip text={balanceTip} side="top">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 px-3 text-xs font-medium tabular-nums text-zinc-100">
            <Wallet className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
            {balanceText}
          </span>
        </Tooltip>
        <Tooltip text={tradeBookOpen ? t('trade.hideHistory') : t('trade.showHistory')} side="top">
          <button
            type="button"
            aria-expanded={tradeBookOpen}
            aria-label={tradeBookOpen ? t('trade.hideHistory') : t('trade.showHistory')}
            onClick={() => setTradeBookOpen(!tradeBookOpen)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
              tradeBookOpen ? 'bg-primary-500 text-white' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
            }`}
          >
            <List className="h-4 w-4" aria-hidden />
          </button>
        </Tooltip>
      </div>
    </footer>
  )
}
