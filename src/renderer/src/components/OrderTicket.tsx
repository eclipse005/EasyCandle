import OrderTicketForm from '@/components/OrderTicketForm'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

/** TradingView-style order ticket docked in the right workbench column. */
export default function OrderTicket() {
  const mode = useReplayStore((s) => s.mode)
  const preview = useUiLayoutStore((s) => s.tourPaperTradePreview)
  if (mode !== 'replay' && !preview) return null

  return (
    <div
      data-tour="paper-trade"
      inert={preview || undefined}
      className={`h-full min-h-0 overflow-y-auto px-3.5 py-3 ${preview ? 'pointer-events-none' : ''}`}
    >
      <OrderTicketForm />
    </div>
  )
}
