import { useCallback, useEffect, useState } from 'react'
import Dashboard from '@/components/dashboard/Dashboard'
import AppShell from '@/components/AppShell'
import CandleChart from '@/components/CandleChart'
import PaneChrome from '@/components/PaneChrome'
import { runAppStartup } from '@/lib/appStartup'
import { useReplayStore } from '@/store/replayStore'
import { useSessionStore } from '@/store/sessionStore'

export default function App() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const mode = useReplayStore((s) => s.mode)
  const timeframe = useReplayStore((s) => s.timeframe)
  const chartSplit = useReplayStore((s) => s.chartSplit)
  const secondaryTimeframe = useReplayStore((s) => s.secondaryTimeframe)
  const driverPane = useReplayStore((s) => s.driverPane)
  const secondaryLoading = useReplayStore((s) => s.secondaryLoading)
  const secondaryError = useReplayStore((s) => s.secondaryError)
  const dataSource = useReplayStore((s) => s.dataSource)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const loadImportedHistory = useReplayStore((s) => s.loadImportedHistory)
  const setSecondaryTimeframe = useReplayStore((s) => s.setSecondaryTimeframe)
  const setDriverPane = useReplayStore((s) => s.setDriverPane)
  const [primaryPriceScaleWidth, setPrimaryPriceScaleWidth] = useState(0)
  const [secondaryPriceScaleWidth, setSecondaryPriceScaleWidth] = useState(0)

  /**
   * Range-based loading hook. Fires once per loaded series when the viewport
   * reaches the oldest candle on the chart. Imported datasets page an older
   * window in from IndexedDB here instead of holding the whole series.
   */
  const handleReachHistoryEdge = useCallback(() => {
    if (dataSource === 'imported') {
      void loadImportedHistory()
    }
  }, [dataSource, loadImportedHistory])

  useEffect(() => {
    void runAppStartup()
  }, [])

  // Management console: sessions/datasets/symbols/strategies are managed here;
  // the chart only exists inside a backtesting session.
  if (activeSessionId == null) {
    return <Dashboard />
  }

  const showDriver = mode === 'replay' && chartSplit
  const secondaryTfDisabled = secondaryLoading || replayLoading
  const priceScaleWidth = chartSplit ? secondaryPriceScaleWidth : primaryPriceScaleWidth

  return (
    <AppShell priceScaleWidth={priceScaleWidth}>
      <div className={`flex h-full w-full ${chartSplit ? 'flex-row' : ''}`}>
        <div
          className={`relative min-h-0 min-w-0 ${chartSplit ? 'flex-1 border-r border-zinc-800' : 'h-full w-full'}`}
        >
          {chartSplit && (
            <PaneChrome
              label="Left"
              timeframe={timeframe}
              showDriver={showDriver}
              isDriver={driverPane === 'primary'}
              onSelectDriver={() => setDriverPane('primary')}
              driverDisabled={replayLoading || secondaryLoading}
            />
          )}
          <div className={chartSplit ? 'absolute inset-0 top-9' : 'absolute inset-0'}>
            <CandleChart
              isPrimary
              onPriceScaleWidthChange={setPrimaryPriceScaleWidth}
              onReachHistoryEdge={handleReachHistoryEdge}
            />
          </div>
        </div>
        {chartSplit && (
          <div className="relative min-h-0 min-w-0 flex-1">
            <PaneChrome
              label="Right"
              timeframe={secondaryTimeframe}
              timeframeEditable
              timeframeDisabled={secondaryTfDisabled}
              timeframeTitle={
                dataSource === 'imported'
                  ? 'Secondary pane can use another timeframe from the same import'
                  : undefined
              }
              onTimeframeChange={setSecondaryTimeframe}
              showDriver={showDriver}
              isDriver={driverPane === 'secondary'}
              onSelectDriver={() => setDriverPane('secondary')}
              driverDisabled={replayLoading || secondaryLoading}
            />
            <div className="absolute inset-0 top-9">
              <CandleChart
                isPrimary={false}
                onPriceScaleWidthChange={setSecondaryPriceScaleWidth}
              />
            </div>
            {(secondaryLoading || secondaryError) && (
              <div className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center bg-zinc-950/50 px-3 text-center text-xs text-zinc-400">
                {secondaryLoading ? 'Loading secondary pane…' : secondaryError}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
