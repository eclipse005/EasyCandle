import { useEffect, type ReactNode } from 'react'
import { Minimize2 } from 'lucide-react'
import AboutDialog from '@/components/AboutDialog'
import AppTour from '@/components/AppTour'
import ChartSettingsDialog from '@/components/ChartSettingsDialog'
import ChartInstantTrade from '@/components/ChartInstantTrade'
import ChartSessionEquity from '@/components/ChartSessionEquity'
import ChartTimezoneSelect from '@/components/ChartTimezoneSelect'
import DrawingToolbar from '@/components/DrawingToolbar'
import DrawingSettingsDialog from '@/components/DrawingSettingsDialog'
import FloatingReplayBar from '@/components/FloatingReplayBar'
import FloatingTradeBar from '@/components/FloatingTradeBar'
import IconButton from '@/components/IconButton'
import KeyboardShortcutsDialog from '@/components/KeyboardShortcutsDialog'
import MainToolbar from '@/components/MainToolbar'
import SessionReportDialog from '@/components/SessionReportDialog'
import OrderTicket from '@/components/OrderTicket'
import TradePanel from '@/components/TradePanel'
import { useReplayHotkeys } from '@/hooks/useReplayHotkeys'
import { useUiHotkeys } from '@/hooks/useUiHotkeys'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { isMetatraderImport } from '@shared/importTypes'

export default function AppShell({
  children,
  priceScaleWidth = 0
}: {
  children: ReactNode
  priceScaleWidth?: number
}) {
  const status = useReplayStore((s) => s.status)
  const error = useReplayStore((s) => s.error)
  const mode = useReplayStore((s) => s.mode)
  const importMeta = useReplayStore((s) => s.importMeta)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const replayStatus = useReplayStore((s) => s.replayStatus)
  const pause = useReplayStore((s) => s.pause)
  const loadCandles = useReplayStore((s) => s.loadCandles)
  const chartSplit = useReplayStore((s) => s.chartSplit)
  const chartFullscreen = useUiLayoutStore((s) => s.chartFullscreen)
  const setChartFullscreen = useUiLayoutStore((s) => s.setChartFullscreen)
  const showDrawingToolbar = useUiLayoutStore((s) => s.showDrawingToolbar)
  const showReplayControls = useUiLayoutStore((s) => s.showReplayControls)
  const showPaperTrade = useUiLayoutStore((s) => s.showPaperTrade)
  const tourPaperTradePreview = useUiLayoutStore((s) => s.tourPaperTradePreview)

  const inReplay = mode === 'replay'
  const showOrderTicket = showPaperTrade && !chartFullscreen && (inReplay || tourPaperTradePreview)
  const mtFeed = isMetatraderImport(importMeta)
  const showEndedBanner = inReplay && replayStatus === 'ended' && !chartFullscreen

  useReplayHotkeys()
  useUiHotkeys()

  useEffect(() => {
    function onVisibility(): void {
      if (document.visibilityState === 'hidden') {
        const state = useReplayStore.getState()
        if (state.mode === 'replay' && state.isPlaying) {
          pause()
        }
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [pause])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-950">
      <MainToolbar />

      {!chartFullscreen && status === 'error' && error && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-red-900/50 bg-red-950/40 px-3 py-1.5 text-sm text-red-300 sm:px-4">
          <span className="min-w-0 flex-1 break-words">{error}</span>
          {!inReplay && (
            <button
              type="button"
              onClick={() => void loadCandles()}
              className="rounded-xl border border-red-800/80 px-2 py-0.5 text-xs text-red-200 hover:border-red-600 hover:text-red-100"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {showEndedBanner && (
        <div className="shrink-0 border-b border-amber-900/40 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-200/90 sm:px-4">
          Replay reached the end of the imported file. Step back, jump within the file, or exit replay.
        </div>
      )}

      <main
        className={`relative flex min-h-0 flex-1 flex-col ${
          chartFullscreen ? 'p-0' : showDrawingToolbar ? 'py-1.5 px-2 sm:py-2' : 'p-1.5 sm:p-2'
        }`}
      >
        <div
          className={`relative flex gap-0.5 min-h-0 flex-1 overflow-hidden bg-zinc-950 ${
            chartFullscreen ? 'rounded-none border-0 shadow-none' : ''
          }`}
        >
          {showDrawingToolbar && <DrawingToolbar />}
          <div className="relative h-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-white/10">
            {children}
            {showPaperTrade && inReplay && !chartFullscreen && (
              <>
                <ChartInstantTrade />
                <ChartSessionEquity priceScaleWidth={priceScaleWidth} />
              </>
            )}
            <div
              className="pointer-events-none absolute z-20"
              style={{
                right: Math.max(priceScaleWidth, 0) + 6,
                bottom: 4
              }}
            >
              <div className="pointer-events-auto">
                <ChartTimezoneSelect />
              </div>
            </div>
            {showReplayControls && inReplay && <FloatingReplayBar />}
            {chartFullscreen && inReplay && <FloatingTradeBar />}
            {chartFullscreen && (
              <div
                className={`pointer-events-none absolute top-2 z-30 ${chartSplit ? 'top-[2.8rem]' : ''}`}
                style={{ right: Math.max(priceScaleWidth, 0) + 8 }}
              >
                <IconButton
                  tooltip="Exit full-screen chart"
                  shortcut={['F']}
                  onClick={() => setChartFullscreen(false)}
                  className="pointer-events-auto bg-zinc-950/90"
                >
                  <Minimize2 className="h-4 w-4" />
                </IconButton>
              </div>
            )}
            {(status === 'loading' || replayLoading) && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-zinc-950/75 text-sm text-zinc-400">
                <span>{replayLoading ? 'Loading replay window…' : 'Loading candles…'}</span>
                <span className="text-xs text-zinc-600">
                  {mtFeed ? 'UTC · MetaTrader CSV' : 'UTC · Imported CSV'}
                </span>
              </div>
            )}
          </div>
          {showOrderTicket && <OrderTicket />}
        </div>
        {showPaperTrade && !chartFullscreen && <TradePanel />}
      </main>

      <AppTour />
      <KeyboardShortcutsDialog />
      <AboutDialog />
      <ChartSettingsDialog />
      <DrawingSettingsDialog />
      <SessionReportDialog />
    </div>
  )
}
