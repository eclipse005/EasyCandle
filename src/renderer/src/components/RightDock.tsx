import { Boxes, ChartCandlestick, NotebookPen } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import DrawingObjectTreeDialog from '@/components/DrawingObjectTreeDialog'
import OrderTicket from '@/components/OrderTicket'
import { useT } from '@/i18n/useT'
import { accountClosedTradePnl, formatAccountValue } from '@/lib/accountPnl'
import { formatAccountDateTime } from '@/lib/displayTime'
import { formatAssetPrice } from '@shared/pricePrecision'
import { usePricePrecision } from '@/hooks/usePricePrecision'
import { useAccountPrefsStore } from '@/store/accountPrefsStore'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore, type RightDock } from '@/store/uiLayoutStore'

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
    <aside
      aria-label={t('rail.journal')}
      className="flex h-full w-[272px] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950"
    >
      <header className="border-b border-white/10 px-3 py-2.5">
        <p className="text-sm font-medium text-zinc-100">{t('rail.journal')}</p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {closedTrades.length === 0 ? (
          <p className="py-8 text-center text-xs text-zinc-500">{t('rail.noJournal')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {[...closedTrades].reverse().map((trade) => {
              const pnl = accountClosedTradePnl(trade, symbol)
              return (
                <li key={`${trade.id}-${trade.exitTime}`} className="flex flex-col gap-1">
                  <p className="text-xs text-zinc-400">
                    <span className={trade.side === 'long' ? 'text-sky-400' : 'text-rose-400'}>
                      {trade.side === 'long' ? t('trades.buy') : t('trades.sell')}
                    </span>{' '}
                    {formatAssetPrice(trade.entryPrice, pricePrecision)}
                    <span className="text-zinc-600"> → </span>
                    {formatAssetPrice(trade.exitPrice, pricePrecision)}
                    <span className={pnl.value != null && pnl.value >= 0 ? 'text-emerald-400' : 'text-red-400'}>
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
    </aside>
  )
}

/** Far-right icon rail. The selected tool's panel opens to its left. */
export default function RightDock(): ReactElement | null {
  const { t } = useT()
  const rightDock = useUiLayoutStore((s) => s.rightDock)
  const setRightDock = useUiLayoutStore((s) => s.setRightDock)
  const chartFullscreen = useUiLayoutStore((s) => s.chartFullscreen)
  const showPaperTrade = useUiLayoutStore((s) => s.showPaperTrade)
  const preview = useUiLayoutStore((s) => s.tourPaperTradePreview)
  const mode = useReplayStore((s) => s.mode)

  if (chartFullscreen) return null

  const canOrder = showPaperTrade && (mode === 'replay' || preview)

  function toggle(id: Exclude<RightDock, null>): void {
    if (id === 'order' && !canOrder) return
    setRightDock(rightDock === id ? null : id)
  }

  return (
    <div className="flex h-full min-h-0 shrink-0 gap-1.5">
      {rightDock === 'order' && canOrder ? <OrderTicket /> : null}
      {rightDock === 'objects' ? <DrawingObjectTreeDialog /> : null}
      {rightDock === 'journal' && canOrder ? <JournalPanel /> : null}
      <nav
        aria-label={t('rail.order')}
        className="flex w-14 shrink-0 flex-col items-center gap-1 rounded-2xl border border-white/10 bg-zinc-950 py-2"
      >
        {canOrder ? (
          <RailButton label={t('rail.order')} active={rightDock === 'order'} onClick={() => toggle('order')}>
            <ChartCandlestick className="h-4 w-4" />
          </RailButton>
        ) : null}
        <RailButton label={t('rail.objects')} active={rightDock === 'objects'} onClick={() => toggle('objects')}>
          <Boxes className="h-4 w-4" />
        </RailButton>
        {canOrder ? (
          <RailButton label={t('rail.journal')} active={rightDock === 'journal'} onClick={() => toggle('journal')}>
            <NotebookPen className="h-4 w-4" />
          </RailButton>
        ) : null}
      </nav>
    </div>
  )
}
