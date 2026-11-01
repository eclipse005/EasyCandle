import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  createTextWatermark,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type ITextWatermarkPluginApi,
  type LineData,
  type LogicalRange,
  type SeriesMarker,
  type SeriesType,
  type TickMarkType,
  type Time
} from 'lightweight-charts'
import DrawingOverlay from '@/components/DrawingOverlay'
import BarRewindPickOverlay from '@/components/BarRewindPickOverlay'
import DrawingSelectionBar from '@/components/DrawingSelectionBar'
import ChartContextMenu from '@/components/ChartContextMenu'
import PriceScaleMenu, { PriceScalePlus } from '@/components/PriceScaleMenu'
import ActiveIndicatorsLegend from '@/components/ActiveIndicatorsLegend'
import OhlcLegend from '@/components/OhlcLegend'
import SmcOverlay from '@/components/SmcOverlay'
import type { OHLC as DrawingOHLC } from 'lightweight-charts-drawing'
import {
  attachPane,
  detachPane,
  commitGesture,
  lastJSON as lastDrawingJSON
} from '@/lib/drawings/drawingBridge'
import {
  makeChartViewApi,
  registerPrimaryChartView
} from '@/lib/chart/chartViewBridge'
import { useDrawingUiStore } from '@/store/drawingUiStore'
import { applyToolDefaultsOnAdd } from '@/lib/drawings/drawingActions'
import { toLcdInterval } from '@/lib/drawings/drawingStyleBridge'
import { useChartPaneModel } from '@/hooks/useChartPaneModel'
import { useT } from '@/i18n/useT'
import {
  barRemainingSeconds,
  formatBarCountdown,
  lockedPriceRange,
  pricePerBar,
  priceScaleHit,
  priceScaleWidth,
  sessionScaleLevels
} from '@/lib/priceScale'
import { themedWordmarkUrl } from '@/lib/chartWordmark'
import type { ChartOverlay } from '@/lib/indicators'
import {
  buildHeikinAshiPoint,
  buildSeriesData,
  toHeikinAshi,
  type ChartType
} from '@/lib/chart/chartTypes'
import {
  DEFAULT_EDGE_THRESHOLD,
  describeVisibleRange,
  historyEdgeKey,
  type VisibleRangeInfo
} from '@/lib/chart/visibleRange'
import { currentFocusBars, focusRangeForTime } from '@/lib/chart/focusRange'
import type { Candle } from '@shared/candleUtils'
import { resolvePricePrecision, toChartPriceFormat } from '@shared/pricePrecision'
import { TIMEFRAMES } from '@shared/timeframes'
import {
  formatChartCrosshairTime,
  tickMarkLabel,
  unixSecondsFromChartTime
} from '@/lib/chartTimezone'
import { type ChartPalette } from '@/lib/theme'
import { resolveChartPalette, useChartSettingsStore } from '@/store/chartSettingsStore'
import { useThemeStore } from '@/store/themeStore'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

const DEFAULT_VISIBLE_BARS = 50

function chartLocalization(
  timezone: string,
  timeframe: string,
  secondsVisible: boolean
): {
  timeFormatter: (time: Time) => string
} {
  const step = TIMEFRAMES[timeframe]?.seconds ?? 60
  // Daily, weekly, and monthly bars match TradingView: date only, no clock.
  const withTime = step < 86_400
  return {
    timeFormatter: (time) =>
      formatChartCrosshairTime(unixSecondsFromChartTime(time), timezone, {
        withTime,
        withSeconds: withTime && secondsVisible
      })
  }
}

/** Time-scale ticks are a timeScale option, not a localization option. */
function chartTickMarkFormatter(timezone: string): (time: Time, tickMarkType: TickMarkType) => string {
  return (time, tickMarkType) => {
    const seconds = unixSecondsFromChartTime(time)
    if (seconds == null) return ''
    return tickMarkLabel(seconds, tickMarkType, timezone)
  }
}

function chartThemeOptions(palette: ChartPalette): {
  layout: {
    background: { type: ColorType.Solid; color: string }
    textColor: string
    attributionLogo: boolean
  }
  grid: { vertLines: { color: string }; horzLines: { color: string } }
} {
  return {
    layout: {
      background: { type: ColorType.Solid, color: palette.background },
      textColor: palette.text,
      // Hide the lightweight-charts attribution logo (Apache 2.0 — credited
      // in the About dialog instead).
      attributionLogo: false
    },
    grid: {
      vertLines: { color: palette.grid },
      horzLines: { color: palette.grid }
    }
  }
}

function focusLatestCandle(
  chart: IChartApi,
  candleCount: number,
  leftBars = DEFAULT_VISIBLE_BARS
): void {
  if (!chart || candleCount <= 0) return

  const last = candleCount - 1
  // Always show ~DEFAULT_VISIBLE_BARS total width regardless of candle count,
  // with the latest bar near the right (~15% empty to the right). Prevents
  // single-candle sessions from appearing as giant blocks.
  const visibleBars = Math.max(leftBars, candleCount)
  const rightPad = Math.max(4, Math.floor(visibleBars * 0.15))
  // Sparse sessions (a handful of bars so far) would otherwise reserve most of
  // the viewport as unlabelled empty space to the left of the first candle.
  const from = Math.max(-0.5, last - (visibleBars - rightPad))
  const to = last + rightPad

  chart.timeScale().setVisibleLogicalRange({ from, to })
}

/**
 * Future time points for the axis. lightweight-charts only labels time points
 * backed by real data, and trailing whitespace is trimmed, so an invisible
 * line series supplies the future slots. It is excluded from autoscaling, so
 * its flat placeholder price cannot stretch the price scale.
 */
