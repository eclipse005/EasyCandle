import OrderTicketForm from '@/components/OrderTicketForm'
import { useT } from '@/i18n/useT'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

/** TradingView-style order ticket to the right of the chart. */
export default function OrderTicket() {
  const { t } = useT()
  const mode = useReplayStore((s) => s.mode)
  const preview = useUiLayoutStore((s) => s.tourPaperTradePreview)
  if (mode !== 'replay' && !preview) return null

  return (
    <aside
      data-tour="paper-trade"
      inert={preview || undefined}
      className={`flex h-full w-[272px] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/75 shadow-lg shadow-black/20 ${
        preview ? 'pointer-events-none' : ''
      }`}
    >
      <div className="shrink-0 border-b border-white/[0.06] px-3.5 py-2.5">
        <span className="text-[12px] font-medium text-zinc-400">
          {t('ticket.title')}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        <OrderTicketForm />
      </div>
    </aside>
  )
}
