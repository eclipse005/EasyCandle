import { useMemo } from 'react'
import { alignTimeToInterval, TIMEFRAMES } from '@shared/timeframes'
import { usePricePrecision } from '@/hooks/usePricePrecision'
import { closedTradeArrowMarkers } from '@/lib/chartTradeMarks'
import type { TradeMarker } from '@/store/replayStore'
import { buildOverlays } from '@/lib/indicators'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

/**
 * Per-pane chart data from the replay store. `isPrimary` picks left vs right
 * slices so App does not subscribe to tick fields (`candles`, `chartSync`, ...).
 */
export function useChartPaneModel(isPrimary: boolean) {
  const mode = useReplayStore((s) => s.mode)
  const symbol = useReplayStore((s) => s.symbol)
  const chartType = useReplayStore((s) => s.chartType)
  const activeIndicators = useReplayStore((s) => s.activeIndicators)
  const timeframe = useReplayStore((s) => (isPrimary ? s.timeframe : s.secondaryTimeframe))
  const candles = useReplayStore((s) => (isPrimary ? s.candles : s.secondaryCandles))
  const visibleCandles = useReplayStore((s) =>
    isPrimary ? s.visibleCandles : s.secondaryVisibleCandles
  )
  const currentCandle = useReplayStore((s) =>
    isPrimary ? s.currentCandle : s.secondaryCurrentCandle
  )
  const chartSync = useReplayStore((s) => (isPrimary ? s.chartSync : s.secondaryChartSync))
  const closedTrades = useReplayStore((s) => s.closedTrades)
  const shownClosedTradeIds = useUiLayoutStore((s) => s.shownClosedTradeIds)
  const pricePrecision = usePricePrecision()
  const chartScrubbing = useReplayStore((s) => s.chartScrubbing)

  const overlayIds = activeIndicators
  const overlaySource = mode === 'replay' ? (visibleCandles ?? []) : (candles ?? [])
  const overlays = useMemo(() => {
    // Indicator math over full M1 history is the scrub hitch — drop while dragging.
    if (chartScrubbing) return []
    return buildOverlays(overlaySource, overlayIds)
  }, [overlaySource, overlayIds, chartScrubbing])

  const tradeMarkers = useMemo(() => {
    if (chartScrubbing) return []
    const interval = TIMEFRAMES[timeframe]?.seconds ?? 60
    const align = (time: number): number => (isPrimary ? time : alignTimeToInterval(time, interval))
    const shown = new Set(shownClosedTradeIds)
    const markers: TradeMarker[] = []
    for (const trade of closedTrades) {
      if (!shown.has(trade.id)) continue
      for (const marker of closedTradeArrowMarkers(trade, pricePrecision)) {
        markers.push({ ...marker, time: align(marker.time) })
      }
    }
    return markers
  }, [
    chartScrubbing,
    isPrimary,
    timeframe,
    closedTrades,
    shownClosedTradeIds,
    pricePrecision
  ])

  return {
    mode,
    symbol,
    timeframe,
    chartType,
    candles,
    visibleCandles,
    currentCandle,
    chartSync,
    overlays,
    tradeMarkers
  }
}