const FUTURE_AXIS_BARS = 1000
const FUTURE_AXIS_RENEW_BARS = 200
const FUTURE_AXIS_COLOR = 'rgba(0,0,0,0)'

function futureAxisData(data: Candle[], timeframe: string): LineData[] {
  if (data.length === 0) return []
  const interval = TIMEFRAMES[timeframe]?.seconds ?? 60
  if (interval >= 24 * 60 * 60) return []
  const last = data[data.length - 1]
  const out: LineData[] = []
  for (let i = 1; i <= FUTURE_AXIS_BARS; i += 1) {
    out.push({
      time: (last.time + interval * i) as Time,
      value: last.close,
      color: FUTURE_AXIS_COLOR
    })
  }
  return out
}

function addSeries(
  chart: IChartApi,
  type: ChartType,
  precision: number,
  palette: ReturnType<typeof resolveChartPalette>
): ISeriesApi<SeriesType> {
  const priceFormat = toChartPriceFormat(precision)
  switch (type) {
    case 'line':
      return chart.addSeries(LineSeries, {
        color: palette.lineColor,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        priceFormat
      })
    case 'bar':
      return chart.addSeries(BarSeries, {
        upColor: palette.upColor,
        downColor: palette.downColor,
        thinBars: false,
        priceFormat
      })
    case 'heikinashi':
    case 'candlestick':
    default:
      return chart.addSeries(CandlestickSeries, {
        upColor: palette.upColor,
        downColor: palette.downColor,
        borderUpColor: palette.borderUpColor,
        borderDownColor: palette.borderDownColor,
        wickUpColor: palette.wickUpColor,
        wickDownColor: palette.wickDownColor,
        priceFormat
      })
  }
}

type CandleChartProps = {
  onPriceScaleWidthChange?: (width: number) => void
  /**
   * Fires once per loaded series when the viewport reaches the oldest loaded
   * candle — the hook range-based loaders use to page older data in.
   */
  onReachHistoryEdge?: (info: VisibleRangeInfo) => void
  /** Bars from either end that still count as "at the edge". */
  edgeThreshold?: number
  /** Whether this is the primary (left) chart; it gets registered for snapshots. */
  isPrimary?: boolean
}

