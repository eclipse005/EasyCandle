import { useCallback, useEffect } from 'react'
import Dashboard from '@/components/dashboard/Dashboard'
import AppShell from '@/components/AppShell'
import CandleChart from '@/components/CandleChart'
import PaneChrome from '@/components/PaneChrome'
import { runAppStartup } from '@/lib/appStartup'
import { useT } from '@/i18n/useT'
import { useReplayStore } from '@/store/replayStore'
import { useSessionStore } from '@/store/sessionStore'

export default function App() {
  const { t } = useT()
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const timeframe = useReplayStore((s) => s.timeframe)
  const chartSplit = useReplayStore((s) => s.chartSplit)
  const secondaryTimeframe = useReplayStore((s) => s.secondaryTimeframe)
  const secondaryLoading = useReplayStore((s) => s.secondaryLoading)
  const secondaryError = useReplayStore((s) => s.secondaryError)
  const dataSource = useReplayStore((s) => s.dataSource)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const loadImportedHistory = useReplayStore((s) => s.loadImportedHistory)
  const setSecondaryTimeframe = useReplayStore((s) => s.setSecondaryTimeframe)

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

  const secondaryTfDisabled = secondaryLoading || replayLoading

  return (
    <AppShell>
      <div className={`flex h-full w-full ${chartSplit ? 'flex-row' : ''}`}>
        <div
          className={`relative min-h-0 min-w-0 ${chartSplit ? 'flex-1 border-r border-zinc-800' : 'h-full w-full'}`}
        >
          {chartSplit && <PaneChrome label={t('pane.left')} timeframe={timeframe} />}
          <div className={chartSplit ? 'absolute inset-0 top-9' : 'absolute inset-0'}>
            <CandleChart isPrimary onReachHistoryEdge={handleReachHistoryEdge} />
          </div>
        </div>
        {chartSplit && (
          <div className="relative min-h-0 min-w-0 flex-1">
            <PaneChrome
              label={t('pane.right')}
              timeframe={secondaryTimeframe}
              timeframeEditable
              timeframeDisabled={secondaryTfDisabled}
              timeframeTitle={
                dataSource === 'imported' ? t('pane.secondaryTfTip') : undefined
              }
              onTimeframeChange={setSecondaryTimeframe}
            />
            <div className="absolute inset-0 top-9">
              <CandleChart isPrimary={false} />
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
