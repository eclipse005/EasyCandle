import FloatingPanel from '@/components/FloatingPanel'
import ReplayControls from '@/components/ReplayControls'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

export default function FloatingReplayBar() {
  const pos = useUiLayoutStore((s) => s.replayControlsPos)
  const setReplayControlsPos = useUiLayoutStore((s) => s.setReplayControlsPos)
  const showPaperTrade = useUiLayoutStore((s) => s.showPaperTrade)
  const chartFullscreen = useUiLayoutStore((s) => s.chartFullscreen)
  const bottomInset = showPaperTrade && !chartFullscreen ? 67 : 16

  return (
    <FloatingPanel
      pos={pos}
      onPosChange={setReplayControlsPos}
      defaultPlacement="bottom-center"
      scope="viewport"
      chrome="inline"
      persistDefault={false}
      bottomInset={bottomInset}
      className="!rounded-full !border-white/[0.08] bg-zinc-950/95 shadow-lg shadow-black/40"
    >
      <ReplayControls />
    </FloatingPanel>
  )
}