export default function CandleChart({
  onPriceScaleWidthChange,
  onReachHistoryEdge,
  edgeThreshold = DEFAULT_EDGE_THRESHOLD,
  isPrimary = false
}: CandleChartProps) {
  const {
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
  } = useChartPaneModel(isPrimary)
  // Focus is a pane-level command: each pane maps the same UTC time onto its
  // own series, so both scroll together in split view.
  const chartFocus = useReplayStore((s) => s.chartFocus)
  const rewindPick = useReplayStore((s) => s.rewindPick)
  const theme = useThemeStore((s) => s.theme)
  const { t, locale } = useT()
  const chartSettings = useChartSettingsStore()
  const priceScaleSettings = useChartSettingsStore((s) => s.priceScale)
  const colorOverrides = useChartSettingsStore((s) => s.colors)
  const palette = useMemo(() => resolveChartPalette(theme, colorOverrides), [theme, colorOverrides])
  const setPrimaryChart = useUiLayoutStore((s) => s.setPrimaryChart)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const watermarkRef = useRef<ITextWatermarkPluginApi<Time> | null>(null)
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())
  const levelLinesRef = useRef<{
    previous?: IPriceLine
    high?: IPriceLine
    low?: IPriceLine
  }>({})
  const onPriceScaleWidthChangeRef = useRef(onPriceScaleWidthChange)
  const onReachHistoryEdgeRef = useRef(onReachHistoryEdge)
  const edgeThresholdRef = useRef(edgeThreshold)
  /** Series the range handler reads; kept in a ref so we can subscribe once. */
  const rangeCandlesRef = useRef<Candle[]>([])
  const rangeIntervalRef = useRef(60)
  /** Last history edge we reported, so panning left only fires once per series. */
  const reportedEdgeKeyRef = useRef<string | null>(null)
  const priceScaleObserverRef = useRef<ResizeObserver | null>(null)
  const priceScaleCellRef = useRef<HTMLElement | null>(null)
  const priceScaleWidthRef = useRef(0)
  const chartTypeRef = useRef(chartType)
  const seriesTypeRef = useRef<ChartType>(chartType)
  const drawingManagerRef = useRef<import('lightweight-charts-drawing').DrawingManager | null>(null)
  const haLastRef = useRef<Candle | null>(null)
  const haPrevRef = useRef<Candle | null>(null)
  const seriesLastTimeRef = useRef<number | null>(null)
  const futureSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const futureAxisEndRef = useRef<number | null>(null)
  const realCandleCountRef = useRef(0)
  const pricePrecision = useMemo(
    () => resolvePricePrecision(symbol, candles ?? visibleCandles),
    [symbol, candles, visibleCandles]
  )
  const pricePrecisionRef = useRef(pricePrecision)
  pricePrecisionRef.current = pricePrecision
  const [chartReady, setChartReady] = useState<{
    chart: IChartApi
    series: ISeriesApi<SeriesType>
  } | null>(null)

  useEffect(() => {
    onPriceScaleWidthChangeRef.current = onPriceScaleWidthChange
  }, [onPriceScaleWidthChange])

  useEffect(() => {
    onReachHistoryEdgeRef.current = onReachHistoryEdge
    edgeThresholdRef.current = edgeThreshold
  }, [onReachHistoryEdge, edgeThreshold])

  useEffect(() => {
    chartTypeRef.current = chartType
  }, [chartType])

  function ensureFutureAxisSeries(chart: IChartApi): ISeriesApi<'Line'> {
    if (futureSeriesRef.current) return futureSeriesRef.current
    const future = chart.addSeries(LineSeries, {
      color: FUTURE_AXIS_COLOR,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      autoscaleInfoProvider: () => null
    })
    futureSeriesRef.current = future
    return future
  }

  function syncFutureAxis(chart: IChartApi | null, data: Candle[]): void {
    if (!chart) return
    const future = ensureFutureAxisSeries(chart)
    const points = futureAxisData(data, timeframe)
    future.setData(points as never)
    futureAxisEndRef.current =
      points.length > 0 ? Number(points[points.length - 1].time) : null
  }

  function reset(next: Candle[] = [], opts: { fitContent?: boolean } = {}): void {
    const series = seriesRef.current
    const chart = chartRef.current
    if (!series || !chart) return

    const data = next ?? []
    const type = chartTypeRef.current

    if (type === 'heikinashi') {
      const ha = toHeikinAshi(data)
      haLastRef.current = ha.length > 0 ? ha[ha.length - 1] : null
      haPrevRef.current = ha.length > 1 ? ha[ha.length - 2] : null
    } else {
      haLastRef.current = null
      haPrevRef.current = null
    }

    series.setData(buildSeriesData(type, data) as never)
    syncFutureAxis(chart, data)
    realCandleCountRef.current = data.length
    seriesLastTimeRef.current = data.length > 0 ? data[data.length - 1].time : null
    // A new series means a new history edge: allow one more edge callback.
    rangeCandlesRef.current = data
    reportedEdgeKeyRef.current = null

    if (opts.fitContent !== false && data.length) {
      requestAnimationFrame(() => {
        if (chartRef.current !== chart || seriesRef.current !== series) return
        // Re-enable autoscaling after symbol/price-range changes (e.g. BNB → XAU).
        const ps = useChartSettingsStore.getState().priceScale
        const autoScale = ps.lockToBarRatio ? false : ps.autoScale
        const id = ps.scaleOnLeft ? 'left' : 'right'
        series.applyOptions({ priceScaleId: id })
        chart.priceScale(id).applyOptions({ autoScale })
        focusLatestCandle(chart, data.length)
      })
    }
  }

  function append(candle: Candle): void {
    const series = seriesRef.current
    if (!series || !candle) return

    const type = chartTypeRef.current
    let point: unknown

    if (type === 'heikinashi') {
      const lastHa = haLastRef.current
      const prev = lastHa && lastHa.time === candle.time ? haPrevRef.current : lastHa
      if (lastHa && lastHa.time !== candle.time) {
        haPrevRef.current = lastHa
      }
      const ha = buildHeikinAshiPoint(prev, candle)
      haLastRef.current = ha
      point = { time: ha.time as Time, open: ha.open, high: ha.high, low: ha.low, close: ha.close }
    } else if (type === 'line') {
      point = { time: candle.time as Time, value: candle.close }
    } else {
      point = {
        time: candle.time as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close
      }
    }

    const chart = chartRef.current
    const timeScale = chart?.timeScale()
    const rangeBefore = timeScale?.getVisibleLogicalRange() ?? null
    const lastRealIndex = realCandleCountRef.current - 1
    // Future axis points already occupy the padding slots, so LWC has no new
    // right edge to follow. Follow the playhead ourselves while it is on screen.
    const wasFollowing =
      rangeBefore != null &&
      lastRealIndex >= rangeBefore.from &&
      lastRealIndex <= rangeBefore.to

    series.update(point as never, true)

    const previousLast = seriesLastTimeRef.current
    if (previousLast == null || candle.time > previousLast) {
      seriesLastTimeRef.current = candle.time
      realCandleCountRef.current += 1
      if (wasFollowing && rangeBefore && timeScale) {
        timeScale.setVisibleLogicalRange({
          from: rangeBefore.from + 1,
          to: rangeBefore.to + 1
        })
      }
      const interval = TIMEFRAMES[timeframe]?.seconds ?? 60
      const end = futureAxisEndRef.current
      if (end != null && candle.time + interval * FUTURE_AXIS_RENEW_BARS >= end) {
        const visible = timeScale?.getVisibleRange() ?? null
        syncFutureAxis(chart, [candle])
        // Extending the axis adds time points at the tail; keep the user's view
        // on the same time window instead of letting it chase the new points.
        if (chart && visible) chart.timeScale().setVisibleRange(visible)
      }
    }
  }

  function syncOverlays(nextOverlays: ChartOverlay[] | null | undefined): void {
    const chart = chartRef.current
    if (!chart) return

    const list = Array.isArray(nextOverlays) ? nextOverlays : []
    const nextIds = new Set(list.map((item) => item.id))
    const map = overlaySeriesRef.current

    for (const [id, series] of map.entries()) {
      if (!nextIds.has(id)) {
        chart.removeSeries(series)
        map.delete(id)
      }
    }

    for (const overlay of list) {
      if (overlay.type !== 'line') continue

      const ps = useChartSettingsStore.getState().priceScale
      const priceScaleId = ps.scalePriceChartOnly
        ? 'indicator'
        : ps.scaleOnLeft
          ? 'left'
          : 'right'
      let series = map.get(overlay.id)
      if (!series) {
        series = chart.addSeries(LineSeries, {
          color: overlay.color || '#38bdf8',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          priceScaleId,
          priceFormat: toChartPriceFormat(pricePrecisionRef.current)
        })
        map.set(overlay.id, series)
      } else {
        series.applyOptions({
          color: overlay.color || undefined,
          priceScaleId
        })
      }

      series.setData((overlay.data ?? []) as never)
    }
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const settings = useChartSettingsStore.getState()
    const chart = createChart(container, {
      width: container.clientWidth,
      height: Math.max(container.clientHeight, 1),
      ...chartThemeOptions(palette),
      rightPriceScale: {
        borderColor: palette.scaleBorder,
        mode: settings.priceScale.mode,
        invertScale: settings.priceScale.invertScale,
        autoScale: settings.priceScale.autoScale
      },
      crosshair: {
        mode: settings.crosshair.mode,
        vertLine: {
          color: palette.crosshairColor,
          style: settings.crosshair.lineStyle,
          width: settings.crosshair.lineWidth,
          visible: settings.crosshair.visible,
          labelVisible: settings.crosshair.labelVisible
        },
        horzLine: {
          color: palette.crosshairColor,
          style: settings.crosshair.lineStyle,
          width: settings.crosshair.lineWidth,
          visible: settings.crosshair.visible,
          labelVisible: settings.crosshair.labelVisible
        }
      },
      timeScale: {
        borderColor: palette.scaleBorder,
        timeVisible: settings.timeScale.timeVisible,
        secondsVisible: settings.timeScale.secondsVisible,
        shiftVisibleRangeOnNewBar: false,
        tickMarkFormatter: chartTickMarkFormatter(settings.timezone)
      },
      localization: chartLocalization(
        settings.timezone,
        timeframe,
        settings.timeScale.secondsVisible
      )
    })

    const series = addSeries(chart, chartType, pricePrecisionRef.current, palette)
    seriesTypeRef.current = chartType
    ensureFutureAxisSeries(chart)

    markersRef.current = createSeriesMarkers(series, [])
    watermarkRef.current = createTextWatermark(chart.panes()[0], {
      horzAlign: 'center',
      vertAlign: 'center',
      lines: [
        {
          text: '',
          color: palette.watermark,
          fontSize: 72,
          fontFamily: 'Segoe UI, sans-serif',
          fontStyle: '600'
        }
      ]
    })

    chartRef.current = chart
    seriesRef.current = series
    setChartReady({ chart, series })
    if (isPrimary) {
      setPrimaryChart(chart)
    }

    function getPriceScaleCell(): HTMLElement | null {
      const paneEl = chart.panes()[0]?.getHTMLElement()
      const cell = paneEl?.lastElementChild
      return cell instanceof HTMLElement ? cell : null
    }

    function reportPriceScaleWidth(): void {
      const cell = getPriceScaleCell()
      const width = cell ? cell.offsetWidth : 0
      if (width === priceScaleWidthRef.current) return
      priceScaleWidthRef.current = width
      onPriceScaleWidthChangeRef.current?.(width)
    }

    function attachPriceScaleObserver(): void {
      const cell = getPriceScaleCell()
      if (!cell) return
      if (priceScaleCellRef.current === cell) return
      priceScaleObserverRef.current?.disconnect()
      const observer = new ResizeObserver(() => reportPriceScaleWidth())
      observer.observe(cell)
      priceScaleObserverRef.current = observer
      priceScaleCellRef.current = cell
      reportPriceScaleWidth()
    }

    attachPriceScaleObserver()

    // Range-based loading hook: LWC reports the visible logical range on every
    // pan, zoom, resize, and data swap. We translate it into UTC bounds plus
    // edge flags so callers can page data in instead of holding a whole series.
    const handleVisibleLogicalRangeChange = (range: LogicalRange | null): void => {
      const candles = rangeCandlesRef.current
      const info = describeVisibleRange(
        range,
        candles,
        rangeIntervalRef.current,
        edgeThresholdRef.current
      )

      const edgeKey = historyEdgeKey(info, candles)
      if (!edgeKey) {
        // Scrolled away from the oldest candle — re-arm the edge callback.
        if (info && !info.atStart) reportedEdgeKeyRef.current = null
        return
      }
      if (edgeKey === reportedEdgeKeyRef.current) return
      reportedEdgeKeyRef.current = edgeKey
      if (info) onReachHistoryEdgeRef.current?.(info)
    }

    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleLogicalRangeChange)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) {
        chart.applyOptions({ width, height })
      }
      attachPriceScaleObserver()
    })

    observer.observe(container)

    return () => {
      observer.disconnect()
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleLogicalRangeChange)
      priceScaleObserverRef.current?.disconnect()
      priceScaleObserverRef.current = null
      priceScaleCellRef.current = null
      overlaySeriesRef.current.clear()
      markersRef.current = null
      watermarkRef.current = null
      setChartReady(null)
      chart.remove()
      if (isPrimary) {
        setPrimaryChart(null)
      }
      chartRef.current = null
      seriesRef.current = null
      futureSeriesRef.current = null
      futureAxisEndRef.current = null
      realCandleCountRef.current = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Attach the drawing manager whenever the pane's chart/series pair is
  // (re)created — chart type swaps rebuild the series in place.
  useEffect(() => {
    if (!chartReady) return undefined
    const paneId = isPrimary ? 'primary' : 'secondary'
    const ui = useDrawingUiStore.getState()
    const manager = attachPane(paneId, chartReady.chart, chartReady.series, {
      bars: () => {
        const s = useReplayStore.getState()
        return (s.mode === 'replay' ? s.visibleCandles : s.candles) as unknown as DrawingOHLC[]
      },
      magnet: ui.magnet,
      stayInDrawingMode: ui.stayInDrawingMode,
      timeInfo: () => ({
        timeZone: useChartSettingsStore.getState().timezone,
        intraday: true
      })
    })
    drawingManagerRef.current = manager
    manager.setInterval(toLcdInterval(useReplayStore.getState().timeframe))

    const offChange = manager.on('change', () => {
      const uiNow = useDrawingUiStore.getState()
      uiNow.bumpRevision()
      uiNow.refreshUndoRedo()
    })
    const offGesture = manager.on('gestureEnd', () => {
      commitGesture()
      useDrawingUiStore.getState().refreshUndoRedo()
    })
    const offTool = manager.on('tool', (kind) => useDrawingUiStore.setState({ armedTool: kind }))
    const offSelection = manager.on('selection', (ids) => {
      if (!isPrimary) return
      const locked = new Set(
        manager
          .drawings()
          .filter((drawing) => drawing.locked)
          .map((drawing) => drawing.id)
      )
      const allowed = ids.filter((id) => !locked.has(id))
      if (allowed.length !== ids.length) manager.select(allowed)
      useDrawingUiStore.getState().setSelectedIds(allowed)
    })
    const onChartClick = (): void => {
      if (!isPrimary) return
      if (manager.hoveredId() != null) return
      if (manager.selection().length === 0) return
      manager.select([])
      useDrawingUiStore.getState().setSelectedIds([])
    }
    chartReady.chart.subscribeClick(onChartClick)

    // Re-apply the UI settings (a fresh manager starts from lib defaults) and
    // restore the workspace drawings into the fresh manager.
    manager.setDrawingsVisible(useDrawingUiStore.getState().drawingsVisible)
    manager.setMagnet(useDrawingUiStore.getState().magnet)
    manager.setStayInDrawingMode(useDrawingUiStore.getState().stayInDrawingMode)
    if (useDrawingUiStore.getState().drawingsLocked) {
      for (const d of manager.drawings()) {
        if (!d.locked) manager.update({ ...d, locked: true })
      }
    }
    const restored = lastDrawingJSON()
    if (restored !== '[]') manager.importJSON(restored)
    // Register after import so restored drawings keep their saved styles.
    const offAdd = manager.on('add', (drawing) => {
      if (isPrimary) applyToolDefaultsOnAdd(drawing)
    })
    if (isPrimary) {
      useDrawingUiStore.getState().setSelectedIds(manager.selection())
      registerPrimaryChartView(
        makeChartViewApi(
          () => chartRef.current,
          () => rangeCandlesRef.current.length,
          focusLatestCandle
        )
      )
    }

    return () => {
      offChange()
      offGesture()
      offTool()
      offSelection()
      chartReady.chart.unsubscribeClick(onChartClick)
      offAdd()
      if (isPrimary) {
        registerPrimaryChartView(null)
        useDrawingUiStore.getState().setSelectedIds([])
      }
      detachPane(paneId)
      drawingManagerRef.current = null
    }
  }, [chartReady, isPrimary])

  // Keep LCD interval visibility in sync with the pane timeframe.
  useEffect(() => {
    drawingManagerRef.current?.setInterval(toLcdInterval(timeframe))
  }, [timeframe])

  // Swap the series in place when the chart type changes so the crosshair,
  // price scale, markers, and drawing overlay all keep working.
  useEffect(() => {
    const chart = chartRef.current
    const previous = seriesRef.current
    if (!chart) return
    if (seriesTypeRef.current === chartType) return

    const source = mode === 'replay' ? (visibleCandles ?? []) : (candles ?? [])
    const data = source ?? []

    const series = addSeries(chart, chartType, pricePrecisionRef.current, palette)
    seriesTypeRef.current = chartType
    seriesRef.current = series

    if (chartType === 'heikinashi') {
      const ha = toHeikinAshi(data)
      haLastRef.current = ha.length > 0 ? ha[ha.length - 1] : null
      haPrevRef.current = ha.length > 1 ? ha[ha.length - 2] : null
    } else {
      haLastRef.current = null
      haPrevRef.current = null
    }

    series.setData(buildSeriesData(chartType, data) as never)
    syncFutureAxis(chart, data)
    realCandleCountRef.current = data.length
    seriesLastTimeRef.current = data.length > 0 ? data[data.length - 1].time : null
    rangeCandlesRef.current = data
    reportedEdgeKeyRef.current = null

    markersRef.current = createSeriesMarkers(series, [])
    applyTradeMarkers()

    if (previous) {
      chart.removeSeries(previous)
    }

    setChartReady({ chart, series })

    if (data.length) {
      requestAnimationFrame(() => {
        if (chartRef.current !== chart || seriesRef.current !== series) return
        const ps = useChartSettingsStore.getState().priceScale
        const autoScale = ps.lockToBarRatio ? false : ps.autoScale
        const id = ps.scaleOnLeft ? 'left' : 'right'
        series.applyOptions({ priceScaleId: id })
        chart.priceScale(id).applyOptions({ autoScale })
        focusLatestCandle(chart, data.length)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType])

  // Keep the text watermark in sync with the selected symbol and theme.
  useEffect(() => {
    const watermark = watermarkRef.current
    if (!watermark) return
    watermark.applyOptions({
      lines: [
        {
          text: symbol || '',
          color: palette.watermark,
          fontSize: 72,
          fontFamily: 'Segoe UI, sans-serif',
          fontStyle: '600'
        }
      ]
    })
  }, [symbol, palette.watermark])

  // Apply theme + chart settings to the chart, scales, and crosshair.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const settings = useChartSettingsStore.getState()
    const ps = settings.priceScale
    const scaleId = ps.scaleOnLeft ? 'left' : 'right'
    const scaleOptions = {
      borderColor: palette.scaleBorder,
      mode: ps.mode,
      invertScale: ps.invertScale,
      autoScale: ps.lockToBarRatio ? false : ps.autoScale,
      alignLabels: ps.noOverlappingLabels
    }
    chart.priceScale('left').applyOptions({ ...scaleOptions, visible: ps.scaleOnLeft })
    chart.priceScale('right').applyOptions({ ...scaleOptions, visible: !ps.scaleOnLeft })
    const mainSeries = seriesRef.current
    mainSeries?.applyOptions({ priceScaleId: scaleId })
    const studyId = ps.scalePriceChartOnly ? 'indicator' : scaleId
    for (const study of overlaySeriesRef.current.values()) {
      study.applyOptions({ priceScaleId: studyId })
    }
    if (ps.scalePriceChartOnly) {
      chart.priceScale('indicator').applyOptions({
        mode: PriceScaleMode.Normal,
        invertScale: false,
        alignLabels: true
      })
    }
    chart.applyOptions({
      ...chartThemeOptions(palette),
      timeScale: {
        borderColor: palette.scaleBorder,
        timeVisible: settings.timeScale.timeVisible,
        secondsVisible: settings.timeScale.secondsVisible,
        shiftVisibleRangeOnNewBar: false,
        tickMarkFormatter: chartTickMarkFormatter(settings.timezone)
      },
      localization: chartLocalization(
        settings.timezone,
        timeframe,
        settings.timeScale.secondsVisible
      ),
      crosshair: {
        mode: settings.crosshair.mode,
        vertLine: {
          color: palette.crosshairColor,
          style: settings.crosshair.lineStyle,
          width: settings.crosshair.lineWidth,
          visible: settings.crosshair.visible,
          labelVisible: settings.crosshair.labelVisible
        },
        horzLine: {
          color: palette.crosshairColor,
          style: settings.crosshair.lineStyle,
          width: settings.crosshair.lineWidth,
          visible: settings.crosshair.visible,
          labelVisible: settings.crosshair.labelVisible
        }
      }
    })
  }, [theme, chartSettings, palette, timeframe])

  // Keep the main series colors in sync with the chart settings.
  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    series.applyOptions({
      upColor: palette.upColor,
      downColor: palette.downColor,
      borderUpColor: palette.borderUpColor,
      borderDownColor: palette.borderDownColor,
      wickUpColor: palette.wickUpColor,
      wickDownColor: palette.wickDownColor,
      color: palette.lineColor
    } as never)
  }, [palette])

  useEffect(() => {
    const format = toChartPriceFormat(pricePrecision)
    seriesRef.current?.applyOptions({ priceFormat: format })
    for (const overlay of overlaySeriesRef.current.values()) {
      overlay.applyOptions({ priceFormat: format })
    }
  }, [pricePrecision])

  useEffect(() => {
    if (mode !== 'live') return
    // An append snapshot can arrive before the chart mounts; with no series
    // history there is no point to update, so seed the whole series instead.
    if (chartSync?.kind === 'append' && currentCandle && seriesLastTimeRef.current != null) {
      append(currentCandle)
      return
    }
    reset(candles ?? [], { fitContent: chartSync?.fitContent !== false })
  }, [mode, candles, symbol, chartSync?.kind, chartSync?.revision, currentCandle])

  useEffect(() => {
    if (mode !== 'replay' || !chartSync) return

    if (chartSync.kind === 'append' && currentCandle && seriesLastTimeRef.current != null) {
      append(currentCandle)
      return
    }

    reset(visibleCandles ?? [], { fitContent: chartSync.fitContent })
  }, [mode, chartSync?.revision, symbol])

  useEffect(() => {
    syncOverlays(overlays)
  }, [overlays])

  // Keep the visible-range handler reading the series currently on the chart.
  useEffect(() => {
    rangeCandlesRef.current = mode === 'replay' ? (visibleCandles ?? []) : (candles ?? [])
  }, [mode, candles, visibleCandles])

  useEffect(() => {
    rangeIntervalRef.current = TIMEFRAMES[timeframe]?.seconds ?? 60
  }, [timeframe])

  // Scroll a requested UTC time into view. Declared after the effects that keep
  // the range refs current so a focus arriving with new data uses that series.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartFocus) return undefined

    const range = focusRangeForTime(
      chartFocus.time,
      rangeCandlesRef.current,
      rangeIntervalRef.current,
      currentFocusBars(chart)
    )
    if (!range) return undefined

    // Defer past the data/viewport resets above, which also run on a frame.
    const frame = requestAnimationFrame(() => {
      if (chartRef.current !== chart) return
      chart.timeScale().setVisibleLogicalRange(range)
    })
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartFocus?.revision])

  const tradeMarksVisible = useUiLayoutStore((s) => s.tradeMarksVisible)

  function applyTradeMarkers(): void {
    const markersApi = markersRef.current
    if (!markersApi) return
    const markers =
      tradeMarksVisible && Array.isArray(tradeMarkers) ? tradeMarkers : []
    const source = mode === 'replay' ? (visibleCandles ?? []) : (candles ?? [])
    const knownTimes = new Set(source.map((c) => c.time))
    const sorted = markers
      .filter((m) => knownTimes.has(m.time))
      .sort((a, b) => a.time - b.time) as SeriesMarker<Time>[]
    markersApi.setMarkers(sorted)
  }

  useEffect(() => {
    applyTradeMarkers()
  }, [tradeMarkers, tradeMarksVisible, mode, candles, visibleCandles])

  const seriesCandles = mode === 'replay' ? (visibleCandles ?? []) : (candles ?? [])
  const empty = seriesCandles.length === 0
  const smcOverlay = (overlays ?? []).find((item) => item.type === 'smc')
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    price: number
    time: number | null
    drawingId?: string | null
  } | null>(null)
  const [scaleMenu, setScaleMenu] = useState<{
    clientX: number
    clientY: number
    ratio: number | null
  } | null>(null)
  const [plusPoint, setPlusPoint] = useState<{ y: number; price: number } | null>(null)
  const [countdownY, setCountdownY] = useState<number | null>(null)

  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series || !priceScaleSettings.lockToBarRatio) return undefined
    const id = priceScaleSettings.scaleOnLeft ? 'left' : 'right'
    const scale = chart.priceScale(id)
    let ratio = priceScaleSettings.barRatio
    if (ratio == null || !(ratio > 0)) {
      const range = scale.getVisibleRange()
      const logical = chart.timeScale().getVisibleLogicalRange()
      const measured = range && logical ? pricePerBar(range, logical.to - logical.from) : null
      if (measured) {
        useChartSettingsStore.getState().setPriceScale({ barRatio: measured })
        ratio = measured
      }
    }
    if (ratio == null) return undefined
    const locked = ratio
    const apply = (): void => {
      const logical = chart.timeScale().getVisibleLogicalRange()
      const range = scale.getVisibleRange()
      if (!logical || !range) return
      const bars = Math.max(1, logical.to - logical.from)
      const center = (range.from + range.to) / 2
      const next = lockedPriceRange(center, locked, bars)
      if (!next) return
      const span = Math.abs(range.to - range.from)
      const nextSpan = next.to - next.from
      if (span > 0 && Math.abs(span - nextSpan) / span < 0.01) return
      scale.setVisibleRange(next)
    }
    apply()
    const timeScale = chart.timeScale()
    timeScale.subscribeVisibleLogicalRangeChange(apply)
    return () => timeScale.unsubscribeVisibleLogicalRangeChange(apply)
  }, [
    priceScaleSettings.lockToBarRatio,
    priceScaleSettings.barRatio,
    priceScaleSettings.scaleOnLeft,
    chartReady
  ])

  useEffect(() => {
    const series = seriesRef.current
    const bucket = levelLinesRef.current
    const detach = (line: IPriceLine | undefined): void => {
      if (!series || !line) return
      if (series.priceLines().includes(line)) series.removePriceLine(line)
    }
    if (!series) return undefined
    const playhead = currentCandle?.time ?? seriesCandles[seriesCandles.length - 1]?.time
    const levels =
      playhead == null ? null : sessionScaleLevels(seriesCandles, playhead)
    const sync = (
      key: 'previous' | 'high' | 'low',
      price: number | null,
      color: string,
      title: string
    ): void => {
      const show = price != null
      const existing = bucket[key]
      if (!show) {
        detach(existing)
        bucket[key] = undefined
        return
      }
      if (existing && series.priceLines().includes(existing)) {
        existing.applyOptions({ price, color, title })
        return
      }
      bucket[key] = series.createPriceLine({
        price,
        color,
        title,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true
      })
    }
    sync(
      'previous',
      priceScaleSettings.previousDayClose ? (levels?.previousClose ?? null) : null,
      '#f5c16c',
      t('scale.pdc')
    )
    sync(
      'high',
      priceScaleSettings.highAndLow ? (levels?.high ?? null) : null,
      palette.upColor,
      t('scale.high')
    )
    sync(
      'low',
      priceScaleSettings.highAndLow ? (levels?.low ?? null) : null,
      palette.downColor,
      t('scale.low')
    )
    return undefined
  }, [
    priceScaleSettings.previousDayClose,
    priceScaleSettings.highAndLow,
    seriesCandles,
    currentCandle,
    palette.upColor,
    palette.downColor,
    chartReady,
    locale
  ])

  useEffect(() => {
    if (!priceScaleSettings.countdownToBarClose) {
      setCountdownY(null)
      return undefined
    }
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series || currentCandle == null) {
      setCountdownY(null)
      return undefined
    }
    const place = (): void => {
      const y = series.priceToCoordinate(currentCandle.close)
      setCountdownY(y == null ? null : Number(y))
    }
    place()
    const timeScale = chart.timeScale()
    timeScale.subscribeVisibleLogicalRangeChange(place)
    return () => timeScale.unsubscribeVisibleLogicalRangeChange(place)
  }, [priceScaleSettings.countdownToBarClose, currentCandle, chartReady, priceScaleSettings.mode, priceScaleSettings.invertScale, priceScaleSettings.scaleOnLeft])

  const smcScene = smcOverlay?.type === 'smc' ? smcOverlay.scene : null
  const barSeconds = TIMEFRAMES[timeframe]?.seconds ?? 60
  const countdownText =
    priceScaleSettings.countdownToBarClose && currentCandle
      ? formatBarCountdown(barRemainingSeconds(currentCandle.time, currentCandle.time, barSeconds))
      : null

  return (
    <div
      className="absolute inset-0 h-full w-full"
      onContextMenu={(event) => {
        event.preventDefault()
        const chart = chartRef.current
        const series = seriesRef.current
        if (!chart || !series) return
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        const localX = event.clientX - rect.left
        const localY = event.clientY - rect.top
        const hit = priceScaleHit(
          localX,
          rect.width,
          priceScaleWidth(chart, 'left'),
          priceScaleWidth(chart, 'right')
        )
        if (hit) {
          const range = chart.priceScale(hit).getVisibleRange()
          const logical = chart.timeScale().getVisibleLogicalRange()
          const ratio =
            range && logical ? pricePerBar(range, logical.to - logical.from) : null
          setContextMenu(null)
          setPlusPoint(null)
          setScaleMenu({ clientX: event.clientX, clientY: event.clientY, ratio })
          return
        }
        setScaleMenu(null)
        const price = series.coordinateToPrice(localY)
        if (price == null) return
        const rawTime = chart.timeScale().coordinateToTime(localX)
        let resolvedTime: number | null = null
        if (typeof rawTime === 'number' && Number.isFinite(rawTime)) {
          resolvedTime = rawTime
        } else if (rawTime && typeof rawTime === 'object' && 'year' in rawTime) {
          const bd = rawTime as { year: number; month: number; day: number }
          resolvedTime = Math.floor(Date.UTC(bd.year, bd.month - 1, bd.day) / 1000)
        } else {
          // Empty margin / future whitespace: snap to nearest loaded candle by logical index.
          const logical = chart.timeScale().coordinateToLogical(localX)
          if (logical != null && seriesCandles.length > 0) {
            const idx = Math.min(
              seriesCandles.length - 1,
              Math.max(0, Math.round(Number(logical)))
            )
            const t = seriesCandles[idx]?.time
            if (typeof t === 'number' && Number.isFinite(t)) resolvedTime = t
          }
        }
        const hovered = drawingManagerRef.current?.hoveredId() ?? null
        const selected = useDrawingUiStore.getState().selectedIds
        const drawingId = hovered ?? (selected.length === 1 ? selected[0] : null)
        setContextMenu({
          x: localX,
          y: localY,
          price: Number(price),
          time: resolvedTime,
          drawingId
        })
      }}
      onMouseMove={(event) => {
        if (!priceScaleSettings.plusButton || scaleMenu) {
          if (plusPoint) setPlusPoint(null)
          return
        }
        const chart = chartRef.current
        const series = seriesRef.current
        const rect = containerRef.current?.getBoundingClientRect()
        if (!chart || !series || !rect) return
        const localX = event.clientX - rect.left
        const localY = event.clientY - rect.top
        const hit = priceScaleHit(
          localX,
          rect.width,
          priceScaleWidth(chart, 'left'),
          priceScaleWidth(chart, 'right')
        )
        if (!hit) {
          if (plusPoint) setPlusPoint(null)
          return
        }
        const price = series.coordinateToPrice(localY)
        if (price == null) {
          if (plusPoint) setPlusPoint(null)
          return
        }
        const nextPrice = Number(price)
        setPlusPoint((prev) =>
          prev && Math.abs(prev.y - localY) < 1 && prev.price === nextPrice
            ? prev
            : { y: localY, price: nextPrice }
        )
      }}
      onMouseLeave={() => setPlusPoint(null)}
      onDoubleClick={(event) => {
        if (!isPrimary) return
        const mgr = drawingManagerRef.current
        if (!mgr) return
        const hovered = mgr.hoveredId()
        const selected = useDrawingUiStore.getState().selectedIds
        const id = hovered ?? (selected.length === 1 ? selected[0] : null)
        if (!id) return
        event.preventDefault()
        mgr.select([id])
        useDrawingUiStore.getState().openObjectDialog(id)
      }}
    >
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      <img
        src={themedWordmarkUrl(theme)}
        alt=""
        className="pointer-events-none absolute left-1/2 top-[58%] z-[1] h-auto w-[min(48%,380px)] -translate-x-1/2 -translate-y-1/2 opacity-[0.08] select-none"
        aria-hidden
      />
      {chartReady && (
        <>
          <div className="pointer-events-none absolute left-1 top-1 z-[5] flex flex-col items-start gap-0.5">
            <OhlcLegend
              chart={chartReady.chart}
              series={chartReady.series}
              candles={seriesCandles}
              pricePrecision={pricePrecision}
            />
            <ActiveIndicatorsLegend />
          </div>
          {smcScene && (
            <SmcOverlay
              chart={chartReady.chart}
              series={chartReady.series}
              paneTimeframe={timeframe}
              paneCandles={seriesCandles}
              scene={smcScene}
            />
          )}
          <DrawingOverlay
            chart={chartReady.chart}
            series={chartReady.series}
            paneTimeframe={timeframe}
            paneCurrentCandle={currentCandle}
            paneCandles={seriesCandles}
            pricePrecision={pricePrecision}
          />
          {rewindPick && mode === 'replay' ? (
            <BarRewindPickOverlay
              chart={chartReady.chart}
              candles={seriesCandles}
              onPick={(time) => {
                useReplayStore.getState().setRewindPick(false)
                void useReplayStore.getState().jumpToTime(time, { source: 'jump' })
              }}
            />
          ) : null}
          {isPrimary ? <DrawingSelectionBar /> : null}
        </>
      )}
      {empty && (
        <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-zinc-950/40 px-4 text-center text-sm text-zinc-500">
          {mode === 'replay' ? 'No candles in this replay window yet.' : 'No candles to display.'}
        </div>
      )}
      {countdownText && countdownY != null ? (
        <div
          className={`pointer-events-none absolute z-[4] rounded bg-zinc-800/95 px-1 py-0.5 text-[10px] font-medium tabular-nums text-zinc-100 ${
            priceScaleSettings.scaleOnLeft ? 'left-1' : 'right-1'
          }`}
          style={{ top: countdownY + 16 }}
        >
          {countdownText}
        </div>
      ) : null}
      {plusPoint && priceScaleSettings.plusButton && !scaleMenu ? (
        <PriceScalePlus
          y={plusPoint.y}
          price={plusPoint.price}
          pricePrecision={pricePrecision}
          onLeft={priceScaleSettings.scaleOnLeft}
        />
      ) : null}
      {contextMenu && (
        <ChartContextMenu
          point={contextMenu}
          pricePrecision={pricePrecision}
          onClose={() => setContextMenu(null)}
        />
      )}
      {scaleMenu && (
        <PriceScaleMenu
          clientX={scaleMenu.clientX}
          clientY={scaleMenu.clientY}
          ratio={scaleMenu.ratio}
          onClose={() => setScaleMenu(null)}
        />
      )}
    </div>
  )
}
