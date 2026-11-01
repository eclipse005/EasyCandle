import { PanelRightClose } from 'lucide-react'
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
  const setRightDock = useUiLayoutStore((s) => s.setRightDock)
  const preview = useUiLayoutStore((s) => s.tourPaperTradePreview)
  const mode = useReplayStore((s) => s.mode)

  if (!poppedOut || (mode !== 'replay' && !preview)) return null

  function dockBack(): void {
    setPoppedOut(false)
    setRightDock('order')
  }

  return (
    <FloatingPanel
      title={t('rail.order')}
      pos={pos}
      onPosChange={setPos}
      onClose={() => setPoppedOut(false)}
      headerActions={
        <button
          type="button"
          aria-label={t('rail.dockBack')}
          title={t('rail.dockBack')}
          onClick={dockBack}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-primary-500/15 hover:text-primary-300"
        >
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      }
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
