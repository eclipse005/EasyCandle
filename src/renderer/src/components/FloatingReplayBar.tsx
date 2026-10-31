import FloatingPanel from '@/components/FloatingPanel'
import ReplayControls from '@/components/ReplayControls'
import { TIMEFRAMES } from '@shared/timeframes'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { useT } from '@/i18n/useT'

export default function FloatingReplayBar() {
  const { t } = useT()
  const chartSplit = useReplayStore((s) => s.chartSplit)
  const driverPane = useReplayStore((s) => s.driverPane)
  const timeframe = useReplayStore((s) => s.timeframe)
  const secondaryTimeframe = useReplayStore((s) => s.secondaryTimeframe)

  const minimized = useUiLayoutStore((s) => s.replayControlsMinimized)
  const pos = useUiLayoutStore((s) => s.replayControlsPos)
  const setReplayControlsMinimized = useUiLayoutStore((s) => s.setReplayControlsMinimized)
  const setReplayControlsPos = useUiLayoutStore((s) => s.setReplayControlsPos)

  const driverTf =
    chartSplit && driverPane === 'secondary'
      ? TIMEFRAMES[secondaryTimeframe]?.label ?? secondaryTimeframe
      : TIMEFRAMES[timeframe]?.label ?? timeframe
  const driverSide = chartSplit ? (driverPane === 'secondary' ? ' · R' : ' · L') : ''
  const minimizedLabel = `${t('replay.next')} · ${driverTf}${driverSide}`

  return (
    <FloatingPanel
      title={`Replay · ${t('replay.next')}`}
      minimized={minimized}
      minimizedLabel={minimizedLabel}
      pos={pos}
      onPosChange={setReplayControlsPos}
      onMinimizedChange={setReplayControlsMinimized}
      defaultPlacement="bottom-center"
      className="!rounded-2xl !border-white/[0.08] bg-zinc-900/90 shadow-lg shadow-black/25"
    >
      <ReplayControls />
    </FloatingPanel>
  )
}
