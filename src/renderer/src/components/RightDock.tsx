import { Boxes, ChartCandlestick, NotebookPen, SquareArrowOutUpRight } from 'lucide-react'
import { useMemo, type ReactElement, type ReactNode } from 'react'
import DrawingObjectTreeDialog from '@/components/DrawingObjectTreeDialog'
import OrderTicket from '@/components/OrderTicket'
import { useT } from '@/i18n/useT'
import { accountClosedTradePnl, formatAccountValue } from '@/lib/accountPnl'
import { listAllDrawings } from '@/lib/drawings/drawingActions'
import { formatAccountDateTime } from '@/lib/displayTime'
import { formatAssetPrice } from '@shared/pricePrecision'
import { usePricePrecision } from '@/hooks/usePricePrecision'
import { useAccountPrefsStore } from '@/store/accountPrefsStore'
import { useDrawingUiStore } from '@/store/drawingUiStore'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore, type RightDock as RightDockId } from '@/store/uiLayoutStore'

function RailButton({
  label,
  active,
  onClick,
  children
}: {
  label: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className="flex w-12 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] leading-tight text-zinc-400 hover:text-zinc-100"
    >
      <span
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${
          active ? 'bg-zinc-100 text-zinc-950' : 'bg-transparent'
        }`}
      >
        {children}
      </span>
      {label}
    </button>
  )
}

function JournalPanel(): ReactElement {
  const { t } = useT()
  const closedTrades = useReplayStore((s) => s.closedTrades)
  const setClosedTradeNote = useReplayStore((s) => s.setClosedTradeNote)
  const symbol = useReplayStore((s) => s.symbol)
  const pricePrecision = usePricePrecision()
  const accountTimezone = useAccountPrefsStore((s) => s.accountTimezone)

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      {closedTrades.length === 0 ? (
        <p className="py-10 text-center text-xs text-zinc-500">{t('rail.noJournal')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-800">
          {[...closedTrades].reverse().map((trade) => {
            const pnl = accountClosedTradePnl(trade, symbol)
            return (
              <li key={`${trade.id}-${trade.exitTime}`} className="flex flex-col gap-1 px-3.5 py-3">
                <p className="text-xs text-zinc-400">
                  <span className={trade.side === 'long' ? 'text-sky-400' : 'text-rose-400'}>
                    {trade.side === 'long' ? t('trades.buy') : t('trades.sell')}
                  </span>{' '}
                  {formatAssetPrice(trade.entryPrice, pricePrecision)}
                  <span className="text-zinc-600"> → </span>
                  {formatAssetPrice(trade.exitPrice, pricePrecision)}
                  <span
                    className={
                      pnl.value != null && pnl.value >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }
                  >
                    {' '}
                    {formatAccountValue(pnl)}
                  </span>
                </p>
                <p className="text-[10px] text-zinc-600">
                  {formatAccountDateTime(trade.exitTime, accountTimezone)}
                </p>
                <input
                  type="text"
                  defaultValue={trade.note ?? ''}
                  key={`${trade.id}-${trade.exitTime}-${trade.note ?? ''}`}
                  placeholder={t('rail.notePlaceholder')}
                  aria-label={t('trade.noteAria')}
                  maxLength={500}
                  onBlur={(event) => setClosedTradeNote(trade.id, event.currentTarget.value)}
                  className="h-8 rounded-lg border border-white/10 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Right workbench column: one shell, switchable content, plus the tool rail. */
export default function RightDock(): ReactElement | null {
  const { t } = useT()
  const rightDock = useUiLayoutStore((s) => s.rightDock)
  const setRightDock = useUiLayoutStore((s) => s.setRightDock)
  const orderPoppedOut = useUiLayoutStore((s) => s.orderPanelPoppedOut)
  const setOrderPoppedOut = useUiLayoutStore((s) => s.setOrderPanelPoppedOut)
  const showPaperTrade = useUiLayoutStore((s) => s.showPaperTrade)
  const preview = useUiLayoutStore((s) => s.tourPaperTradePreview)
  const mode = useReplayStore((s) => s.mode)
  const revision = useDrawingUiStore((s) => s.revision)
  const drawingCount = useMemo(() => listAllDrawings().length, [revision])

  const canOrder = showPaperTrade && (mode === 'replay' || preview)
  const activeDock =
    rightDock === 'order' && !canOrder
      ? null
      : rightDock === 'journal' && !canOrder
        ? null
        : rightDock
  const title =
    activeDock === 'order'
      ? t('rail.order')
      : activeDock === 'objects'
        ? t('rail.objects')
        : activeDock === 'journal'
          ? t('rail.journal')
          : ''

  function toggle(id: Exclude<RightDockId, null>): void {
    if ((id === 'order' || id === 'journal') && !canOrder) return
    if (id === 'order' && orderPoppedOut) {
      setOrderPoppedOut(false)
      setRightDock('order')
      return
    }
    setRightDock(rightDock === id ? null : id)
  }

  return (
    <div className="flex h-full min-h-0 shrink-0 border-l border-zinc-700 bg-zinc-950">
      {activeDock ? (
        <section
          aria-label={title}
          className="flex h-full min-h-0 w-[272px] flex-col overflow-hidden"
        >
          <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-zinc-800 px-3.5">
            <h2 className="truncate text-[13px] font-medium text-zinc-100">{title}</h2>
            {activeDock === 'objects' ? (
              <span className="text-[11px] tabular-nums text-zinc-500">{drawingCount}</span>
            ) : null}
            {activeDock === 'order' ? (
              <button
                type="button"
                aria-label={t('rail.popOut')}
                title={t('rail.popOut')}
                onClick={() => {
                  setOrderPoppedOut(true)
                  setRightDock(null)
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100"
              >
                <SquareArrowOutUpRight className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </header>
          <div className="min-h-0 flex-1 overflow-hidden">
            {activeDock === 'order' ? <OrderTicket /> : null}
            {activeDock === 'objects' ? <DrawingObjectTreeDialog /> : null}
            {activeDock === 'journal' ? <JournalPanel /> : null}
          </div>
        </section>
      ) : null}
      <nav
        aria-label={t('rail.order')}
        className={`flex w-14 shrink-0 flex-col items-center gap-1 py-2 ${
          activeDock ? 'border-l border-zinc-800' : ''
        }`}
      >
        {canOrder ? (
          <RailButton
            label={t('rail.order')}
            active={rightDock === 'order' || orderPoppedOut}
            onClick={() => toggle('order')}
          >
            <ChartCandlestick className="h-4 w-4" />
          </RailButton>
        ) : null}
        <RailButton
          label={t('rail.objects')}
          active={rightDock === 'objects'}
          onClick={() => toggle('objects')}
        >
          <Boxes className="h-4 w-4" />
        </RailButton>
        {canOrder ? (
          <RailButton
            label={t('rail.journal')}
            active={rightDock === 'journal'}
            onClick={() => toggle('journal')}
          >
            <NotebookPen className="h-4 w-4" />
          </RailButton>
        ) : null}
      </nav>
    </div>
  )
}
