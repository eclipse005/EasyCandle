import FloatingPanel from '@/components/FloatingPanel'
import OrderTicketForm from '@/components/OrderTicketForm'
import { useT } from '@/i18n/useT'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

/** Order ticket detached from the right dock (FXR "Pop out"). */
export default function OrderPopoutPanel() {
  const { t } = useT()
  const poppedOut = useUiLayoutStore((s) => s.orderPanelPoppedOut)
  const pos = useUiLayoutStore((s) => s.orderPanelPos)
  const setPos = useUiLayoutStore((s) => s.setOrderPanelPos)
  const setPoppedOut = useUiLayoutStore((s) => s.setOrderPanelPoppedOut)
  const preview = useUiLayoutStore((s) => s.tourPaperTradePreview)
  const mode = useReplayStore((s) => s.mode)

  if (!poppedOut || (mode !== 'replay' && !preview)) return null

  return (
    <FloatingPanel
      title={t('rail.order')}
      pos={pos}
      onPosChange={setPos}
      onClose={() => setPoppedOut(false)}
      defaultPlacement="top-right"
      topInset={56}
      persistDefault={false}
      className="w-[300px]"
    >
      <div className="max-h-[min(78vh,44rem)] overflow-y-auto">
        <OrderTicketForm />
      </div>
    </FloatingPanel>
  )
}
