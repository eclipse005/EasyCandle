import type { IChartApi } from 'lightweight-charts'

/**
 * Imperative hooks for chart view commands (empty-chart RMB: Reset view /
 * Move to last candle). CandleChart registers the primary pane on mount.
 */

type ViewApi = {
  fitContent: () => void
  focusLatest: () => void
}

let primary: ViewApi | null = null

export function registerPrimaryChartView(api: ViewApi | null): void {
  primary = api
}

export function fitPrimaryChart(): void {
  primary?.fitContent()
}

export function focusPrimaryLatest(): void {
  primary?.focusLatest()
}

/** Helper used by CandleChart when wiring the bridge. */
export function makeChartViewApi(
  getChart: () => IChartApi | null,
  getCandleCount: () => number,
  focusLatestCandle: (chart: IChartApi, count: number) => void
): ViewApi {
  return {
    fitContent() {
      const chart = getChart()
      if (!chart) return
      chart.timeScale().fitContent()
    },
    focusLatest() {
      const chart = getChart()
      if (!chart) return
      focusLatestCandle(chart, getCandleCount())
    }
  }
}
