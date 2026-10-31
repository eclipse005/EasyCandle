import OrderTicketForm from '@/components/OrderTicketForm'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

/** TradingView-style order ticket to the right of the chart. */
export default function OrderTicket() {
  const mode = useReplayStore((s) => s.mode)
  const preview = useUiLayoutStore((s) => s.tourPaperTradePreview)
  if (mode !== 'replay' && !preview) return null

  return (
    <aside
      data-tour="paper-trade"
      inert={preview || undefined}
      className={`flex h-full w-[300px] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/80 shadow-lg shadow-black/20 ${
        preview ? 'pointer-events-none' : ''
      }`}
    >
      <div className="shrink-0 border-b border-white/10 px-3 py-2">
        <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Order ticket</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <OrderTicketForm />
      </div>
    </aside>
  )
}
