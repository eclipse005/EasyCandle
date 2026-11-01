import { create } from 'zustand'
import { buildReplayWindowMs } from '@/lib/replayWindow'
import {
  focusHistoryRange,
  forwardRange,
  historyRange,
  IMPORT_FOCUS_MAX_BARS,
  IMPORT_PREFETCH_BATCH_BARS,
  mergeLoadedWindow,
  replayRange,
  tailRange
} from '@/lib/importWindow'
import { aggregateToTimeframe, overlayFormingHigherTf } from '@shared/candleAggregate'
import { floorOpenForTimeframe, importedForexSessionOffset } from '@shared/forexSession'
import { backfillMissingDerivedTimeframes } from '@/lib/webApiBridge'
import { dedupeCandlesByTime, findIndexAtOrBefore, mergeCandlesByTime, type Candle } from '@shared/candleUtils'
import { normalizeSymbolKey } from '@shared/pricePrecision'
import {
  isMetatraderImport,
  type DataSource,
  type ImportedDatasetMeta,
  type ImportLoadRange,
  type ImportLoadedWindow
} from '@shared/importTypes'
import { getIndicator } from '@/lib/indicators'
import { useSymbolParamsStore } from '@/store/symbolParamsStore'
import {
  clampRiskReward,
  clampTradeSizeForSymbol,
  closePosition,
  closePositionPartial,
  DEFAULT_LOTS,
  DEFAULT_RISK_REWARD,
  evaluatePendingFill,
  evaluateStopTakeProfit,
  fillPriceWithSpread,
  historicOrderFromMarketFill,
  historicOrderFromPending,
  isPendingTicketType,
  openPosition,
  pendingKindForEntry,
  pendingToPosition,
  placePendingLimit,
  pnlScaleForSymbol,
  rewindTradesToTime,
  hasTradeActivityAfter,
  stopLossFromTakeProfit,
  summarizeSession,
  takeProfitFromStopLoss,
  ticketEntryPrice,
  linkedTicketOpposite,
  withPendingPrice,
  withPendingStopLoss,
  withPendingTakeProfit,
  withStopLoss,
  withTakeProfit,
  type ClosedTrade,
  type HistoricOrder,
  type PendingOrder,
  type Position,
  type PnlScale,
  type SessionSummary,
  type PendingOrderKind,
  type TicketOrderType,
  type TicketDraftLevels,
  type TradeCosts,
  type TradeRewindResult
} from '@/lib/paperTrade'

export type LevelSetOptions = {
  /**
   * Guide only: when placing the first level, fill the missing opposite at the
   * configured R:R. Never used for later manual moves.
   */
  linkRr?: boolean
  /** Target a specific open position or pending order. Defaults to the selection. */
  id?: string
}

/** Pick a TP/SL/limit price from the chart (order-ticket crosshair handle). */
export type PricePickKind = 'tp' | 'sl' | 'limit'

const EMPTY_TICKET_LEVELS: {
  ticketTakeProfit: number | null
  ticketStopLoss: number | null
  ticketLimitPrice: number | null
  pricePick: PricePickKind | null
} = {
  ticketTakeProfit: null,
  ticketStopLoss: null,
  ticketLimitPrice: null,
  pricePick: null
}

const EMPTY_WORKING_TRADES = {
  positions: [] as Position[],
  pendingOrders: [] as PendingOrder[],
  selectedWorkingId: null as string | null
}

import { createReplayEngine, replayTickMs, type ReplayStatus } from '@/lib/replayEngine'
import { isChartType, type ChartType } from '@/lib/chart/chartTypes'
import { isTimeInSeriesRange } from '@/lib/chart/drawingTimeScale'
import { focusHistoryBars, FOCUS_LOOKBACK_BARS } from '@/lib/chart/focusRange'
import {
  cloneDrawing as cloneDrawingGeom,
  drawingToolType,
  isDrawTool,
  isPositionDrawing,
  isPositionTool,
  isTwoPointTool,
  isValidPositionLevel,
  POSITION_SPAN_DEFAULT,
  POSITION_SPAN_MAX,
  POSITION_SPAN_MIN,
  remapDrawingTimes,
  translateDrawing,
  updateFibChannelHandle as updateFibChannelHandleGeom,
  updateRectHandle as updateRectHandleGeom,
  updateTwoPointEndpoint as updateTwoPointEndpointGeom,
  type Drawing,
  type DrawingStyle,
  type DrawTool,
  type Endpoint,
  type FibChannelHandle,
  type FibLevelConfig,
  type PositionDrawing,
  type PositionLevel,
  type RectHandle,
  type TrendPoint
} from '@/lib/chart/drawingGeometry'
import { defaultFibLevelsForTool, defaultStyleForTool } from '@/store/drawingSettingsStore'
import {
  alignTimeToInterval,
  DEFAULT_TIMEFRAME,
  defaultSecondaryTimeframe,
  followerPlayheadCover,
  coarserTouchedCover,
  playheadCoverEnd,
  resolveTimestepAfterChartTfChange,
  resolveTimestepOnSyncEnable,
  timestepStepCoverEnd,
  TIMEFRAMES
} from '@shared/timeframes'

export type ChartStatus = 'idle' | 'loading' | 'ready' | 'error'
export type ViewMode = 'live' | 'replay'
export type ChartSyncKind = 'replace' | 'append'
export type DriverPane = 'primary' | 'secondary'
export type { DataSource, ImportedDatasetMeta }
export type {
  Drawing,
  DrawTool,
  Endpoint,
  FibChannelDrawing,
  FibChannelHandle,
  FibDrawing,
  FibLevelConfig,
  HLineDrawing,
  PositionDrawing,
  PositionLevel,
  RectDrawing,
  RectHandle,
  TrendDrawing,
  TrendPoint
} from '@/lib/chart/drawingGeometry'

/** Shown when a focus target cannot be brought onto the chart. */
export const FOCUS_OUT_OF_RANGE_MESSAGE =
  'Could not load that time — it is outside the available candles.'

export type ChartSync = {
  kind: ChartSyncKind
  fitContent: boolean
  revision: number
}

/**
 * One-shot "scroll the viewport here" command. Unlike `ChartSync` it never
 * touches the series or the playhead — panes only move their visible range.
 */
export type ChartFocus = {
  /** UTC seconds to bring into view. */
  time: number
  revision: number
}

export type TradeMarker = {
  time: number
  position: 'aboveBar' | 'belowBar'
  color: string
  shape: 'arrowUp' | 'arrowDown'
  text: string
}

/** FX Replay–style entry marker: long → B below, short → S above. */
export function tradeMarkerForSide(side: 'long' | 'short', time: number): TradeMarker {
  return {
    time,
    position: side === 'long' ? 'belowBar' : 'aboveBar',
    color: side === 'long' ? '#06A77D' : '#ED6A5A',
    shape: side === 'long' ? 'arrowUp' : 'arrowDown',
    text: side === 'long' ? 'B' : 'S'
  }
}

/** Closing marker is the opposite side (long exit → S, short exit → B). */
export function tradeMarkerForExit(openSide: 'long' | 'short', time: number): TradeMarker {
  return tradeMarkerForSide(openSide === 'long' ? 'short' : 'long', time)
}

export type SessionReport = {
  symbol: string
  timeframe: string
  trades: ClosedTrade[]
  summary: SessionSummary
  closedOpenOnExit: boolean
  /** Session starting balance used for the equity curve (quote currency). */
  startingBalance?: number
}

let drawingSeq = 0
let tradeSeq = 0

function nextDrawingId(): string {
  drawingSeq += 1
  return `d-${drawingSeq}`
}

function nextTradeId(): string {
  tradeSeq += 1
  return `t-${Date.now().toString(36)}-${tradeSeq}`
}

function emptyDrawingState(): {
  drawTool: DrawTool
  drawings: Drawing[]
  pendingTrend: null
  pendingTrendEnd: null
  selectedDrawingId: null
} {
  return {
    drawTool: 'select',
    drawings: [],
    pendingTrend: null,
    pendingTrendEnd: null,
    selectedDrawingId: null
  }
}

function remapDrawingsToInterval(drawings: Drawing[], intervalSec: number): Drawing[] {
  return drawings.map((drawing) => remapDrawingTimes(drawing, intervalSec))
}

function remapPendingTrendToInterval(
  pending: TrendPoint | null,
  intervalSec: number
): TrendPoint | null {
  if (pending == null) return null
  return {
    time: alignTimeToInterval(pending.time, intervalSec),
    price: pending.price
  }
}

function remapPendingOrderToInterval(pending: PendingOrder, intervalSec: number): PendingOrder {
  return {
    ...pending,
    placedTime: alignTimeToInterval(pending.placedTime, intervalSec)
  }
}

function remapPendingOrdersToInterval(
  orders: PendingOrder[],
  intervalSec: number
): PendingOrder[] {
  return orders.map((order) => remapPendingOrderToInterval(order, intervalSec))
}

function remapPositionTimes(open: Position, intervalSec: number): Position {
  return {
    ...open,
    entryTime: alignTimeToInterval(open.entryTime, intervalSec),
    pendingPlacedTime:
      open.pendingPlacedTime != null
        ? alignTimeToInterval(open.pendingPlacedTime, intervalSec)
        : open.pendingPlacedTime
  }
}

function remapPositionsTimes(opens: Position[], intervalSec: number): Position[] {
  return opens.map((open) => remapPositionTimes(open, intervalSec))
}

function remapOrderHistoryToInterval(
  orders: HistoricOrder[],
  intervalSec: number
): HistoricOrder[] {
  return orders.map((order) => ({
    ...order,
    placedTime: alignTimeToInterval(order.placedTime, intervalSec),
    updateTime: alignTimeToInterval(order.updateTime, intervalSec)
  }))
}

const engine = createReplayEngine()
const secondaryEngine = createReplayEngine()

/**
 * Wall-clock cursor for the shared Timestep. It starts at the current chart
 * bar open and accumulates step periods, so a 1m step on a 15m chart crosses
 * into the next bar only after 15 ticks.
 */
let stepCursor: number | null = null
let stepCursorIndex: number | null = null

function resetStepCursor(): void {
  stepCursor = null
  stepCursorIndex = null
}

function loadPrimaryEngine(candles: Candle[]): void {
  resetStepCursor()
  engine.load(candles)
}

let clockTimer: ReturnType<typeof setInterval> | null = null
let loadGeneration = 0
let replayRequestId = 0
let secondaryLoadGeneration = 0
let prefetchInFlight = false
/** Guards `focusChartTime` so repeated clicks cannot stack history fetches. */
let focusInFlight = false

function clearClock(): void {
  if (clockTimer != null) {
    clearInterval(clockTimer)
    clockTimer = null
  }
}

function tickMs(): number {
  return replayTickMs(engine.getState().speed || 1)
}

function intervalSecondsFor(timeframe: string): number {
  return TIMEFRAMES[timeframe]?.seconds ?? TIMEFRAMES[DEFAULT_TIMEFRAME].seconds
}

/** Mark candle for P&L / waiting-price follow: the finer pane in split replay. */
export function selectPriceFollowCandle(s: {
  chartSplit: boolean
  timeframe: string
  secondaryTimeframe: string
  currentCandle: Candle | null
  secondaryCurrentCandle: Candle | null
}): Candle | null {
  if (!s.chartSplit) return s.currentCandle
  if (intervalSecondsFor(s.secondaryTimeframe) < intervalSecondsFor(s.timeframe)) {
    return s.secondaryCurrentCandle
  }
  return s.currentCandle
}

function displayedFromSource(source1m: Candle[], timeframe: string): Candle[] {
  if (!source1m.length) return []
  return aggregateToTimeframe(source1m, timeframe)
}

function importHasTimeframe<T extends { timeframes?: Record<string, unknown> }>(
  meta: T | null | undefined,
  tf: string
): meta is T {
  if (!meta?.timeframes) return false
  if (meta.timeframes[tf] != null) return true
  // Lazy + migration: any listed TF can be built from stored 1m.
  return tf !== '1m' && meta.timeframes['1m'] != null && Boolean(TIMEFRAMES[tf])
}

/** Patch a coarser pane's current bar from the finer pane's playhead (live-style). */
function overlayCoarserIfSplit(
  which: 'primary' | 'secondary',
  visible: Candle[],
  current: Candle | null
): { visible: Candle[]; current: Candle | null } {
  const s = useReplayStore.getState()
  if (!s.chartSplit) return { visible, current }

  const primarySec = intervalSecondsFor(s.timeframe)
  const secondarySec = intervalSecondsFor(s.secondaryTimeframe)
  const thisSec = which === 'primary' ? primarySec : secondarySec
  const otherSec = which === 'primary' ? secondarySec : primarySec
  if (thisSec <= otherSec) return { visible, current }

  const finerVisible =
    which === 'primary' ? secondaryEngine.getVisibleCandles() : engine.getVisibleCandles()
  const paneTf = which === 'primary' ? s.timeframe : s.secondaryTimeframe
  const sessionOffset = s.dataSource === 'imported' ? importedForexSessionOffset(paneTf) : undefined
  const next = overlayFormingHigherTf(visible, finerVisible, thisSec, sessionOffset)
  return { visible: next, current: next[next.length - 1] ?? current }
}

/** Status line for a loaded imported window: shows window vs. total coverage. */
function importedLoadMessage(
  meta: ImportedDatasetMeta,
  loadedWindow: ImportLoadedWindow | null,
  prefix = 'Imported'
): string {
  const total = meta.timeframes?.[meta.timeframe]?.candleCount ?? meta.candleCount
  const label = `${prefix} ${meta.symbol} ${meta.timeframe}`
  if (!loadedWindow || !loadedWindow.totalCount) {
    return `${label} · ${total.toLocaleString()} candles`
  }
  const loaded = loadedWindow.hasMoreBefore || loadedWindow.hasMoreAfter
  if (!loaded) return `${label} · ${loadedWindow.totalCount.toLocaleString()} candles`
  return `${label} · ${loadedWindow.totalCount.toLocaleString()} candles (windowed)`
}

function emptySecondaryPaneState(): {
  secondaryCandles: Candle[]
  secondaryVisibleCandles: Candle[]
  secondaryCurrentCandle: Candle | null
  secondaryReplayIndex: number
  secondaryBufferLength: number
  secondaryStatus: ChartStatus
  secondaryError: string | null
  secondaryLoading: boolean
} {
  return {
    secondaryCandles: [],
    secondaryVisibleCandles: [],
    secondaryCurrentCandle: null,
    secondaryReplayIndex: 0,
    secondaryBufferLength: 0,
    secondaryStatus: 'idle',
    secondaryError: null,
    secondaryLoading: false
  }
}

/** Rebuild the primary pane's current bar from the 1m source while a finer
 * Timestep is still inside that bar. */
function overlayFormingPrimaryFromSource(
  visible: Candle[],
  current: Candle | null
): { visible: Candle[]; current: Candle | null } {
  const s = useReplayStore.getState()
  const chartSec = intervalSecondsFor(s.timeframe)
  const stepSec = intervalSecondsFor(s.replayTimestep)
  if (stepSec >= chartSec) return { visible, current }
  const source = s.importedSourceCandles
  if (!source.length) return { visible, current }

  const anchor = current?.time ?? visible[visible.length - 1]?.time
  if (anchor == null) return { visible, current }
  const cursor = Math.max(stepCursor ?? anchor, anchor)
  const end = findIndexAtOrBefore(source, cursor)
  if (end < 0) return { visible, current }

  const lastSourceTime = source[end]?.time
  const barCover = playheadCoverEnd(anchor, chartSec)
  if (lastSourceTime == null || lastSourceTime < anchor || lastSourceTime > barCover) {
    return { visible, current }
  }

  // Two coarser buckets are enough for the forming-bar helper.
  const windowSize = Math.max(2, Math.ceil(chartSec / 60) * 2 + 2)
  const start = Math.max(0, end - windowSize + 1)
  const finer = source.slice(start, end + 1)
  const sessionOffset =
    s.dataSource === 'imported' ? importedForexSessionOffset(s.timeframe) : undefined
  const next = overlayFormingHigherTf(visible, finer, chartSec, sessionOffset)
  return { visible: next, current: next[next.length - 1] ?? current }
}

function engineSnapshot(): {
  replayStatus: ReplayStatus
  isPlaying: boolean
  speed: number
  replayIndex: number
  visibleCandles: Candle[]
  currentCandle: Candle | null
  bufferLength: number
} {
  const state = engine.getState()
  const overlay = overlayCoarserIfSplit(
    'primary',
    engine.getVisibleCandles(),
    engine.getCurrentCandle()
  )
  const formed = overlayFormingPrimaryFromSource(overlay.visible, overlay.current)
  return {
    replayStatus: state.status,
    isPlaying: state.isPlaying,
    speed: state.speed,
    replayIndex: state.index,
    visibleCandles: formed.visible,
    currentCandle: formed.current,
    bufferLength: state.candles.length
  }
}

function secondarySnapshot(): {
  secondaryCandles: Candle[]
  secondaryVisibleCandles: Candle[]
  secondaryCurrentCandle: Candle | null
  secondaryReplayIndex: number
  secondaryBufferLength: number
} {
  const state = secondaryEngine.getState()
  const overlay = overlayCoarserIfSplit(
    'secondary',
    secondaryEngine.getVisibleCandles(),
    secondaryEngine.getCurrentCandle()
  )
  return {
    secondaryCandles: state.candles,
    secondaryVisibleCandles: overlay.visible,
    secondaryCurrentCandle: overlay.current,
    secondaryReplayIndex: state.index,
    secondaryBufferLength: state.candles.length
  }
}

export type SeekConfirmSource = 'jump' | 'replay-to' | 'scrub'

export type PendingSeekConfirm =
  | { kind: 'index'; index: number; resumeIndex: number; source?: SeekConfirmSource }
  | { kind: 'time'; time: number; resumeIndex: number; source?: SeekConfirmSource }

export type SeekApplyResult = 'applied' | 'needs-confirm' | 'noop'

type ReplayStore = {
  symbol: string
  timeframe: string
  candles: Candle[]
  status: ChartStatus
  error: string | null
  mode: ViewMode
  dataSource: DataSource
  importMeta: ImportedDatasetMeta | null
  importedCandles: Candle[]
  /** Coverage of the imported window currently in memory (null when full/none). */
  importWindow: ImportLoadedWindow | null
  /** Persisted MT imports shown in the symbol dropdown. */
  importedList: ImportedDatasetMeta[]
  /** Unsaved EA history shown in the import dialog. */
  /** 1m series for the active MetaTrader import (live updates + higher TF). */
  importedSourceCandles: Candle[]
  replayStatus: ReplayStatus
  isPlaying: boolean
  speed: number
  replayIndex: number
  bufferLength: number
  visibleCandles: Candle[]
  currentCandle: Candle | null
  chartSync: ChartSync
  /** One-shot viewport focus request for the panes (see `focusChartTime`). */
  chartFocus: ChartFocus | null
  isPrefetching: boolean
  replayLoading: boolean
  replayMessage: string | null
  activeIndicators: string[]
  /** Chart rendering style shared by both panes. */
  chartType: ChartType
  drawTool: DrawTool
  drawings: Drawing[]
  /** First-click anchor for two-point tools (trendline, fib, rect) and fib channel. */
  pendingTrend: TrendPoint | null
  /** Second-click anchor while placing a fib channel (P1–P2 base). */
  pendingTrendEnd: TrendPoint | null
  /** Drawing selected with the Select tool — target for the Delete shortcut. */
  selectedDrawingId: string | null
  positions: Position[]
  pendingOrders: PendingOrder[]
  selectedWorkingId: string | null
  closedTrades: ClosedTrade[]
  /** Filled market/limit orders and canceled pending limits. */
  orderHistory: HistoricOrder[]
  sessionReport: SessionReport | null
  /** Reward multiple of risk for linked SL/TP (default 2 → 1:2). */
  riskReward: number
  /** Lots (FX/metals) or coin amount (crypto) used on the next open. */
  tradeSize: number
  /** TP/SL/limit for the next order. Copied onto that fill, then cleared. */
  ticketTakeProfit: number | null
  ticketStopLoss: number | null
  ticketLimitPrice: number | null
  /** Market vs limit tab on the order ticket. */
  ticketOrderType: TicketOrderType
  /** Chart pick mode from the order-ticket TP/SL/limit handle. */
  pricePick: PricePickKind | null
  /** Scissors pick mode: click a bar on the chart to rewind there. */
  rewindPick: boolean
  chartSplit: boolean
  secondaryTimeframe: string
  driverPane: DriverPane
  /** Shared Replay Timestep TF id — drives step/play for every pane (FXR). */
  replayTimestep: string
  /** When true, Timestep mirrors primary chart TF changes (default). */
  syncTimestepWithChart: boolean
  secondaryCandles: Candle[]
  secondaryVisibleCandles: Candle[]
  secondaryCurrentCandle: Candle | null
  secondaryReplayIndex: number
  secondaryBufferLength: number
  secondaryChartSync: ChartSync
  secondaryStatus: ChartStatus
  secondaryError: string | null
  secondaryLoading: boolean
  /** SoftConfirm payload when a backward seek would discard later trades. */
  pendingSeekConfirm: PendingSeekConfirm | null
  /** True while the progress scrubber is dragging — chart drops heavy overlays. */
  chartScrubbing: boolean
  toggleIndicator: (id: string) => void
  setChartType: (type: ChartType) => void
  setDrawTool: (tool: DrawTool) => void
  addHorizontalLine: (price: number) => void
  updateHorizontalLine: (id: string, price: number) => void
  addTwoPoint: (point: TrendPoint) => void
  updateTwoPointEndpoint: (id: string, end: Endpoint, point: TrendPoint) => void
  addFibChannelPoint: (point: TrendPoint) => void
  updateFibChannelHandle: (id: string, handle: FibChannelHandle, point: TrendPoint) => void
  updateRectHandle: (id: string, handle: RectHandle, point: TrendPoint) => void
  addPosition: (point: TrendPoint, levels?: { target: number | null; stop: number | null }) => void
  updatePositionLevel: (id: string, level: PositionLevel, price: number) => void
  clearPositionLevel: (id: string, level: PositionLevel) => void
  updatePositionEntry: (id: string, price: number) => void
  updatePositionSpan: (id: string, span: number) => void
  cloneDrawing: (id: string) => string | null
  moveDrawing: (id: string, origin: Drawing, dTime: number, dPrice: number) => void
  replaceDrawing: (next: Drawing) => void
  updateDrawingStyle: (id: string, patch: Partial<DrawingStyle>) => void
  updateDrawingLevels: (id: string, levels: FibLevelConfig[]) => void
  selectDrawing: (id: string | null) => void
  deleteDrawing: (id: string) => void
  clearDrawings: () => void
  paperBuy: () => void
  paperSell: () => void
  paperClose: (id?: string) => void
  /** Close ≥50% (or 100%) of an open position. */
  paperClosePartial: (fraction: number, id?: string) => void
  placeLimit: (side: 'long' | 'short', price: number, kind?: PendingOrderKind) => void
  cancelPending: (id?: string) => void
  selectWorking: (id: string | null) => void
  setPendingPrice: (price: number) => void
  setRiskReward: (value: number) => void
  setTradeSize: (value: number) => void
  setTakeProfit: (price: number | null, opts?: LevelSetOptions) => void
  setStopLoss: (price: number | null, opts?: LevelSetOptions) => void
  setTicketTakeProfit: (price: number | null, opts?: LevelSetOptions) => void
  setTicketStopLoss: (price: number | null, opts?: LevelSetOptions) => void
  setTicketLimitPrice: (price: number | null) => void
  setTicketOrderType: (type: TicketOrderType) => void
  setPricePick: (kind: PricePickKind | null) => void
  setRewindPick: (active: boolean) => void
  applyPricePick: (price: number) => void
  dismissSessionReport: () => void
  /** Attach or clear a light journal note on a closed trade. */
  setClosedTradeNote: (tradeId: string, note: string | null) => void
  setSymbol: (symbol: string) => void
  setTimeframe: (timeframe: string) => void
  setChartSplit: (split: boolean) => void
  setSecondaryTimeframe: (timeframe: string) => void
  setDriverPane: (pane: DriverPane) => void
  setReplayTimestep: (timeframe: string) => void
  setSyncTimestepWithChart: (sync: boolean) => void
  /** When Sync is on, snap Timestep to primary chart TF (hydrate / session load). */
  ensureReplayTimestepAligned: () => void
  loadCandles: () => Promise<void>
  activateImportedDataset: (candles: Candle[], meta: ImportedDatasetMeta) => void
  clearImportedDataset: () => void
  refreshImportedList: () => Promise<void>
  selectImportedDataset: (id: string, timeframe?: string) => Promise<void>
  /**
   * Load + merge all imported CSV files for a symbol.
   * Overlapping timestamps: newer `updatedAt` wins.
   * Session `importId` is set to the primary (newest) dataset id.
   */
  selectImportedSymbol: (symbol: string, timeframe?: string) => Promise<void>
  /** Page older imported bars when the viewport reaches the oldest loaded candle. */
  loadImportedHistory: () => Promise<void>
  startImportedReplay: () => void
  startImportedReplayAt: (startIndex: number, opts?: { message?: string | null }) => void
  /** Start an imported replay at a UTC time, loading only the window it needs. */
  startImportedReplayAtTime: (
    startTimeSeconds: number,
    opts?: { message?: string | null; forwardBars?: number }
  ) => Promise<void>
  startReplayAt: (
    startTimeSeconds: number,
    opts?: { forwardBars?: number; message?: string | null }
  ) => Promise<void>
  jumpToTime: (timeSeconds: number, opts?: { force?: boolean; source?: SeekConfirmSource }) => Promise<SeekApplyResult>
  finalizeSessionTrades: () => SessionReport | null
  exitReplay: () => void
  resetReplayState: (opts?: { keepImport?: boolean; keepDrawings?: boolean }) => void
  play: () => void
  pause: () => void
  stepForward: () => void
  stepBackward: () => void
  setSpeed: (speed: number) => void
  /**
   * Seek playhead. Backward seeks rewind trades like stepBackward.
   * SoftConfirm when later trades would be discarded unless `force`.
   */
  setChartScrubbing: (active: boolean) => void
  seekToIndex: (index: number, opts?: { force?: boolean; preview?: boolean; source?: SeekConfirmSource }) => SeekApplyResult
  seekToTime: (timeSeconds: number, opts?: { force?: boolean }) => SeekApplyResult
  confirmPendingSeek: () => void
  cancelPendingSeek: () => void
  /**
   * Scroll both panes so a UTC time is visible, without moving the playhead.
   * Pages older candles in first when the target is not loaded yet.
   */
  focusChartTime: (timeSeconds: number) => Promise<void>
}

export const useReplayStore = create<ReplayStore>((set, get) => {
  function publishReplay(kind: ChartSyncKind, opts: { fitContent?: boolean } = {}): void {
    const snap = engineSnapshot()
    const fitContent = opts.fitContent ?? kind === 'replace'
    const enteringReplay = get().mode !== 'replay'
    set((s) => ({
      mode: 'replay',
      candles: engine.getState().candles,
      ...snap,
      ...(enteringReplay ? emptyDrawingState() : {}),
      chartSync: {
        kind,
        fitContent: kind === 'append' ? false : fitContent,
        revision: s.chartSync.revision + 1
      }
    }))
  }

  function publishSecondary(kind: ChartSyncKind, opts: { fitContent?: boolean } = {}): void {
    const fitContent = opts.fitContent ?? kind === 'replace'
    set((s) => ({
      ...secondarySnapshot(),
      secondaryStatus: 'ready',
      secondaryError: null,
      secondaryChartSync: {
        kind,
        fitContent: kind === 'append' ? false : fitContent,
        revision: s.secondaryChartSync.revision + 1
      }
    }))
  }

  function clearSecondaryPane(opts: { keepTimeframe?: boolean } = {}): void {
    secondaryLoadGeneration += 1
    secondaryEngine.load([])
    set((s) => ({
      ...emptySecondaryPaneState(),
      ...(opts.keepTimeframe ? {} : {}),
      secondaryChartSync: {
        kind: 'replace',
        fitContent: true,
        revision: s.secondaryChartSync.revision + 1
      }
    }))
  }

  function coverSeekOpts(): { pause: boolean } {
    return { pause: !get().isPlaying }
  }

  function syncSecondaryToPrimaryCover(opts: { fitContent?: boolean } = {}): void {
    if (!get().chartSplit) return
    if (get().mode !== 'replay') return
    const candle = engine.getCurrentCandle()
    if (!candle) return
    if (secondaryEngine.getState().candles.length === 0) return

    const driverSec = intervalSecondsFor(get().timeframe)
    const followerSec = intervalSecondsFor(get().secondaryTimeframe)
    const coverUntil = followerPlayheadCover(candle.time, driverSec, followerSec)
    const before = secondaryEngine.getState().index
    secondaryEngine.seekToTime(coverUntil, coverSeekOpts())
    const after = secondaryEngine.getState().index

    if (after === before) {
      if (followerSec > driverSec) {
        publishSecondary('append', { fitContent: opts.fitContent ?? false })
      }
      return
    }

    publishSecondary(after === before + 1 ? 'append' : 'replace', {
      fitContent: opts.fitContent ?? false
    })
  }

  function syncSecondaryToCursor(coverUntil: number, opts: { fitContent?: boolean } = {}): void {
    if (!get().chartSplit) return
    if (get().mode !== 'replay') return
    const driverSec = intervalSecondsFor(get().timeframe)
    const followerSec = intervalSecondsFor(get().secondaryTimeframe)
    if (followerSec >= driverSec) return
    if (secondaryEngine.getState().candles.length === 0) return

    const before = secondaryEngine.getState().index
    secondaryEngine.seekToTime(coverUntil, coverSeekOpts())
    const after = secondaryEngine.getState().index
    if (after === before) return
    publishSecondary(after === before + 1 ? 'append' : 'replace', {
      fitContent: opts.fitContent ?? false
    })
  }

  function syncSecondaryAfterStep(
    targetCover: number,
    opts: { fitContent?: boolean } = {}
  ): void {
    const stepSec = intervalSecondsFor(get().replayTimestep)
    const driverSec = intervalSecondsFor(get().timeframe)
    const followerSec = intervalSecondsFor(get().secondaryTimeframe)
    if (stepSec < driverSec && followerSec < driverSec) {
      syncSecondaryToCursor(targetCover, opts)
      return
    }
    syncSecondaryToPrimaryCover(opts)
  }

  function syncPrimaryToSecondaryCover(opts: { fitContent?: boolean } = {}): void {
    if (!get().chartSplit) return
    if (get().mode !== 'replay') return
    const candle = secondaryEngine.getCurrentCandle()
    if (!candle) return
    if (engine.getState().candles.length === 0) return

    const driverSec = intervalSecondsFor(get().secondaryTimeframe)
    const followerSec = intervalSecondsFor(get().timeframe)
    const coverUntil = followerPlayheadCover(candle.time, driverSec, followerSec)
    const target = findIndexAtOrBefore(engine.getState().candles, coverUntil)
    if (target < 0) return

    const before = engine.getState().index
    if (target === before) {
      if (followerSec > driverSec) {
        publishReplay('append', { fitContent: opts.fitContent ?? false })
      }
      return
    }

    if (target > before) {
      engine.seekToIndex(target, coverSeekOpts())
      publishReplay(target - before === 1 ? 'append' : 'replace', {
        fitContent: opts.fitContent ?? false
      })
      return
    }

    engine.seekToIndex(target, coverSeekOpts())
    publishReplay('replace', { fitContent: opts.fitContent ?? false })
  }

  function applyRewindResult(rewound: TradeRewindResult): void {
    set({
      positions: rewound.positions,
      pendingOrders: rewound.pendingOrders,
      closedTrades: rewound.closedTrades,
      orderHistory: rewound.orderHistory,
      selectedWorkingId: workingIdStillOpen(
        get().selectedWorkingId,
        rewound.positions,
        rewound.pendingOrders
      ),
      replayMessage: null
    })
  }

  function rewindPrimaryToIndex(target: number, opts: { rewindTrades?: boolean } = {}): void {
    const rewindTrades = opts.rewindTrades !== false
    const before = engine.getState().index
    const candles = engine.getState().candles
    if (!candles.length) return
    const clamped = Math.min(candles.length - 1, Math.max(0, Math.floor(target)))
    if (clamped === before) return

    if (clamped > before) {
      engine.seekToIndex(clamped)
      return
    }

    if (rewindTrades) {
      const targetCandle = candles[clamped]
      if (targetCandle) {
        const intervalSec = intervalSecondsFor(get().timeframe)
        applyRewindResult(
          rewindTradesToTime({
            positions: get().positions,
            pendingOrders: get().pendingOrders,
            closedTrades: get().closedTrades,
            orderHistory: get().orderHistory,
            targetCandleTime: targetCandle.time,
            keepUntil: playheadCoverEnd(targetCandle.time, intervalSec)
          })
        )
      }
    }

    engine.seekToIndex(clamped)
  }

  function tradeActivityAfterIndex(index: number): boolean {
    const candles = engine.getState().candles
    if (!candles.length) return false
    const clamped = Math.min(candles.length - 1, Math.max(0, Math.floor(index)))
    const targetCandle = candles[clamped]
    if (!targetCandle) return false
    const keepUntil = playheadCoverEnd(targetCandle.time, intervalSecondsFor(get().timeframe))
    return hasTradeActivityAfter({
      positions: get().positions,
      pendingOrders: get().pendingOrders,
      closedTrades: get().closedTrades,
      orderHistory: get().orderHistory,
      targetCandleTime: targetCandle.time,
      keepUntil
    })
  }

  function publishSeekReplace(
    fitContent: boolean,
    opts: { syncSecondary?: boolean } = {}
  ): void {
    publishReplay('replace', { fitContent })
    if (opts.syncSecondary !== false) {
      syncSecondaryToPrimaryCover({ fitContent })
    }
    publishStatus()
  }

  /** Move playhead only — used while scrubbing before SoftConfirm commits trades. */
  function seekPlayheadOnly(
    index: number,
    fitContent = false,
    opts: { syncSecondary?: boolean } = {}
  ): void {
    stopClock()
    engine.seekToIndex(index)
    publishSeekReplace(fitContent, opts)
  }

  function applySeekToIndex(index: number, opts: { fitContent?: boolean } = {}): void {
    stopClock()
    const before = engine.getState().index
    const candles = engine.getState().candles
    if (!candles.length) return
    const clamped = Math.min(candles.length - 1, Math.max(0, Math.floor(index)))
    if (clamped === before) {
      publishStatus()
      return
    }
    if (clamped > before) {
      engine.seekToIndex(clamped)
      publishSeekReplace(opts.fitContent ?? false)
      return
    }
    rewindPrimaryToIndex(clamped, { rewindTrades: true })
    publishSeekReplace(opts.fitContent ?? false)
  }

  function requestSeekToIndex(
    index: number,
    opts: { force?: boolean; preview?: boolean; fitContent?: boolean; source?: SeekConfirmSource } = {}
  ): SeekApplyResult {
    resetStepCursor()
    if (get().mode !== 'replay') return 'noop'
    if (get().replayLoading || get().secondaryLoading) return 'noop'

    const candles = engine.getState().candles
    if (!candles.length) return 'noop'
    const clamped = Math.min(candles.length - 1, Math.max(0, Math.floor(Number(index))))
    if (!Number.isFinite(clamped)) return 'noop'
    const before = engine.getState().index
    if (clamped === before) {
      set({ pendingSeekConfirm: null })
      return 'noop'
    }

    // Live scrub preview: move candles only; blotter catches up on pointer-up / confirm.
    if (opts.preview) {
      seekPlayheadOnly(clamped, opts.fitContent ?? false, { syncSecondary: false })
      return 'applied'
    }

    if (clamped < before && !opts.force && tradeActivityAfterIndex(clamped)) {
      set({
        pendingSeekConfirm: {
          kind: 'index',
          index: clamped,
          resumeIndex: before,
          source: opts.source ?? 'scrub'
        }
      })
      // Preview the destination playhead so the user sees where Jump/scrub lands.
      seekPlayheadOnly(clamped, opts.fitContent ?? false, { syncSecondary: false })
      return 'needs-confirm'
    }

    set({ pendingSeekConfirm: null })
    applySeekToIndex(clamped, { fitContent: opts.fitContent })
    return 'applied'
  }

  function priceFollowPane(): DriverPane {
    if (!get().chartSplit) return 'primary'
    const primarySec = intervalSecondsFor(get().timeframe)
    const secondarySec = intervalSecondsFor(get().secondaryTimeframe)
    if (secondarySec < primarySec) return 'secondary'
    return 'primary'
  }

  function priceFollowCandle(): Candle | null {
    if (priceFollowPane() === 'secondary') {
      return secondaryEngine.getCurrentCandle() || get().secondaryCurrentCandle
    }
    return get().currentCandle || engine.getCurrentCandle()
  }

  type WaitingPriceEvent = 'fill' | 'tp' | 'sl'

  function revealCoarserTouchedAt(touchOpen: number): void {
    if (!get().chartSplit) return
    const primarySec = intervalSecondsFor(get().timeframe)
    const secondarySec = intervalSecondsFor(get().secondaryTimeframe)
    if (secondarySec === primarySec) return

    const coarseIsSecondary = secondarySec > primarySec
    const coarseSec = Math.max(primarySec, secondarySec)
    const coverUntil = coarserTouchedCover(touchOpen, coarseSec)
    const coarseEngine = coarseIsSecondary ? secondaryEngine : engine
    const target = findIndexAtOrBefore(coarseEngine.getState().candles, coverUntil)
    if (target < 0) return

    const before = coarseEngine.getState().index
    if (target !== before) {
      coarseEngine.seekToIndex(target, coverSeekOpts())
    }

    // Always publish: the HTF bar is often already visible as a forming candle,
    // and it still needs the touch bar's OHLC. Skipping that left the 1h wick
    // and the closed-trade drawing short of the TP/SL candle.
    const after = coarseEngine.getState().index
    const kind = after === before || after === before + 1 ? 'append' : 'replace'
    if (coarseIsSecondary) {
      publishSecondary(kind, { fitContent: false })
    } else {
      publishReplay(kind, { fitContent: false })
    }
  }

  function scanFinerHits(
    which: DriverPane,
    fromIndex: number,
    toIndex: number
  ): WaitingPriceEvent | null {
    const followEngine = which === 'secondary' ? secondaryEngine : engine
    const candles = followEngine.getState().candles
    const start = Math.max(0, fromIndex)
    const end = Math.min(toIndex, candles.length - 1)
    if (start > end) return null

    let fillIndex = -1
    for (let i = start; i <= end; i += 1) {
      const candle = candles[i]
      if (!candle) continue
      const event = applyWaitingPricesOnCandle(candle)
      if (event === 'tp' || event === 'sl') {
        if (followEngine.getState().index !== i) {
          followEngine.seekToIndex(i, coverSeekOpts())
          if (which === 'secondary') publishSecondary('replace', { fitContent: false })
          else publishReplay('replace', { fitContent: false })
        }
        revealCoarserTouchedAt(candle.time)
        return event
      }
      if (event === 'fill') fillIndex = i
    }

    if (fillIndex >= 0) {
      revealCoarserTouchedAt(candles[fillIndex].time)
      return 'fill'
    }
    return null
  }

  function workingIdStillOpen(
    id: string | null,
    positions: Position[],
    pendingOrders: PendingOrder[]
  ): string | null {
    if (!id) return null
    if (positions.some((p) => p.id === id) || pendingOrders.some((p) => p.id === id)) return id
    return null
  }

  function resolveWorkingId(id?: string | null): string | null {
    return id ?? get().selectedWorkingId
  }

  function findPositionById(id: string | null | undefined): Position | undefined {
    if (!id) return undefined
    return get().positions.find((p) => p.id === id)
  }

  function findPendingById(id: string | null | undefined): PendingOrder | undefined {
    if (!id) return undefined
    return get().pendingOrders.find((p) => p.id === id)
  }

  function patchPosition(id: string, next: Position, extra?: Record<string, unknown>): void {
    set((s) => ({
      positions: s.positions.map((p) => (p.id === id ? next : p)),
      replayMessage: null,
      ...extra
    }))
  }

  function patchPending(id: string, next: PendingOrder, extra?: Record<string, unknown>): void {
    set((s) => ({
      pendingOrders: s.pendingOrders.map((p) => (p.id === id ? next : p)),
      replayMessage: null,
      ...extra
    }))
  }

  function currentPnlScale(lots?: number): PnlScale {
    // Precedence (issue #51 + symbol params): explicit user parameter >
    // imported dataset metadata > symbol-name default.
    const userOverride = useSymbolParamsStore.getState().paramsFor(get().symbol).contractSize
    const override = userOverride ?? get().importMeta?.contractSize
    return pnlScaleForSymbol(get().symbol, lots ?? get().tradeSize, override)
  }

  function currentTradeCosts(): TradeCosts {
    const params = useSymbolParamsStore.getState().paramsFor(get().symbol)
    const costs: TradeCosts = {}
    if (params.spread != null && Number.isFinite(params.spread) && params.spread >= 0) {
      costs.spread = params.spread
    }
    if (
      params.commissionPerLot != null &&
      Number.isFinite(params.commissionPerLot) &&
      params.commissionPerLot >= 0
    ) {
      costs.commissionPerLot = params.commissionPerLot
    }
    return costs
  }

  function pausePlayback(): void {
    if (get().mode !== 'replay') return
    engine.pause()
    secondaryEngine.pause()
    stopClock()
    publishStatus()
  }

  /**
   * Flatten open positions at the current price, build the session report, and
   * pause both engines — without touching chart mode or the playhead. Used by
   * the session-close flow (sessionStore.closeActiveSession) and exitReplay.
   */
  function finalizeSessionTradesImpl(): SessionReport | null {
    const { positions, closedTrades, symbol, timeframe, currentCandle } = get()

    let trades = [...closedTrades]
    let closedOpenOnExit = false

    if (positions.length > 0) {
      const candle = engine.getCurrentCandle() || currentCandle
      if (candle) {
        trades = [
          ...trades,
          ...positions.map((open) => {
            const costs = currentTradeCosts()
            const exitFill = fillPriceWithSpread(open.side, candle.close, costs, 'exit')
            return closePosition(
              open,
              exitFill,
              candle.time,
              'session_exit',
              currentPnlScale(open.lots),
              costs
            )
          })
        ]
        closedOpenOnExit = true
      }
    }

    const sessionReport: SessionReport | null =
      trades.length > 0
        ? {
            symbol,
            timeframe,
            trades,
            summary: summarizeSession(trades),
            closedOpenOnExit
          }
        : null

    stopClock()
    engine.pause()
    secondaryEngine.pause()
    secondaryEngine.load([])
    if (closedOpenOnExit) {
      set({ closedTrades: trades, positions: [], selectedWorkingId: null })
    }
    set({ sessionReport })
    return sessionReport
  }

  function applyWaitingPricesOnCandle(candle: Candle): WaitingPriceEvent | null {
    let pendingOrders = [...get().pendingOrders]
    let positions = [...get().positions]
    const orderHistory = [...get().orderHistory]
    const closedTrades = [...get().closedTrades]
    let selectedWorkingId = get().selectedWorkingId
    const filledThisBar = new Set<string>()
    let event: WaitingPriceEvent | null = null
    let hitKind: 'tp' | 'sl' | null = null

    const stillPending: PendingOrder[] = []
    for (const pending of pendingOrders) {
      if (!evaluatePendingFill(pending, candle)) {
        stillPending.push(pending)
        continue
      }
      const filled = pendingToPosition(pending, candle.time)
      positions.push(filled)
      filledThisBar.add(filled.id)
      orderHistory.push(historicOrderFromPending(pending, 'filled', candle.time))
      event = 'fill'
    }
    pendingOrders = stillPending

    const stillOpen: Position[] = []
    for (const open of positions) {
      if (filledThisBar.has(open.id) || (open.takeProfit == null && open.stopLoss == null)) {
        stillOpen.push(open)
        continue
      }
      const hit = evaluateStopTakeProfit(open, candle)
      if (!hit) {
        stillOpen.push(open)
        continue
      }
      closedTrades.push(
        closePosition(
          open,
          hit.price,
          candle.time,
          hit.hit,
          currentPnlScale(open.lots),
          currentTradeCosts()
        )
      )
      if (selectedWorkingId === open.id) selectedWorkingId = null
      hitKind = hit.hit
      event = hit.hit
    }
    positions = stillOpen

    if (event == null) return null

    selectedWorkingId = workingIdStillOpen(selectedWorkingId, positions, pendingOrders)
    set({
      pendingOrders,
      positions,
      orderHistory,
      closedTrades,
      selectedWorkingId,
      replayMessage: null,
      ...(hitKind ? EMPTY_TICKET_LEVELS : {})
    })

    return event
  }

  /** Fill a pending limit, then close an open position if TP/SL is hit. */
  function maybeAutoCloseOnLevels(): WaitingPriceEvent | null {
    if (get().mode !== 'replay') return null
    if (get().replayLoading) return null

    const candle = priceFollowCandle()
    if (!candle) return null
    return applyWaitingPricesOnCandle(candle)
  }

  function publishStatus(): void {
    set({
      mode: 'replay',
      candles: engine.getState().candles,
      ...engineSnapshot()
    })
  }

  function stopClock(): void {
    clearClock()
  }

  async function maybePrefetchSecondary(): Promise<void> {
    // No live feed in this build: secondary prefetch is a no-op.
  }

  async function maybePrefetch(): Promise<void> {
    await maybePrefetchImported()
  }

  async function loadImportedSeries(
    id: string,
    timeframe: string,
    range?: ImportLoadRange
  ): Promise<{
    meta: ImportedDatasetMeta
    candles: Candle[]
    window: ImportLoadedWindow | null
  } | null> {
    const loaded = await window.api.loadImport(id, timeframe, range)
    if (!loaded.ok) return null
    return {
      meta: loaded.meta,
      candles: dedupeCandlesByTime(loaded.candles),
      window: loaded.window ?? null
    }
  }

  /**
   * Extend an imported window forward while replaying, so the buffer never has
   * to hold the whole dataset.
   */
  async function maybePrefetchImported(): Promise<void> {
    if (prefetchInFlight) return
    if (get().mode !== 'replay') return
    if (get().dataSource !== 'imported') return
    if (!engine.needsPrefetch()) return

    const meta = get().importMeta
    if (!meta) return
    // MT imports aggregate from a fully loaded 1m series — nothing to page.
    if (isMetatraderImport(meta) && get().importedSourceCandles.length) return

    const buffer = engine.getState().candles
    if (!buffer.length) return
    // Null window means the whole series is already in the buffer.
    if (!get().importWindow?.hasMoreAfter) return

    const last = buffer[buffer.length - 1]
    const timeframe = get().timeframe

    prefetchInFlight = true
    set({ isPrefetching: true })

    try {
      const loaded = await loadImportedSeries(
        meta.id,
        timeframe,
        forwardRange(last.time, IMPORT_PREFETCH_BATCH_BARS)
      )
      if (get().mode !== 'replay' || get().timeframe !== timeframe) return
      if (!loaded?.candles.length) {
        if (loaded?.window) {
          set((s) => ({ importWindow: mergeLoadedWindow(s.importWindow, loaded.window!) }))
        }
        return
      }

      engine.appendCandles(loaded.candles)
      set((s) => ({
        importWindow: loaded.window
          ? mergeLoadedWindow(s.importWindow, loaded.window)
          : s.importWindow
      }))
      publishStatus()
    } finally {
      prefetchInFlight = false
      if (get().mode === 'replay') {
        set({ isPrefetching: false })
      }
    }
  }

  async function loadSecondaryLiveCandles(): Promise<void> {
    if (!get().chartSplit) return

    const generation = (secondaryLoadGeneration += 1)
    const { secondaryTimeframe, dataSource, importMeta, importedCandles, timeframe } = get()

    set({ secondaryStatus: 'loading', secondaryError: null, secondaryLoading: true })

    try {
      let candles: Candle[] = []

      if (dataSource === 'imported' && importMeta) {
        const source1m = get().importedSourceCandles
        if (isMetatraderImport(importMeta) && source1m.length) {
          candles = displayedFromSource(source1m, secondaryTimeframe)
        } else if (secondaryTimeframe === timeframe) {
          candles = importedCandles
        } else if (importHasTimeframe(importMeta, secondaryTimeframe)) {
          const loaded = await loadImportedSeries(importMeta.id, secondaryTimeframe, tailRange())
          if (generation !== secondaryLoadGeneration || !get().chartSplit) return
          if (!loaded?.candles.length) {
            throw new Error(`No imported candles for ${secondaryTimeframe}.`)
          }
          candles = loaded.candles
        } else {
          throw new Error(`Timeframe ${secondaryTimeframe} is not available for this import.`)
        }
      }

      if (generation !== secondaryLoadGeneration || !get().chartSplit) return

      secondaryEngine.load([])
      set((s) => ({
        secondaryCandles: candles,
        secondaryVisibleCandles: [],
        secondaryCurrentCandle: null,
        secondaryReplayIndex: 0,
        secondaryBufferLength: candles.length,
        secondaryStatus: 'ready',
        secondaryError: null,
        secondaryLoading: false,
        secondaryChartSync: {
          kind: 'replace',
          fitContent: true,
          revision: s.secondaryChartSync.revision + 1
        }
      }))
    } catch (err) {
      if (generation !== secondaryLoadGeneration) return
      const message = err instanceof Error ? err.message : 'Failed to load secondary candles'
      set({
        ...emptySecondaryPaneState(),
        secondaryStatus: 'error',
        secondaryError: message,
        secondaryLoading: false
      })
    }
  }

  function seekSecondaryToAnchor(startSec: number): void {
    const candles = secondaryEngine.getState().candles
    if (!candles.length) return

    if (startSec < candles[0].time) {
      secondaryEngine.seekToIndex(0)
      return
    }

    // Shared Timestep: secondary always covers the primary playhead time.
    secondaryEngine.seekToTime(
      followerPlayheadCover(
        startSec,
        intervalSecondsFor(get().timeframe),
        intervalSecondsFor(get().secondaryTimeframe)
      )
    )
  }

  async function loadSecondaryReplayWindow(anchorTimeSeconds: number): Promise<boolean> {
    if (!get().chartSplit) return false

    const startSec = Math.floor(Number(anchorTimeSeconds))
    if (!Number.isFinite(startSec)) return false

    const { secondaryTimeframe, dataSource, importMeta, importedCandles, timeframe } = get()
    const generation = (secondaryLoadGeneration += 1)

    if (dataSource === 'imported' && importMeta) {
      const source1m = get().importedSourceCandles
      let series = importedCandles
      if (isMetatraderImport(importMeta) && source1m.length) {
        series = displayedFromSource(source1m, secondaryTimeframe)
      } else if (secondaryTimeframe !== timeframe) {
        if (!importHasTimeframe(importMeta, secondaryTimeframe)) {
          set({
            secondaryLoading: false,
            secondaryStatus: 'error',
            secondaryError: `Timeframe ${secondaryTimeframe} is not available for this import.`
          })
          return false
        }
        const loaded = await loadImportedSeries(
          importMeta.id,
          secondaryTimeframe,
          // Follower pane only needs the window around the primary playhead.
          replayRange(startSec, intervalSecondsFor(secondaryTimeframe))
        )
        if (generation !== secondaryLoadGeneration || !get().chartSplit) return false
        if (!loaded?.candles.length) {
          set({
            secondaryLoading: false,
            secondaryStatus: 'error',
            secondaryError: `No imported candles for ${secondaryTimeframe}.`
          })
          return false
        }
        series = loaded.candles
      }

      const keptSpeed = secondaryEngine.getState().speed
      secondaryEngine.load(series)
      secondaryEngine.setSpeed(keptSpeed)
      seekSecondaryToAnchor(startSec)
      publishSecondary('replace', { fitContent: true })
      set({
        secondaryCandles: series,
        secondaryBufferLength: series.length,
        secondaryLoading: false,
        secondaryStatus: 'ready',
        secondaryError: null
      })
      return true
    }

    const intervalSec = intervalSecondsFor(secondaryTimeframe)
    const { startTimeMs, endTimeMs } = buildReplayWindowMs({
      startTimeSeconds: startSec,
      intervalSeconds: intervalSec
    })

    if (startTimeMs >= endTimeMs) {
      set({
        secondaryLoading: false,
        secondaryError: 'Could not build secondary candle window.',
        secondaryStatus: 'error'
      })
      return false
    }

    set({ secondaryLoading: true, secondaryError: null })

    try {
      if (get().dataSource !== 'imported') {
        set({
          secondaryLoading: false,
          secondaryStatus: 'error',
          secondaryError: 'Only imported datasets can be replayed in this build.'
        })
        return false
      }
      const candles: Candle[] = []

      if (generation !== secondaryLoadGeneration || !get().chartSplit) return false

      if (!candles.length) {
        set({
          secondaryLoading: false,
          secondaryStatus: 'error',
          secondaryError: 'No secondary candles found for that UTC range.'
        })
        return false
      }

      const keptSpeed = secondaryEngine.getState().speed
      secondaryEngine.load(candles)
      secondaryEngine.setSpeed(keptSpeed)

      seekSecondaryToAnchor(startSec)

      set({ secondaryLoading: false, secondaryStatus: 'ready', secondaryError: null })
      publishSecondary('replace', { fitContent: true })
      void maybePrefetchSecondary()
      return true
    } catch (err) {
      if (generation !== secondaryLoadGeneration) return false
      const message = err instanceof Error ? err.message : 'Failed to load secondary replay window'
      set({
        secondaryLoading: false,
        secondaryStatus: 'error',
        secondaryError: message
      })
      return false
    }
  }

  function alignSecondaryAfterPrimaryLoad(): void {
    if (!get().chartSplit || get().mode !== 'replay') return
    const candle = engine.getCurrentCandle() || get().currentCandle
    if (!candle) return
    void loadSecondaryReplayWindow(candle.time)
  }

  function driverEnded(): boolean {
    // Shared Timestep always anchors on the primary playhead.
    return engine.getState().status === 'ended'
  }

  function mirrorTimestepFromChart(chartTimeframe: string): void {
    const next = resolveTimestepAfterChartTfChange({
      syncTimestepWithChart: get().syncTimestepWithChart,
      chartTimeframe,
      replayTimestep: get().replayTimestep
    })
    if (next !== get().replayTimestep) {
      resetStepCursor()
      set({ replayTimestep: next })
    }
  }

  /**
   * Advance every pane by one shared Replay Timestep (not focus/driver pane).
   * Primary is the time anchor; secondary covers the same wall-clock range.
   */
  function advanceDriverForward(): boolean {
    const split = get().chartSplit
    const candle = engine.getCurrentCandle()
    if (!candle) return false

    const candles = engine.getState().candles
    if (!candles.length) return false

    const before = engine.getState().index
    if (stepCursor == null || stepCursorIndex !== before) {
      stepCursor = candle.time
      stepCursorIndex = before
    }

    const chartSec = intervalSecondsFor(get().timeframe)
    const stepSec = intervalSecondsFor(get().replayTimestep)
    const targetCover = timestepStepCoverEnd(stepCursor, chartSec, stepSec, 1)
    stepCursor = targetCover

    const last = candles[candles.length - 1]
    const lastCover = playheadCoverEnd(last.time, chartSec)
    if (before >= candles.length - 1 && targetCover > lastCover) {
      engine.stepForward()
      publishReplay('replace', { fitContent: false })
      if (split) syncSecondaryToPrimaryCover()
      return false
    }

    let target = findIndexAtOrBefore(candles, targetCover)
    if (target < 0) target = before
    if (target <= before) {
      // Fine Timestep: time advanced inside the current chart bar.
      stepCursorIndex = before
      if (split) {
        const follow = priceFollowPane()
        if (follow === 'secondary') {
          const followBefore = secondaryEngine.getState().index
          syncSecondaryToCursor(targetCover)
          const followAfter = secondaryEngine.getState().index
          if (followAfter !== followBefore) {
            scanFinerHits('secondary', followBefore + 1, followAfter)
          }
        } else {
          syncSecondaryToCursor(targetCover)
        }
      }
      if (stepSec < chartSec && get().importedSourceCandles.length > 0) {
        publishReplay('append', { fitContent: false })
      }
      return true
    }

    const follow = priceFollowPane()
    const followEngine = follow === 'secondary' ? secondaryEngine : engine
    const followBefore = followEngine.getState().index

    engine.seekToIndex(target, coverSeekOpts())
    const after = engine.getState().index
    if (after <= before) {
      publishReplay('replace', { fitContent: false })
      if (split) syncSecondaryAfterStep(targetCover)
      return false
    }
    stepCursorIndex = after

    publishReplay(after === before + 1 ? 'append' : 'replace', { fitContent: false })

    if (!split) {
      if (follow === 'primary') {
        scanFinerHits('primary', before + 1, after)
      } else {
        maybeAutoCloseOnLevels()
      }
    } else if (follow === 'primary') {
      const event = scanFinerHits('primary', before + 1, after)
      const landed = engine.getCurrentCandle()
      if (event && landed) revealCoarserTouchedAt(landed.time)
      else syncSecondaryAfterStep(targetCover)
    } else {
      syncSecondaryAfterStep(targetCover)
      scanFinerHits('secondary', followBefore + 1, secondaryEngine.getState().index)
    }

    void maybePrefetch()
    void maybePrefetchSecondary()
    return true
  }

  function retreatDriverBackward(): void {
    const split = get().chartSplit
    const leftCandle = engine.getCurrentCandle() || get().currentCandle
    const candles = engine.getState().candles
    if (!leftCandle || !candles.length) return

    const before = engine.getState().index
    if (stepCursor == null || stepCursorIndex !== before) {
      stepCursor = leftCandle.time
      stepCursorIndex = before
    }

    const chartSec = intervalSecondsFor(get().timeframe)
    const stepSec = intervalSecondsFor(get().replayTimestep)
    const targetCover = Math.max(
      candles[0].time,
      timestepStepCoverEnd(stepCursor, chartSec, stepSec, -1)
    )
    stepCursor = targetCover
    let target = findIndexAtOrBefore(candles, targetCover)
    if (target < 0) target = 0
    if (target >= before) {
      stepCursorIndex = before
      // Reset an ended engine so Play works again after stepping inside the last bar.
      engine.seekToIndex(before, { pause: true })
      if (split) syncSecondaryToCursor(targetCover)
      if (stepSec < chartSec && get().importedSourceCandles.length > 0) {
        publishReplay('append', { fitContent: false })
      }
      return
    }

    rewindPrimaryToIndex(target, { rewindTrades: true })
    stepCursorIndex = target
    publishReplay('replace', { fitContent: false })
    if (split) syncSecondaryAfterStep(targetCover)
  }

  function publishImportedPreview(
    candles: Candle[],
    meta: ImportedDatasetMeta,
    loadedWindow: ImportLoadedWindow | null = null
  ): void {
    stopClock()
    prefetchInFlight = false
    replayRequestId += 1
    loadPrimaryEngine([])
    set((s) => ({
      dataSource: 'imported',
      importMeta: meta,
      importedCandles: candles,
      importWindow: loadedWindow,
      importedSourceCandles: [] as Candle[],
      symbol: meta.symbol,
      timeframe: meta.timeframe,
      tradeSize: clampTradeSizeForSymbol(s.tradeSize, meta.symbol),
      candles,
      status: 'ready',
      error: null,
      mode: 'live',
      replayStatus: 'idle',
      isPlaying: false,
      speed: 1,
      replayIndex: 0,
      visibleCandles: [],
      currentCandle: null,
      bufferLength: 0,
      isPrefetching: false,
      replayLoading: false,
      replayMessage:
        meta.candleCount > 0
          ? `Imported ${meta.symbol} ${meta.timeframe} · ${meta.candleCount.toLocaleString()} candles`
          : null,
      ...emptyDrawingState(),
      ...EMPTY_TICKET_LEVELS,
      rewindPick: false,
      ...EMPTY_WORKING_TRADES,
      closedTrades: [],
      orderHistory: [],
      chartSync: {
        kind: 'replace',
        fitContent: true,
        revision: s.chartSync.revision + 1
      }
    }))
    // Sync-on sessions must open with Timestep == chart TF (not stale default).
    mirrorTimestepFromChart(meta.timeframe)
  }

  function startBufferReplay(
    candles: Candle[],
    startIndex: number,
    opts: { message?: string | null } = {}
  ): void {
    if (get().mode === 'replay') return
    if (!candles.length) {
      set({ replayMessage: 'No candles to replay.' })
      return
    }

    stopClock()
    const keptSpeed = engine.getState().speed
    loadPrimaryEngine(candles)
    engine.setSpeed(keptSpeed)

    const idx = Math.min(
      Math.max(0, Math.floor(Number(startIndex)) || 0),
      Math.max(candles.length - 1, 0)
    )
    engine.seekToIndex(idx)

    const defaultMessage =
      idx > 0 ? `Replay from candle ${idx + 1}.` : 'Replay from start of loaded candles.'

    set({
      candles,
      status: 'ready',
      replayLoading: false,
      replayMessage: opts.message ?? defaultMessage,
      error: null,
      speed: engine.getState().speed
    })
    publishReplay('replace', { fitContent: true })
    alignSecondaryAfterPrimaryLoad()
  }

  /**
   * Load just the replay window for an imported dataset and start there.
   * `startOffsetBars` moves the playhead forward inside the loaded window (used
   * to keep a few context bars visible when starting at the very first candle).
   */
  async function startImportedReplayWindow(
    startTimeSeconds: number,
    opts: {
      message?: string | null
      lookbackBars?: number
      forwardBars?: number
      startOffsetBars?: number
    } = {}
  ): Promise<void> {
    if (get().dataSource !== 'imported') return
    if (get().mode === 'replay') return

    const meta = get().importMeta
    if (!meta) {
      set({ replayMessage: 'No imported candles to replay.' })
      return
    }

    const startSec = Math.floor(Number(startTimeSeconds))
    if (!Number.isFinite(startSec)) {
      set({ replayMessage: 'Invalid start time.' })
      return
    }

    const timeframe = get().timeframe
    const source1m = get().importedSourceCandles

    // MT imports aggregate from an in-memory 1m series — replay the whole buffer.
    if (isMetatraderImport(meta) && source1m.length) {
      const series = displayedFromSource(source1m, timeframe)
      const idx = Math.max(0, findIndexAtOrBefore(series, startSec))
      startBufferReplay(series, idx + Math.max(0, opts.startOffsetBars ?? 0), {
        message: opts.message
      })
      return
    }

    const requestId = (replayRequestId += 1)
    stopClock()
    set({ replayLoading: true, replayMessage: null, error: null })

    const range = replayRange(startSec, intervalSecondsFor(timeframe), {
      lookbackBars: opts.lookbackBars,
      forwardBars: opts.forwardBars
    })
    const loaded = await loadImportedSeries(meta.id, timeframe, range)

    if (requestId !== replayRequestId || get().timeframe !== timeframe) return

    if (!loaded?.candles.length) {
      set({
        replayLoading: false,
        replayMessage: 'No imported candles found for that range.'
      })
      return
    }

    const idx = Math.max(0, findIndexAtOrBefore(loaded.candles, startSec))
    set({ importWindow: loaded.window, importMeta: loaded.meta })
    startBufferReplay(loaded.candles, idx + Math.max(0, opts.startOffsetBars ?? 0), {
      message: opts.message
    })
  }

  /**
   * Reload the imported replay buffer around `targetTime` when a jump lands
   * outside the loaded window. Keeps trades/drawings — only the buffer changes.
   */
  async function jumpImportedToTime(targetTimeSeconds: number): Promise<boolean> {
    if (get().dataSource !== 'imported') return false
    if (get().mode !== 'replay') return false

    const meta = get().importMeta
    if (!meta) return false
    if (isMetatraderImport(meta) && get().importedSourceCandles.length) return false

    const target = Math.floor(Number(targetTimeSeconds))
    if (!Number.isFinite(target)) return false

    const timeframe = get().timeframe
    const stats = meta.timeframes?.[timeframe]
    if (stats && (target < stats.firstTime || target > stats.lastTime)) return false

    const requestId = (replayRequestId += 1)
    set({ replayLoading: true, replayMessage: null })

    const loaded = await loadImportedSeries(
      meta.id,
      timeframe,
      replayRange(target, intervalSecondsFor(timeframe))
    )

    if (requestId !== replayRequestId || get().timeframe !== timeframe) return false

    if (!loaded?.candles.length) {
      set({ replayLoading: false })
      return false
    }

    const keptSpeed = engine.getState().speed
    loadPrimaryEngine(loaded.candles)
    engine.setSpeed(keptSpeed)
    engine.seekToTime(target)

    const landed = engine.getCurrentCandle()
    if (landed) {
      const keepUntil = playheadCoverEnd(landed.time, intervalSecondsFor(timeframe))
      applyRewindResult(
        rewindTradesToTime({
          positions: get().positions,
          pendingOrders: get().pendingOrders,
          closedTrades: get().closedTrades,
          orderHistory: get().orderHistory,
          targetCandleTime: landed.time,
          keepUntil
        })
      )
    }

    set({
      candles: loaded.candles,
      importWindow: loaded.window,
      replayLoading: false,
      replayMessage: null,
      status: 'ready',
      error: null,
      speed: engine.getState().speed
    })
    publishReplay('replace', { fitContent: true })
    alignSecondaryAfterPrimaryLoad()
    return true
  }

  function startClock(): void {
    stopClock()

    clockTimer = setInterval(() => {
      const { mode, isPlaying } = get()
      if (mode !== 'replay' || !isPlaying) {
        stopClock()
        return
      }

      const advanced = advanceDriverForward()
      if (!advanced || driverEnded()) {
        stopClock()
        if (driverEnded()) {
          engine.pause()
          secondaryEngine.pause()
          set({ isPlaying: false, replayStatus: 'ended' })
        }
      }
    }, tickMs())
  }

  function resetReplayState(opts: { keepImport?: boolean; keepDrawings?: boolean } = {}): void {
    stopClock()
    prefetchInFlight = false
    replayRequestId += 1
    loadPrimaryEngine([])
    secondaryEngine.load([])
    set((s) => ({
      mode: 'live',
      replayStatus: 'idle',
      isPlaying: false,
      speed: 1,
      replayIndex: 0,
      visibleCandles: [],
      currentCandle: null,
      bufferLength: 0,
      isPrefetching: false,
      replayLoading: false,
      replayMessage: null,
      chartFocus: null,
      pendingSeekConfirm: null,
      chartScrubbing: false,
      ...(opts.keepDrawings ? {} : emptyDrawingState()),
      ...EMPTY_TICKET_LEVELS,
      rewindPick: false,
      ticketOrderType: 'market' as TicketOrderType,
      ...EMPTY_WORKING_TRADES,
      closedTrades: [],
      orderHistory: [],
      driverPane: 'primary',
      ...(opts.keepImport
        ? {}
        : {
            dataSource: 'imported' as const,
            importMeta: null,
            importedCandles: [] as Candle[],
            importWindow: null,
            importedSourceCandles: [] as Candle[]
          }),
      chartSync: {
        kind: 'replace',
        fitContent: true,
        revision: s.chartSync.revision + 1
      },
      ...(s.chartSplit
        ? {}
        : {
            ...emptySecondaryPaneState(),
            secondaryChartSync: {
              kind: 'replace' as const,
              fitContent: true,
              revision: s.secondaryChartSync.revision + 1
            }
          })
    }))
  }

  function tryOpen(side: 'long' | 'short'): void {
    if (get().mode !== 'replay') return
    if (get().replayLoading) return
    if (get().replayStatus === 'ended') return

    const candle = priceFollowCandle()
    if (!candle) return

    const costs = currentTradeCosts()
    const fillPrice = fillPriceWithSpread(side, candle.close, costs, 'entry')
    const result = openPosition(
      side,
      fillPrice,
      candle.time,
      nextTradeId(),
      clampTradeSizeForSymbol(get().tradeSize, get().symbol)
    )
    if (!result.ok) {
      set({ replayMessage: result.reason })
      return
    }

    set((s) => ({
      positions: [...s.positions, result.position],
      orderHistory: [...s.orderHistory, historicOrderFromMarketFill(result.position)],
      replayMessage: null
    }))
    stampTicketLevels(result.position.id)
    resetTicketAfterSubmit()
  }

  function tryClose(id?: string): void {
    tryClosePartial(1, id)
  }

  function tryClosePartial(fraction: number, id?: string): void {
    if (get().mode !== 'replay') return
    if (get().replayLoading) return
    if (get().replayStatus === 'ended') return
    if (!Number.isFinite(fraction) || fraction < 0.5 || fraction > 1) {
      set({ replayMessage: 'Partial close must be at least 50%.' })
      return
    }

    const open = findPositionById(resolveWorkingId(id))
    if (!open) return

    const candle = priceFollowCandle()
    if (!candle) return

    const costs = currentTradeCosts()
    const exitFill = fillPriceWithSpread(open.side, candle.close, costs, 'exit')
    const { closed, remaining } = closePositionPartial(
      open,
      exitFill,
      candle.time,
      fraction,
      'manual',
      currentPnlScale(open.lots),
      costs,
      nextTradeId()
    )

    set((s) => ({
      positions: remaining
        ? s.positions.map((p) => (p.id === open.id ? remaining : p))
        : s.positions.filter((p) => p.id !== open.id),
      selectedWorkingId:
        remaining == null && s.selectedWorkingId === open.id ? null : s.selectedWorkingId,
      closedTrades: [...s.closedTrades, closed],
      replayMessage: null
    }))
  }

  function tryPlaceLimit(side: 'long' | 'short', price: number, kind?: PendingOrderKind): void {
    if (get().mode !== 'replay') return
    if (get().replayLoading) return
    if (get().replayStatus === 'ended') return

    const candle = priceFollowCandle()
    if (!candle) return

    if (!Number.isFinite(price)) {
      set({ replayMessage: 'Pick or type a limit price' })
      return
    }

    const ticketKind = get().ticketOrderType
    const resolvedKind =
      kind ??
      (isPendingTicketType(ticketKind)
        ? ticketKind
        : (pendingKindForEntry(side, candle.close, price) ?? 'limit'))

    const result = placePendingLimit({
      side,
      price,
      markPrice: candle.close,
      time: candle.time,
      id: nextTradeId(),
      lots: clampTradeSizeForSymbol(get().tradeSize, get().symbol),
      kind: resolvedKind
    })
    if (!result.ok) {
      set({ replayMessage: result.reason })
      return
    }
    set((s) => ({
      pendingOrders: [...s.pendingOrders, result.pending],
      replayMessage: null
    }))
    stampTicketLevels(result.pending.id)
    resetTicketAfterSubmit()
  }

  function tryCancelPending(id?: string): void {
    if (get().mode !== 'replay') return
    if (get().replayStatus === 'ended') return
    const pending = findPendingById(resolveWorkingId(id))
    if (!pending) return
    const candle = priceFollowCandle()
    const updateTime = candle?.time ?? pending.placedTime
    set((s) => ({
      pendingOrders: s.pendingOrders.filter((p) => p.id !== pending.id),
      selectedWorkingId: s.selectedWorkingId === pending.id ? null : s.selectedWorkingId,
      orderHistory: [...s.orderHistory, historicOrderFromPending(pending, 'canceled', updateTime)],
      replayMessage: null
    }))
  }

  function trySetPendingPrice(price: number, id?: string): void {
    if (get().mode !== 'replay') return
    if (get().replayStatus === 'ended') return
    const pending = findPendingById(resolveWorkingId(id))
    if (!pending) return
    const candle = priceFollowCandle()
    const mark = candle?.close
    if (mark == null) return
    const result = withPendingPrice(pending, price, mark)
    if (!result.ok) {
      set({ replayMessage: result.reason })
      return
    }
    patchPending(pending.id, result.pending)
  }

  function setTakeProfit(price: number | null, opts?: LevelSetOptions): void {
    if (get().mode !== 'replay') return
    if (get().replayStatus === 'ended') return
    const targetId = resolveWorkingId(opts?.id)
    const pending = findPendingById(targetId)
    const open = findPositionById(targetId)

    if (pending) {
      let result = withPendingTakeProfit(pending, price)
      if (!result.ok) {
        set({ replayMessage: result.reason })
        return
      }
      if (opts?.linkRr && price != null && pending.stopLoss == null) {
        const linkedSl = stopLossFromTakeProfit(
          pending.side,
          pending.price,
          price,
          get().riskReward
        )
        if (linkedSl != null) {
          const withSl = withPendingStopLoss(result.pending, linkedSl)
          if (withSl.ok) result = withSl
        }
      }
      patchPending(pending.id, result.pending)
      return
    }

    if (!open) return

    let result = withTakeProfit(open, price)
    if (!result.ok) {
      set({ replayMessage: result.reason })
      return
    }

    if (opts?.linkRr && price != null && open.stopLoss == null) {
      const linkedSl = stopLossFromTakeProfit(open.side, open.entryPrice, price, get().riskReward)
      if (linkedSl != null) {
        const candle = priceFollowCandle()
        const withSl = withStopLoss(result.position, linkedSl, candle?.close)
        if (withSl.ok) result = withSl
      }
    }

    patchPosition(open.id, result.position)
  }

  function setStopLoss(price: number | null, opts?: LevelSetOptions): void {
    if (get().mode !== 'replay') return
    if (get().replayStatus === 'ended') return
    const targetId = resolveWorkingId(opts?.id)
    const pending = findPendingById(targetId)
    const open = findPositionById(targetId)

    if (pending) {
      let result = withPendingStopLoss(pending, price)
      if (!result.ok) {
        set({ replayMessage: result.reason })
        return
      }
      if (opts?.linkRr && price != null && pending.takeProfit == null) {
        const linkedTp = takeProfitFromStopLoss(
          pending.side,
          pending.price,
          price,
          get().riskReward
        )
        if (linkedTp != null) {
          const withTp = withPendingTakeProfit(result.pending, linkedTp)
          if (withTp.ok) result = withTp
        }
      }
      patchPending(pending.id, result.pending)
      return
    }

    if (!open) return

    const candle = priceFollowCandle()
    const markPrice = candle?.close
    let result = withStopLoss(open, price, markPrice)
    if (!result.ok) {
      set({ replayMessage: result.reason })
      return
    }

    if (opts?.linkRr && price != null && open.takeProfit == null) {
      const linkedTp = takeProfitFromStopLoss(open.side, open.entryPrice, price, get().riskReward)
      if (linkedTp != null) {
        const withTp = withTakeProfit(result.position, linkedTp)
        if (withTp.ok) result = withTp
      }
    }

    patchPosition(open.id, result.position)
  }

  function currentDraftLevels(): TicketDraftLevels {
    const s = get()
    return {
      orderType: s.ticketOrderType,
      markPrice: priceFollowCandle()?.close ?? s.currentCandle?.close,
      limitPrice: s.ticketLimitPrice,
      takeProfit: s.ticketTakeProfit,
      stopLoss: s.ticketStopLoss
    }
  }

  function stampTicketLevels(id: string): void {
    const tp = get().ticketTakeProfit
    const sl = get().ticketStopLoss
    if (tp != null) setTakeProfit(tp, { linkRr: sl == null, id })
    if (sl != null) setStopLoss(sl, { linkRr: tp == null, id })
  }

  function resetTicketAfterSubmit(): void {
    set({ ...EMPTY_TICKET_LEVELS, selectedWorkingId: null })
  }

  function trySetTicketTakeProfit(price: number | null, opts?: LevelSetOptions): void {
    const patch: { ticketTakeProfit: number | null; ticketStopLoss?: number | null } = {
      ticketTakeProfit: price
    }
    if (opts?.linkRr && price != null && get().ticketStopLoss == null) {
      const linked = linkedTicketOpposite(
        'tp',
        price,
        ticketEntryPrice(currentDraftLevels()),
        get().riskReward
      )
      if (linked != null) patch.ticketStopLoss = linked
    }
    set(patch)
  }

  function trySetTicketStopLoss(price: number | null, opts?: LevelSetOptions): void {
    const patch: { ticketStopLoss: number | null; ticketTakeProfit?: number | null } = {
      ticketStopLoss: price
    }
    if (opts?.linkRr && price != null && get().ticketTakeProfit == null) {
      const linked = linkedTicketOpposite(
        'sl',
        price,
        ticketEntryPrice(currentDraftLevels()),
        get().riskReward
      )
      if (linked != null) patch.ticketTakeProfit = linked
    }
    set(patch)
  }

  function trySetTicketLimitPrice(price: number | null): void {
    const s = get()
    const patch: {
      ticketLimitPrice: number | null
      ticketTakeProfit?: number | null
      ticketStopLoss?: number | null
    } = { ticketLimitPrice: price }
    const entry = ticketEntryPrice({
      orderType: s.ticketOrderType,
      markPrice: priceFollowCandle()?.close ?? s.currentCandle?.close,
      limitPrice: price,
      takeProfit: s.ticketTakeProfit,
      stopLoss: s.ticketStopLoss
    })
    if (entry != null) {
      if (s.ticketStopLoss != null && s.ticketTakeProfit == null) {
        const linked = linkedTicketOpposite('sl', s.ticketStopLoss, entry, s.riskReward)
        if (linked != null) patch.ticketTakeProfit = linked
      } else if (s.ticketTakeProfit != null && s.ticketStopLoss == null) {
        const linked = linkedTicketOpposite('tp', s.ticketTakeProfit, entry, s.riskReward)
        if (linked != null) patch.ticketStopLoss = linked
      }
    }
    set(patch)
  }

  /** Re-apply R:R guide to ticket drafts only — live positions keep their own TP/SL. */
  function applyRiskRewardGuide(riskReward: number): void {
    if (get().mode !== 'replay' || get().replayStatus === 'ended') return

    const entry = ticketEntryPrice(currentDraftLevels())
    if (entry == null) return
    const sl = get().ticketStopLoss
    const tp = get().ticketTakeProfit
    if (sl != null) {
      const linked = linkedTicketOpposite('sl', sl, entry, riskReward)
      if (linked != null) set({ ticketTakeProfit: linked })
    } else if (tp != null) {
      const linked = linkedTicketOpposite('tp', tp, entry, riskReward)
      if (linked != null) set({ ticketStopLoss: linked })
    }
  }

  async function loadReplayWindow(
    startTimeSeconds: number,
    opts: { clampMessage?: boolean; message?: string | null; forwardBars?: number } = {}
  ): Promise<boolean> {
    const startSec = Math.floor(Number(startTimeSeconds))
    if (!Number.isFinite(startSec)) {
      set({ replayMessage: 'Invalid start time.' })
      return false
    }

    const nowSec = Math.floor(Date.now() / 1000)
    if (startSec >= nowSec) {
      set({
        replayMessage: 'Start time must be in the past (UTC).',
        replayLoading: false
      })
      return false
    }

    const { symbol, timeframe } = get()
    const intervalSec = intervalSecondsFor(timeframe)
    const windowOpts: {
      startTimeSeconds: number
      intervalSeconds: number
      forwardBars?: number
    } = {
      startTimeSeconds: startSec,
      intervalSeconds: intervalSec
    }
    if (opts.forwardBars != null && Number.isFinite(opts.forwardBars)) {
      windowOpts.forwardBars = Math.max(1, Math.floor(opts.forwardBars))
    }
    const { startTimeMs, endTimeMs } = buildReplayWindowMs(windowOpts)

    if (startTimeMs >= endTimeMs) {
      set({
        replayMessage: 'Could not build a valid candle window for that time.',
        replayLoading: false
      })
      return false
    }

    const requestId = (replayRequestId += 1)
    const expectedTimeframe = timeframe
    stopClock()
    set({
      replayLoading: true,
      replayMessage: null,
      error: null
    })

    try {
      if (get().dataSource !== 'imported') {
        set({
          replayLoading: false,
          replayMessage: 'Only imported datasets can be replayed in this build.'
        })
        return false
      }
      const candles: Candle[] = []

      if (
        requestId !== replayRequestId ||
        get().symbol !== symbol ||
        get().timeframe !== expectedTimeframe
      ) {
        return false
      }

      if (!candles.length) {
        set({
          replayLoading: false,
          replayMessage: 'No candles found for that UTC range.'
        })
        return false
      }

      const keptSpeed = engine.getState().speed
      loadPrimaryEngine(candles)
      engine.setSpeed(keptSpeed)

      let message = opts.message ?? null
      const firstTime = candles[0].time

      if (startSec < firstTime) {
        engine.seekToIndex(0)
        if (opts.clampMessage !== false) {
          message = message || 'Start was before the first candle — clamped to buffer start.'
        }
      } else {
        engine.seekToTime(startSec)
      }

      set({
        candles,
        status: 'ready',
        replayLoading: false,
        replayMessage: message,
        error: null,
        speed: engine.getState().speed
      })
      // Force a full viewport/price-scale reset whenever a replay window is loaded.
      publishReplay('replace', { fitContent: true })
      void maybePrefetch()
      alignSecondaryAfterPrimaryLoad()
      return true
    } catch (err) {
      if (requestId !== replayRequestId) return false

      const message = err instanceof Error ? err.message : 'Failed to load replay window'
      set({
        replayLoading: false,
        replayMessage: message
      })
      return false
    }
  }

  /**
   * Prepend older bars so `target` lands on the primary series, without moving
   * the playhead or disturbing trades. Returns false when the target cannot be
   * reached — the source has no such history, or the gap is too large to fetch.
   */
  async function loadHistoryForFocus(target: number): Promise<boolean> {
    const replaying = get().mode === 'replay'
    const existing = replaying ? engine.getState().candles : get().candles
    if (!existing.length) return false

    const intervalSec = intervalSecondsFor(get().timeframe)
    if (target >= existing[0].time) return true

    const missing = focusHistoryBars(target, existing[0].time, intervalSec, FOCUS_LOOKBACK_BARS)
    if (missing <= 0) return true

    /** Merge older bars in, keeping the playhead anchored by time. */
    function prepend(older: Candle[], extra: Partial<ReplayStore> = {}): boolean {
      if (!older.length) return false
      const merged = dedupeCandlesByTime(older.concat(existing))
      if (merged.length === existing.length) return false

      if (replaying) {
        // Prepending shifts every index, so re-seek by time to keep the playhead.
        const anchor = engine.getCurrentCandle()?.time ?? null
        const keptSpeed = engine.getState().speed
        loadPrimaryEngine(merged)
        engine.setSpeed(keptSpeed)
        if (anchor != null) engine.seekToTime(anchor)
        if (Object.keys(extra).length) set(extra)
        publishReplay('replace', { fitContent: false })
        return true
      }

      set((s) => ({
        ...extra,
        candles: merged,
        chartSync: {
          kind: 'replace' as const,
          fitContent: false,
          revision: s.chartSync.revision + 1
        }
      }))
      return true
    }

    if (get().dataSource === 'imported') {
      const meta = get().importMeta
      if (!meta) return false
      // MT imports hold the full 1m series in memory — nothing left to page.
      if (isMetatraderImport(meta) && get().importedSourceCandles.length) return false

      const stats = meta.timeframes?.[get().timeframe]
      if (stats && target < stats.firstTime) return false
      if (missing > IMPORT_FOCUS_MAX_BARS) return false

      const loaded = await loadImportedSeries(
        meta.id,
        get().timeframe,
        focusHistoryRange(target, existing[0].time, intervalSec, {
          lookbackBars: FOCUS_LOOKBACK_BARS
        })
      )
      if (!loaded?.candles.length) return false

      const nextWindow = loaded.window
        ? mergeLoadedWindow(get().importWindow, loaded.window)
        : get().importWindow
      const patch: Partial<ReplayStore> = { importWindow: nextWindow }
      if (!replaying) patch.importedCandles = dedupeCandlesByTime(loaded.candles.concat(existing))

      return prepend(loaded.candles, patch)
    }

    // No live provider in this build: older bars come from the import only.
    return false
  }

  async function switchReplayTimeframe(nextTimeframe: string): Promise<void> {
    if (!TIMEFRAMES[nextTimeframe]) return
    if (nextTimeframe === get().timeframe) return
    if (get().mode !== 'replay') return

    const current = engine.getCurrentCandle() || get().currentCandle
    const anchorOpen = current?.time
    if (anchorOpen == null || !Number.isFinite(anchorOpen)) {
      set({
        replayMessage: 'Cannot switch timeframe without a current candle.'
      })
      return
    }

    stopClock()
    engine.pause()
    publishStatus()

    const previousTimeframe = get().timeframe
    const nextIntervalSec = intervalSecondsFor(nextTimeframe)
    const seekTime =
      get().dataSource === 'imported'
        ? floorOpenForTimeframe(nextTimeframe, anchorOpen)
        : alignTimeToInterval(anchorOpen, nextIntervalSec)

    if (get().dataSource === 'imported') {
      const meta = get().importMeta
      if (!importHasTimeframe(meta, nextTimeframe)) {
        set({
          replayMessage: `Timeframe ${nextTimeframe} is not available for this import.`
        })
        return
      }

      set({ replayLoading: true, timeframe: nextTimeframe, replayMessage: null })
      const source1m = get().importedSourceCandles
      const useMemorySource = isMetatraderImport(meta) && source1m.length > 0
      const loaded = useMemorySource
        ? {
            meta: { ...meta, timeframe: nextTimeframe },
            candles: displayedFromSource(source1m, nextTimeframe),
            window: null
          }
        : await loadImportedSeries(
            meta.id,
            nextTimeframe,
            // Only the window around the playhead is needed after a TF switch.
            replayRange(seekTime, nextIntervalSec)
          )
      if (!loaded?.candles.length) {
        set({
          timeframe: previousTimeframe,
          replayLoading: false,
          replayMessage: `Failed to load imported ${nextTimeframe} candles.`
        })
        return
      }

      const remappedDrawings = remapDrawingsToInterval(get().drawings, nextIntervalSec)
      const remappedPending = remapPendingTrendToInterval(get().pendingTrend, nextIntervalSec)
      const remappedPendingEnd = remapPendingTrendToInterval(get().pendingTrendEnd, nextIntervalSec)
      const remappedPendingOrders = remapPendingOrdersToInterval(
        get().pendingOrders,
        nextIntervalSec
      )
      const remappedPositions = remapPositionsTimes(get().positions, nextIntervalSec)
      const remappedClosed = get().closedTrades.map((trade) => ({
        ...trade,
        entryTime: alignTimeToInterval(trade.entryTime, nextIntervalSec),
        exitTime: alignTimeToInterval(trade.exitTime, nextIntervalSec),
        pendingPlacedTime:
          trade.pendingPlacedTime != null
            ? alignTimeToInterval(trade.pendingPlacedTime, nextIntervalSec)
            : trade.pendingPlacedTime
      }))
      const remappedOrderHistory = remapOrderHistoryToInterval(get().orderHistory, nextIntervalSec)

      const keptSpeed = engine.getState().speed
      loadPrimaryEngine(loaded.candles)
      engine.setSpeed(keptSpeed)
      engine.seekToTime(seekTime)

      set({
        importMeta: loaded.meta,
        importedCandles: loaded.candles,
        importWindow: loaded.window,
        candles: loaded.candles,
        drawings: remappedDrawings,
        pendingTrend: remappedPending,
        pendingTrendEnd: remappedPendingEnd,
        pendingOrders: remappedPendingOrders,
        positions: remappedPositions,
        closedTrades: remappedClosed,
        orderHistory: remappedOrderHistory,
        replayLoading: false,
        replayMessage: `Switched imported replay to ${nextTimeframe}.`,
        status: 'ready',
        error: null,
        speed: engine.getState().speed
      })
      publishReplay('replace', { fitContent: true })
      alignSecondaryAfterPrimaryLoad()
      mirrorTimestepFromChart(nextTimeframe)
      return
    }

    // Keep the open position, session PnL, and drawings. Remap trendline
    // endpoints onto the new candle open grid so LWC can resolve their times
    // after the series changes. Position TP/SL stay as absolute prices.
    const remappedDrawings = remapDrawingsToInterval(get().drawings, nextIntervalSec)
    const remappedPending = remapPendingTrendToInterval(get().pendingTrend, nextIntervalSec)
    const remappedPendingEnd = remapPendingTrendToInterval(get().pendingTrendEnd, nextIntervalSec)
    const remappedPendingOrders = remapPendingOrdersToInterval(get().pendingOrders, nextIntervalSec)
    const remappedPositions = remapPositionsTimes(get().positions, nextIntervalSec)

    const remappedClosed = get().closedTrades.map((trade) => ({
      ...trade,
      entryTime: alignTimeToInterval(trade.entryTime, nextIntervalSec),
      exitTime: alignTimeToInterval(trade.exitTime, nextIntervalSec),
      pendingPlacedTime:
        trade.pendingPlacedTime != null
          ? alignTimeToInterval(trade.pendingPlacedTime, nextIntervalSec)
          : trade.pendingPlacedTime
    }))
    const remappedOrderHistory = remapOrderHistoryToInterval(get().orderHistory, nextIntervalSec)

    set({
      timeframe: nextTimeframe,
      drawings: remappedDrawings,
      pendingTrend: remappedPending,
      pendingTrendEnd: remappedPendingEnd,
      pendingOrders: remappedPendingOrders,
      positions: remappedPositions,
      closedTrades: remappedClosed,
      orderHistory: remappedOrderHistory
    })

    const ok = await loadReplayWindow(seekTime, {
      clampMessage: true,
      message: `Timeframe → ${nextTimeframe} (UTC playhead kept).`
    })

    if (!ok && get().timeframe === nextTimeframe && get().mode === 'replay') {
      set({ timeframe: previousTimeframe })
      return
    }
    if (ok) mirrorTimestepFromChart(nextTimeframe)
  }

  return {
    symbol: '',
    timeframe: DEFAULT_TIMEFRAME,
    candles: [],
    status: 'idle',
    error: null,
    mode: 'live',
    dataSource: 'imported',
    importMeta: null,
    importedCandles: [],
    importWindow: null,
    importedList: [],
    importedSourceCandles: [],
    replayStatus: 'idle',
    isPlaying: false,
    speed: 1,
    replayIndex: 0,
    bufferLength: 0,
    visibleCandles: [],
    currentCandle: null,
    chartSync: { kind: 'replace', fitContent: true, revision: 0 },
    chartFocus: null,
    isPrefetching: false,
    replayLoading: false,
    replayMessage: null,
    activeIndicators: [],
    chartType: 'candlestick',
    drawTool: 'select',
    drawings: [],
    pendingTrend: null,
    pendingTrendEnd: null,
    selectedDrawingId: null,
    ...EMPTY_WORKING_TRADES,
    closedTrades: [],
    orderHistory: [],
    sessionReport: null,
    riskReward: DEFAULT_RISK_REWARD,
    tradeSize: DEFAULT_LOTS,
    ticketOrderType: 'market',
    ...EMPTY_TICKET_LEVELS,
    rewindPick: false,
    chartSplit: false,
    secondaryTimeframe: defaultSecondaryTimeframe(DEFAULT_TIMEFRAME),
    driverPane: 'primary',
    replayTimestep: DEFAULT_TIMEFRAME,
    syncTimestepWithChart: true,
    secondaryCandles: [],
    secondaryVisibleCandles: [],
    secondaryCurrentCandle: null,
    secondaryReplayIndex: 0,
    secondaryBufferLength: 0,
    secondaryChartSync: { kind: 'replace', fitContent: true, revision: 0 },
    secondaryStatus: 'idle',
    secondaryError: null,
    secondaryLoading: false,
    pendingSeekConfirm: null,
    chartScrubbing: false,

    setChartScrubbing(active) {
      const next = Boolean(active)
      if (get().chartScrubbing === next) return
      set({ chartScrubbing: next })
    },

    toggleIndicator(id) {
      if (!getIndicator(id)) return
      set((s) => {
        const on = s.activeIndicators.includes(id)
        return {
          activeIndicators: on
            ? s.activeIndicators.filter((item) => item !== id)
            : [...s.activeIndicators, id]
        }
      })
    },

    setChartType(type) {
      if (!isChartType(type)) return
      if (type === get().chartType) return
      set({ chartType: type })
    },

    setDrawTool(tool) {
      if (!isDrawTool(tool)) return
      set({
        drawTool: tool,
        pendingTrend: null,
        pendingTrendEnd: null,
        pricePick: null,
        rewindPick: false
      })
    },

    addHorizontalLine(price) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!Number.isFinite(price)) return
      const id = nextDrawingId()
      set((s) => ({
        drawTool: 'select',
        drawings: [
          ...s.drawings,
          { id, type: 'hline', price, style: defaultStyleForTool('hline') }
        ],
        selectedDrawingId: id
      }))
    },

    updateHorizontalLine(id, price) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id || !Number.isFinite(price)) return
      set((s) => ({
        drawings: s.drawings.map((d) => (d.type === 'hline' && d.id === id ? { ...d, price } : d))
      }))
    },

    addTwoPoint(point) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!point || !Number.isFinite(point.time) || !Number.isFinite(point.price)) {
        return
      }

      const tool = get().drawTool
      if (!isTwoPointTool(tool)) return

      const pending = get().pendingTrend
      if (!pending) {
        set({ pendingTrend: point, pendingTrendEnd: null })
        return
      }

      const id = nextDrawingId()
      set((s) => ({
        pendingTrend: null,
        pendingTrendEnd: null,
        drawTool: 'select',
        drawings: [
          ...s.drawings,
          {
            id,
            type: tool,
            t1: pending.time,
            p1: pending.price,
            t2: point.time,
            p2: point.price,
            style: defaultStyleForTool(tool),
            levels: tool === 'fib' ? defaultFibLevelsForTool() : undefined
          }
        ],
        selectedDrawingId: id
      }))
    },

    updateTwoPointEndpoint(id, end, point) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id || !point) return
      if (!Number.isFinite(point.time) || !Number.isFinite(point.price)) return
      set((s) => ({
        drawings: s.drawings.map((d) => {
          if ((d.type !== 'trendline' && d.type !== 'fib') || d.id !== id) return d
          return updateTwoPointEndpointGeom(d, end, point)
        })
      }))
    },

    addFibChannelPoint(point) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!point || !Number.isFinite(point.time) || !Number.isFinite(point.price)) {
        return
      }
      if (get().drawTool !== 'fibchannel') return

      const pending = get().pendingTrend
      if (!pending) {
        set({ pendingTrend: point, pendingTrendEnd: null })
        return
      }
      const pendingEnd = get().pendingTrendEnd
      if (!pendingEnd) {
        set({ pendingTrendEnd: point })
        return
      }

      const id = nextDrawingId()
      set((s) => ({
        pendingTrend: null,
        pendingTrendEnd: null,
        drawTool: 'select',
        drawings: [
          ...s.drawings,
          {
            id,
            type: 'fibchannel' as const,
            t1: pending.time,
            p1: pending.price,
            t2: pendingEnd.time,
            p2: pendingEnd.price,
            t3: point.time,
            p3: point.price,
            style: defaultStyleForTool('fibchannel'),
            levels: defaultFibLevelsForTool()
          }
        ],
        selectedDrawingId: id
      }))
    },

    updateFibChannelHandle(id, handle, point) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id || !point) return
      if (!Number.isFinite(point.time) || !Number.isFinite(point.price)) return
      set((s) => ({
        drawings: s.drawings.map((d) =>
          d.type === 'fibchannel' && d.id === id ? updateFibChannelHandleGeom(d, handle, point) : d
        )
      }))
    },

    updateRectHandle(id, handle, point) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id || !point) return
      if (!Number.isFinite(point.time) || !Number.isFinite(point.price)) return
      set((s) => ({
        drawings: s.drawings.map((d) =>
          d.type === 'rect' && d.id === id ? updateRectHandleGeom(d, handle, point) : d
        )
      }))
    },

    addPosition(point, levels) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      const tool = get().drawTool
      if (!isPositionTool(tool)) return
      if (!point || !Number.isFinite(point.time) || !Number.isFinite(point.price)) return
      const id = nextDrawingId()
      let target = levels?.target ?? null
      let stop = levels?.stop ?? null
      if (target != null && !isValidPositionLevel(tool, 'target', point.price, target)) {
        target = null
      }
      if (stop != null && !isValidPositionLevel(tool, 'stop', point.price, stop)) {
        stop = null
      }
      set((s) => ({
        drawTool: 'select',
        drawings: [
          ...s.drawings,
          {
            id,
            type: tool,
            t: point.time,
            entry: point.price,
            target,
            stop,
            span: POSITION_SPAN_DEFAULT,
            style: defaultStyleForTool(tool)
          } satisfies PositionDrawing
        ],
        selectedDrawingId: id
      }))
    },

    updatePositionLevel(id, level, price) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id || !Number.isFinite(price)) return
      set((s) => ({
        drawings: s.drawings.map((d) => {
          if (!isPositionDrawing(d) || d.id !== id) return d
          if (!isValidPositionLevel(d.type, level, d.entry, price)) return d
          return level === 'target' ? { ...d, target: price } : { ...d, stop: price }
        })
      }))
    },

    clearPositionLevel(id, level) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id) return
      set((s) => ({
        drawings: s.drawings.map((d) => {
          if (!isPositionDrawing(d) || d.id !== id) return d
          return level === 'target' ? { ...d, target: null } : { ...d, stop: null }
        })
      }))
    },

    updatePositionEntry(id, price) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id || !Number.isFinite(price)) return
      set((s) => ({
        drawings: s.drawings.map((d) =>
          isPositionDrawing(d) && d.id === id ? { ...d, entry: price } : d
        )
      }))
    },

    updatePositionSpan(id, span) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id || !Number.isFinite(span)) return
      const clamped = Math.max(POSITION_SPAN_MIN, Math.min(POSITION_SPAN_MAX, Math.round(span)))
      set((s) => ({
        drawings: s.drawings.map((d) =>
          isPositionDrawing(d) && d.id === id ? { ...d, span: clamped } : d
        )
      }))
    },

    cloneDrawing(id) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return null
      if (!id) return null
      const source = get().drawings.find((d) => d.id === id)
      if (!source) return null
      const copy = cloneDrawingGeom(source, nextDrawingId())
      set((s) => ({
        drawings: [...s.drawings, copy],
        selectedDrawingId: copy.id
      }))
      return copy.id
    },

    moveDrawing(id, origin, dTime, dPrice) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id || origin.id !== id) return
      if (!Number.isFinite(dTime) || !Number.isFinite(dPrice)) return
      const next = translateDrawing(origin, dTime, dPrice)
      set((s) => ({
        drawings: s.drawings.map((d) => (d.id === id ? next : d))
      }))
    },

    replaceDrawing(next) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!next?.id) return
      set((s) => ({
        drawings: s.drawings.map((d) => (d.id === next.id ? next : d))
      }))
    },

    updateDrawingStyle(id, patch) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id || !patch) return
      set((s) => ({
        drawings: s.drawings.map((d) => {
          if (d.id !== id) return d
          const base = d.style ?? defaultStyleForTool(drawingToolType(d))
          return { ...d, style: { ...base, ...patch } }
        })
      }))
    },

    updateDrawingLevels(id, levels) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id || !Array.isArray(levels)) return
      set((s) => ({
        drawings: s.drawings.map((d) =>
          (d.type === 'fib' || d.type === 'fibchannel') && d.id === id
            ? { ...d, levels: levels.map((l) => ({ ...l })) }
            : d
        )
      }))
    },

    clearDrawings() {
      set({ drawings: [], pendingTrend: null, pendingTrendEnd: null, selectedDrawingId: null })
    },

    selectDrawing(id) {
      set({ selectedDrawingId: id })
    },

    deleteDrawing(id) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id) return
      set((s) => ({
        drawings: s.drawings.filter((drawing) => drawing.id !== id),
        selectedDrawingId: s.selectedDrawingId === id ? null : s.selectedDrawingId
      }))
    },

    paperBuy() {
      tryOpen('long')
    },

    paperSell() {
      tryOpen('short')
    },

    paperClose(id) {
      tryClose(id)
    },

    paperClosePartial(fraction, id) {
      tryClosePartial(fraction, id)
    },

    placeLimit(side, price, kind) {
      tryPlaceLimit(side, price, kind)
    },

    cancelPending(id) {
      tryCancelPending(id)
    },

    selectWorking(id) {
      if (id != null && !findPositionById(id) && !findPendingById(id)) return
      set({ selectedWorkingId: id })
    },

    setPendingPrice(price) {
      trySetPendingPrice(price)
    },

    setRiskReward(value) {
      const riskReward = clampRiskReward(value)
      set({ riskReward })
      applyRiskRewardGuide(riskReward)
    },

    setTradeSize(value) {
      set({ tradeSize: clampTradeSizeForSymbol(value, get().symbol) })
    },

    setTakeProfit(price, opts) {
      setTakeProfit(price, opts)
    },

    setStopLoss(price, opts) {
      setStopLoss(price, opts)
    },

    setTicketTakeProfit(price, opts) {
      trySetTicketTakeProfit(price, opts)
    },

    setTicketStopLoss(price, opts) {
      trySetTicketStopLoss(price, opts)
    },

    setTicketLimitPrice(price) {
      trySetTicketLimitPrice(price)
    },

    setTicketOrderType(type) {
      if (type !== 'market' && type !== 'limit' && type !== 'stopLimit') return
      set({ ticketOrderType: type })
      if (type === 'market' && get().pricePick === 'limit') {
        set({ pricePick: null })
      }
    },

    setPricePick(kind) {
      if (kind == null) {
        set({ pricePick: null })
        return
      }
      if (get().mode !== 'replay') return
      if (get().replayStatus === 'ended') return
      const next = get().pricePick === kind ? null : kind
      set({
        pricePick: next,
        rewindPick: false,
        drawTool: 'select',
        pendingTrend: null,
        pendingTrendEnd: null
      })
    },

    setRewindPick(active) {
      const next = Boolean(active)
      if (next === get().rewindPick) return
      if (next && get().mode !== 'replay') return
      set(
        next
          ? {
              rewindPick: true,
              drawTool: 'select',
              pendingTrend: null,
              pendingTrendEnd: null,
              pricePick: null
            }
          : { rewindPick: false }
      )
    },
    applyPricePick(price) {
      const kind = get().pricePick
      if (!kind) return
      if (get().mode !== 'replay') return
      if (get().replayStatus === 'ended') return
      if (!Number.isFinite(price)) return

      if (kind === 'limit') {
        trySetTicketLimitPrice(price)
        set({ pricePick: null, replayMessage: null })
        return
      }

      if (kind === 'tp') trySetTicketTakeProfit(price, { linkRr: true })
      else trySetTicketStopLoss(price, { linkRr: true })
      set({ pricePick: null, replayMessage: null })
    },

    dismissSessionReport() {
      set({ sessionReport: null })
    },

    setClosedTradeNote(tradeId, note) {
      if (!tradeId) return
      const cleaned = note == null ? '' : String(note).trim().slice(0, 500)
      set((s) => ({
        closedTrades: s.closedTrades.map((trade) =>
          trade.id === tradeId
            ? cleaned
              ? { ...trade, note: cleaned }
              : (() => {
                  const next = { ...trade }
                  delete next.note
                  return next
                })()
            : trade
        )
      }))
    },

    setSymbol(symbol) {
      // Nothing to reset when the same symbol is already shown without a dataset.
      if (symbol === get().symbol && !get().importMeta) return
      // Replay sessions are locked to the symbol they started on.
      if (get().mode === 'replay') return
      resetReplayState()
      set({
        symbol,
        dataSource: 'imported',
        importMeta: null,
        importedCandles: [],
        importWindow: null,
        tradeSize: clampTradeSizeForSymbol(get().tradeSize, symbol)
      })
      void get().loadCandles()
    },

    setTimeframe(timeframe) {
      if (timeframe === get().timeframe) return
      if (!TIMEFRAMES[timeframe]) return

      if (get().mode === 'replay') {
        void switchReplayTimeframe(timeframe).then(() => {
          if (get().timeframe === timeframe) mirrorTimestepFromChart(timeframe)
        })
        return
      }

      if (get().dataSource === 'imported') {
        const meta = get().importMeta
        if (!importHasTimeframe(meta, timeframe)) {
          set({ error: `Timeframe ${timeframe} is not available for this import.` })
          return
        }
        const nextIntervalSec = intervalSecondsFor(timeframe)
        const source1m = get().importedSourceCandles
        if (isMetatraderImport(meta) && source1m.length) {
          const displayed = displayedFromSource(source1m, timeframe)
          set((s) => ({
            timeframe,
            candles: displayed,
            importedCandles: displayed,
            importWindow: null,
            importMeta: { ...meta, timeframe },
            drawings: remapDrawingsToInterval(get().drawings, nextIntervalSec),
            pendingTrend: remapPendingTrendToInterval(get().pendingTrend, nextIntervalSec),
            pendingTrendEnd: remapPendingTrendToInterval(get().pendingTrendEnd, nextIntervalSec),
            currentCandle: null,
            status: 'ready' as const,
            error: null,
            replayMessage: `MetaTrader ${meta.symbol} ${timeframe} · ${displayed.length.toLocaleString()} candles`,
            chartSync: {
              kind: 'replace' as const,
              fitContent: true,
              revision: s.chartSync.revision + 1
            }
          }))
          mirrorTimestepFromChart(timeframe)
          if (get().chartSplit) {
            void loadSecondaryLiveCandles()
          }
          return
        }
        void (async () => {
          const generation = (loadGeneration += 1)
          set({
            status: 'loading',
            error: null,
            timeframe,
            drawings: remapDrawingsToInterval(get().drawings, nextIntervalSec),
            pendingTrend: remapPendingTrendToInterval(get().pendingTrend, nextIntervalSec),
            pendingTrendEnd: remapPendingTrendToInterval(get().pendingTrendEnd, nextIntervalSec)
          })
          // Newest window for the new timeframe; older bars page in on scroll.
          const loaded = await loadImportedSeries(meta.id, timeframe, tailRange())
          if (generation !== loadGeneration) return
          if (!loaded) {
            set({
              status: 'error',
              error: `Failed to load imported ${timeframe} candles.`
            })
            return
          }
          set((s) => ({
            importMeta: loaded.meta,
            importedCandles: loaded.candles,
            importWindow: loaded.window,
            candles: loaded.candles,
            symbol: loaded.meta.symbol,
            timeframe: loaded.meta.timeframe,
            tradeSize: clampTradeSizeForSymbol(get().tradeSize, loaded.meta.symbol),
            currentCandle: null,
            status: 'ready' as const,
            error: null,
            replayMessage: importedLoadMessage(loaded.meta, loaded.window),
            chartSync: {
              kind: 'replace' as const,
              fitContent: true,
              revision: s.chartSync.revision + 1
            }
          }))
          mirrorTimestepFromChart(get().timeframe)
          if (get().chartSplit) {
            void loadSecondaryLiveCandles()
          }
        })()
        return
      }

      const nextIntervalSec = intervalSecondsFor(timeframe)
      const remappedDrawings = remapDrawingsToInterval(get().drawings, nextIntervalSec)
      const remappedPending = remapPendingTrendToInterval(get().pendingTrend, nextIntervalSec)
      const remappedPendingEnd = remapPendingTrendToInterval(get().pendingTrendEnd, nextIntervalSec)
      resetReplayState({ keepDrawings: true })
      set({
        timeframe,
        candles: [],
        drawings: remappedDrawings,
        pendingTrend: remappedPending,
        pendingTrendEnd: remappedPendingEnd
      })
      mirrorTimestepFromChart(timeframe)
      void get().loadCandles()
      if (get().chartSplit) {
        void loadSecondaryLiveCandles()
      }
    },

    setChartSplit(split) {
      const next = Boolean(split)
      if (next === get().chartSplit) return

      if (!next) {
        stopClock()
        if (get().isPlaying) {
          engine.pause()
          set({
            isPlaying: false,
            replayStatus: get().replayStatus === 'ended' ? 'ended' : 'paused'
          })
        }
        clearSecondaryPane()
        set({ chartSplit: false, driverPane: 'primary' })
        return
      }

      const secondaryTimeframe =
        get().secondaryTimeframe === get().timeframe
          ? defaultSecondaryTimeframe(get().timeframe)
          : get().secondaryTimeframe

      set({ chartSplit: true, secondaryTimeframe, driverPane: 'primary' })

      if (get().mode === 'replay') {
        const candle = engine.getCurrentCandle() || get().currentCandle
        if (candle) {
          void loadSecondaryReplayWindow(candle.time)
        }
      } else {
        void loadSecondaryLiveCandles()
      }
    },

    setSecondaryTimeframe(timeframe) {
      if (!get().chartSplit) return
      if (!TIMEFRAMES[timeframe]) return
      if (timeframe === get().secondaryTimeframe) return

      if (get().dataSource === 'imported') {
        const meta = get().importMeta
        if (!importHasTimeframe(meta, timeframe)) {
          set({ secondaryError: `Timeframe ${timeframe} is not available for this import.` })
          return
        }
      }

      set({ secondaryTimeframe: timeframe })

      if (get().mode === 'replay') {
        const anchor = (engine.getCurrentCandle() || get().currentCandle)?.time
        if (anchor == null) {
          set({ secondaryError: 'Cannot change secondary timeframe without a playhead.' })
          return
        }
        void loadSecondaryReplayWindow(anchor).then((ok) => {
          if (!ok) return
          syncSecondaryToPrimaryCover({ fitContent: false })
        })
        return
      }

      void loadSecondaryLiveCandles()
    },

    setDriverPane(pane) {
      if (pane !== 'primary' && pane !== 'secondary') return
      if (!get().chartSplit) return
      if (get().mode !== 'replay') {
        set({ driverPane: pane })
        return
      }
      if (pane === get().driverPane) return

      stopClock()
      engine.pause()
      secondaryEngine.pause()
      set({ driverPane: pane, isPlaying: false })

      if (pane === 'primary') {
        syncSecondaryToPrimaryCover({ fitContent: false })
        publishStatus()
      } else {
        syncPrimaryToSecondaryCover({ fitContent: false })
        publishSecondary('replace', { fitContent: false })
        publishStatus()
      }
    },

    setReplayTimestep(timeframe) {
      if (!TIMEFRAMES[timeframe]) return
      if (get().syncTimestepWithChart) return
      if (timeframe === get().replayTimestep) return
      resetStepCursor()
      set({ replayTimestep: timeframe })
      if (get().mode === 'replay') publishReplay('append', { fitContent: false })
    },

    setSyncTimestepWithChart(sync) {
      const next = Boolean(sync)
      if (next === get().syncTimestepWithChart) return
      resetStepCursor()
      if (next) {
        set({
          syncTimestepWithChart: true,
          replayTimestep: resolveTimestepOnSyncEnable(get().timeframe, get().replayTimestep)
        })
        if (get().mode === 'replay') publishReplay('append', { fitContent: false })
        return
      }
      set({ syncTimestepWithChart: false })
    },

    ensureReplayTimestepAligned() {
      mirrorTimestepFromChart(get().timeframe)
    },

    async loadCandles() {
      const generation = (loadGeneration += 1)

      if (get().dataSource === 'imported') {
        let meta = get().importMeta
        if (!meta) {
          // No dataset selected yet: adopt the newest import on disk, else
          // fall back to an empty-but-not-broken state.
          const listed = await window.api.listImports()
          const newest = listed.ok ? listed.imports[0] : undefined
          if (newest) {
            await get().selectImportedDataset(newest.id, newest.timeframe)
            return
          }
          set({
            candles: [],
            status: 'ready',
            error: null,
            replayMessage: 'No imported dataset yet — use Import data to load a CSV.'
          })
          return
        }

        set({ status: 'loading', error: null })
        const timeframe = get().timeframe || meta.timeframe
        // Load only the newest window; older bars page in on demand.
        const loaded = await loadImportedSeries(meta.id, timeframe, tailRange())
        if (generation !== loadGeneration) return
        if (!loaded) {
          set({
            candles: [],
            status: 'error',
            error: 'Failed to load imported candles.'
          })
          return
        }

        set({
          importMeta: loaded.meta,
          importedCandles: loaded.candles,
          importWindow: loaded.window,
          candles: loaded.candles,
          status: 'ready',
          error: null,
          symbol: loaded.meta.symbol,
          timeframe: loaded.meta.timeframe,
          tradeSize: clampTradeSizeForSymbol(get().tradeSize, loaded.meta.symbol),
          replayMessage: importedLoadMessage(loaded.meta, loaded.window)
        })
        mirrorTimestepFromChart(get().timeframe)
        if (get().chartSplit) {
          void loadSecondaryLiveCandles()
        }
        return
      }

      set({
        candles: [],
        status: 'ready',
        error: null,
        replayMessage: 'No dataset selected. Import a CSV to load a chart.'
      })
    },

    activateImportedDataset(candles, meta) {
      const normalized = dedupeCandlesByTime(candles)
      if (!normalized.length) {
        set({ status: 'error', error: 'Imported file has no valid candles.' })
        return
      }
      // Freshly imported series are already in memory — treat as fully loaded.
      publishImportedPreview(normalized, meta)
      if (meta.timeframe === '1m') {
        set({ importedSourceCandles: normalized })
      } else if (importHasTimeframe(meta, '1m')) {
        void window.api.loadImport(meta.id, '1m').then((source) => {
          if (!source.ok) return
          set({ importedSourceCandles: dedupeCandlesByTime(source.candles) })
          if (get().mode === 'replay') publishReplay('append', { fitContent: false })
        })
      }
      void get().refreshImportedList()
      if (get().chartSplit) {
        void loadSecondaryLiveCandles()
      }
    },

    clearImportedDataset() {
      if (get().mode === 'replay') return
      resetReplayState()
      set({
        symbol: '',
        timeframe: DEFAULT_TIMEFRAME,
        candles: [],
        status: 'ready',
        error: null,
        importMeta: null,
        importedCandles: [],
        importWindow: null
      })
      mirrorTimestepFromChart(DEFAULT_TIMEFRAME)
    },

    async refreshImportedList() {
      const result = await window.api.listImports()
      if (!result.ok) return
      set({ importedList: result.imports })
    },

    async selectImportedDataset(id, timeframe) {
      if (!id) return
      if (get().mode === 'replay') return

      set({ status: 'loading', error: null })
      // Newest window only — `loadImportedHistory` pages older bars on demand.
      const loaded = await window.api.loadImport(id, timeframe, tailRange())
      if (!loaded.ok) {
        set({ status: 'error', error: loaded.error })
        return
      }

      const candles = dedupeCandlesByTime(loaded.candles)
      if (!candles.length) {
        set({ status: 'error', error: 'Imported file has no valid candles.' })
        return
      }

      const loadedWindow = loaded.window ?? null
      publishImportedPreview(candles, loaded.meta, loadedWindow)
      set({ replayMessage: importedLoadMessage(loaded.meta, loadedWindow) })
      void backfillMissingDerivedTimeframes(id)

      if (isMetatraderImport(loaded.meta)) {
        // MT datasets aggregate higher TFs from 1m, so that series stays whole.
        if (loaded.meta.timeframe === '1m' && !loadedWindow?.hasMoreBefore) {
          set({
            importedSourceCandles: candles,
            replayMessage: importedLoadMessage(loaded.meta, loadedWindow, 'MetaTrader')
          })
        } else {
          const source = await window.api.loadImport(id, '1m')
          if (source.ok) {
            set({
              importedSourceCandles: dedupeCandlesByTime(source.candles),
              replayMessage: importedLoadMessage(loaded.meta, loadedWindow, 'MetaTrader')
            })
          }
        }
      } else if (importHasTimeframe(loaded.meta, '1m')) {
        const source = await window.api.loadImport(id, '1m')
        if (source.ok) {
          set({ importedSourceCandles: dedupeCandlesByTime(source.candles) })
        }
      }
      if (get().chartSplit) {
        void loadSecondaryLiveCandles()
      }
    },

    async selectImportedSymbol(symbol, timeframe) {
      const key = normalizeSymbolKey(symbol)
      if (!key) return
      if (get().mode === 'replay') return

      set({ status: 'loading', error: null })
      // Refresh list so we see every file under this symbol.
      await get().refreshImportedList()
      const files = get().importedList.filter(
        (meta) => normalizeSymbolKey(meta.symbol) === key
      )
      if (!files.length) {
        set({ status: 'error', error: `No imported datasets for ${symbol}.` })
        return
      }

      // Single file — reuse the existing path (paging intact).
      if (files.length === 1) {
        await get().selectImportedDataset(files[0]!.id, timeframe)
        return
      }

      // Multi-CSV merge: load each full series for the requested TF.
      // Sort oldest → newest so later updatedAt overwrites duplicate times.
      const ordered = [...files].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      const primary = ordered[ordered.length - 1]!
      const requested = String(timeframe || primary.timeframe || '1m')

      let merged: Candle[] = []
      let usedTf = requested
      for (const meta of ordered) {
        const tf =
          meta.timeframes[requested] != null
            ? requested
            : meta.timeframes['1m'] != null
              ? '1m'
              : Object.keys(meta.timeframes)[0]
        if (!tf) continue
        usedTf = tf
        // Full series — multi-file merge does not page (documented shortcut).
        const loaded = await window.api.loadImport(meta.id, tf)
        if (!loaded.ok || !loaded.candles.length) continue
        merged = mergeCandlesByTime(merged, loaded.candles)
      }

      if (!merged.length) {
        set({ status: 'error', error: `No candles found for ${symbol} ${requested}.` })
        return
      }

      // Synthetic meta for the session: importId = primary (newest) dataset.
      // Comment locked in data-model-symbol-first.md — primary id is the
      // newest file by updatedAt; candles are the merged union.
      const firstTime = merged[0]!.time
      const lastTime = merged[merged.length - 1]!.time
      const synthetic: ImportedDatasetMeta = {
        ...primary,
        symbol: primary.symbol,
        timeframe: usedTf,
        candleCount: merged.length,
        firstTime,
        lastTime,
        timeframes: {
          ...primary.timeframes,
          [usedTf]: {
            candleCount: merged.length,
            firstTime,
            lastTime
          }
        }
      }

      // Fully loaded window — hasMoreBefore false so history pager no-ops.
      const loadedWindow = {
        loadedFrom: firstTime,
        loadedTo: lastTime,
        hasMoreBefore: false,
        hasMoreAfter: false,
        totalCount: merged.length
      }
      publishImportedPreview(merged, synthetic, loadedWindow)
      set({
        replayMessage: `Merged ${ordered.length} files · ${symbol} ${usedTf} · ${merged.length.toLocaleString()} candles (newer import wins on overlap)`
      })
      if (get().chartSplit) {
        void loadSecondaryLiveCandles()
      }
    },

    async loadImportedHistory() {
      if (get().dataSource !== 'imported') return
      if (prefetchInFlight) return

      const meta = get().importMeta
      if (!meta) return
      // MT imports hold the full 1m series in memory — nothing left to page.
      if (isMetatraderImport(meta) && get().importedSourceCandles.length) return

      const loadedWindow = get().importWindow
      if (!loadedWindow?.hasMoreBefore) return

      const timeframe = get().timeframe
      const generation = loadGeneration
      const replaying = get().mode === 'replay'
      const existing = replaying ? engine.getState().candles : get().importedCandles
      if (!existing.length) return

      prefetchInFlight = true
      set({ isPrefetching: true })

      try {
        const loaded = await loadImportedSeries(
          meta.id,
          timeframe,
          historyRange(loadedWindow.loadedFrom)
        )
        if (generation !== loadGeneration) return
        if (get().timeframe !== timeframe || get().importMeta?.id !== meta.id) return
        if ((get().mode === 'replay') !== replaying) return

        if (!loaded?.candles.length) {
          if (loaded?.window) {
            set((s) => ({ importWindow: mergeLoadedWindow(s.importWindow, loaded.window!) }))
          }
          return
        }

        const merged = dedupeCandlesByTime(loaded.candles.concat(existing))
        const nextWindow = loaded.window
          ? mergeLoadedWindow(get().importWindow, loaded.window)
          : get().importWindow

        if (replaying) {
          // Prepending shifts every index, so re-seek by time to keep the playhead.
          const anchor = engine.getCurrentCandle()?.time ?? null
          const keptSpeed = engine.getState().speed
          loadPrimaryEngine(merged)
          engine.setSpeed(keptSpeed)
          if (anchor != null) engine.seekToTime(anchor)
          set({ importWindow: nextWindow })
          publishReplay('replace', { fitContent: false })
          return
        }

        set((s) => ({
          importedCandles: merged,
          candles: merged,
          importWindow: nextWindow,
          chartSync: {
            kind: 'replace' as const,
            fitContent: false,
            revision: s.chartSync.revision + 1
          }
        }))
      } finally {
        prefetchInFlight = false
        set({ isPrefetching: false })
      }
    },

    startImportedReplay() {
      const meta = get().importMeta
      if (!meta) {
        set({ replayMessage: 'No imported candles to replay.' })
        return
      }
      const first = meta.timeframes?.[get().timeframe]?.firstTime ?? meta.firstTime ?? 0
      // Start on the 5th candle so the first bars are visible as context.
      void startImportedReplayWindow(first, { lookbackBars: 0, startOffsetBars: 4 })
    },

    startImportedReplayAt(startIndex, opts = {}) {
      if (get().dataSource !== 'imported') return
      if (get().mode === 'replay') return

      const candles = get().importedCandles
      if (!candles.length) {
        set({ replayMessage: 'No imported candles to replay.' })
        return
      }

      const idx = Math.min(
        Math.max(0, Math.floor(Number(startIndex)) || 0),
        Math.max(candles.length - 1, 0)
      )
      const candle = candles[idx]
      const defaultMessage =
        idx > 0
          ? `Replay from candle ${idx + 1} of the loaded window.`
          : 'Replay from start of the loaded window.'
      // Indices address the loaded window only, so resolve to a time and let the
      // range loader pull the replay window it needs.
      void startImportedReplayWindow(candle.time, { message: opts.message ?? defaultMessage })
    },

    async startImportedReplayAtTime(startTimeSeconds, opts = {}) {
      await startImportedReplayWindow(startTimeSeconds, opts)
    },

    async startReplayAt(startTimeSeconds, opts = {}) {
      if (get().dataSource === 'imported') {
        await startImportedReplayWindow(startTimeSeconds, {
          message: opts.message,
          forwardBars: opts.forwardBars
        })
        return
      }
      await loadReplayWindow(startTimeSeconds, {
        message: opts.message,
        forwardBars: opts.forwardBars
      })
    },

    async jumpToTime(timeSeconds, opts = {}) {
      if (get().mode !== 'replay') return 'noop'
      resetStepCursor()

      const target = Math.floor(Number(timeSeconds))
      if (!Number.isFinite(target)) {
        set({ replayMessage: 'Invalid jump time.' })
        return 'noop'
      }

      stopClock()
      engine.pause()
      secondaryEngine.pause()
      publishStatus()

      const buffer = engine.getState().candles
      if (buffer.length) {
        const first = buffer[0].time
        const last = buffer[buffer.length - 1].time

        if (target >= first && target <= last) {
          const found = findIndexAtOrBefore(buffer, target)
          const idx = found < 0 ? 0 : found
          const result = requestSeekToIndex(idx, {
            force: opts.force,
            fitContent: true,
            source: opts.source ?? 'jump'
          })
          if (result === 'applied') {
            set({ replayMessage: null })
            void maybePrefetch()
            alignSecondaryAfterPrimaryLoad()
          }
          return result
        }
      }

      // Outside buffer: SoftConfirm when jumping backward past later trades.
      const current = engine.getCurrentCandle() || get().currentCandle
      if (
        current &&
        target < current.time &&
        !opts.force &&
        hasTradeActivityAfter({
          positions: get().positions,
          pendingOrders: get().pendingOrders,
          closedTrades: get().closedTrades,
          orderHistory: get().orderHistory,
          targetCandleTime: target,
          keepUntil: target
        })
      ) {
        set({
          pendingSeekConfirm: {
            kind: 'time',
            time: target,
            resumeIndex: engine.getState().index,
            source: opts.source ?? 'jump'
          }
        })
        return 'needs-confirm'
      }

      const jumped = await jumpImportedToTime(target)
      if (!jumped) {
        set({ replayMessage: 'Jump time is outside the imported dataset.' })
        return 'noop'
      }
      set({ pendingSeekConfirm: null })
      return 'applied'
    },

    finalizeSessionTrades() {
      return finalizeSessionTradesImpl()
    },

    exitReplay() {
      const { dataSource, importedCandles, importMeta } = get()

      finalizeSessionTradesImpl()

      if (dataSource === 'imported' && importMeta && importedCandles.length) {
        const source1m = get().importedSourceCandles
        publishImportedPreview(importedCandles, importMeta)
        if (isMetatraderImport(importMeta) && source1m.length) {
          set({ importedSourceCandles: source1m })
        }
        set({ driverPane: 'primary' })
        // The replay buffer was a range window; reload the live tail window so
        // `importWindow` matches what the live chart now shows.
        if (!isMetatraderImport(importMeta) || !source1m.length) {
          void get().loadCandles()
        } else if (get().chartSplit) {
          void loadSecondaryLiveCandles()
        }
        return
      }

      resetReplayState()
      set({ driverPane: 'primary' })
      void get().loadCandles()
    },

    play() {
      if (get().mode !== 'replay') return
      if (driverEnded()) return
      if (get().replayLoading || get().secondaryLoading) return

      engine.play()
      if (get().chartSplit) secondaryEngine.play()
      if (get().replayMessage?.startsWith('Paused ·')) {
        set({ replayMessage: null })
      }
      publishStatus()
      startClock()
      void maybePrefetch()
      void maybePrefetchSecondary()
    },

    pause() {
      pausePlayback()
    },

    stepForward() {
      if (get().mode !== 'replay') return
      if (get().replayLoading || get().secondaryLoading) return

      stopClock()
      engine.pause()
      secondaryEngine.pause()
      set({ isPlaying: false })

      advanceDriverForward()
      if (driverEnded()) {
        set({ replayStatus: 'ended', isPlaying: false })
      }
    },

    stepBackward() {
      if (get().mode !== 'replay') return
      if (get().replayLoading || get().secondaryLoading) return

      stopClock()
      retreatDriverBackward()
      publishStatus()
    },

    setSpeed(speed) {
      engine.setSpeed(speed)
      secondaryEngine.setSpeed(speed)
      const next = engine.getState().speed
      const { mode, isPlaying } = get()
      set({ speed: next })

      if (mode === 'replay' && isPlaying) {
        engine.play()
        if (get().chartSplit) secondaryEngine.play()
        startClock()
      }
    },

    seekToIndex(index, opts = {}) {
      return requestSeekToIndex(index, opts)
    },

    seekToTime(timeSeconds, opts = {}) {
      if (get().mode !== 'replay') return 'noop'
      const buffer = engine.getState().candles
      if (!buffer.length) return 'noop'
      const found = findIndexAtOrBefore(buffer, timeSeconds)
      return requestSeekToIndex(found < 0 ? 0 : found, opts)
    },

    confirmPendingSeek() {
      const pending = get().pendingSeekConfirm
      if (!pending) return
      set({ pendingSeekConfirm: null })
      if (pending.kind === 'index') {
        // Preview may already sit on the target index with trades untouched —
        // restore the pre-seek playhead so applySeek can rewind from there.
        if (engine.getState().index !== pending.resumeIndex) {
          seekPlayheadOnly(pending.resumeIndex, false)
        }
        applySeekToIndex(pending.index, { fitContent: false })
        void maybePrefetch()
        return
      }
      void get().jumpToTime(pending.time, { force: true })
    },

    cancelPendingSeek() {
      const pending = get().pendingSeekConfirm
      if (!pending) return
      set({ pendingSeekConfirm: null })
      seekPlayheadOnly(pending.resumeIndex, false)
    },

    async focusChartTime(timeSeconds) {
      const target = Math.floor(Number(timeSeconds))
      if (!Number.isFinite(target)) return

      function plottedSeries(): Candle[] {
        return get().mode === 'replay' ? get().visibleCandles : get().candles
      }

      function onSeries(): boolean {
        return isTimeInSeriesRange(target, plottedSeries(), intervalSecondsFor(get().timeframe))
      }

      function emit(): void {
        set((s) => ({
          replayMessage: s.replayMessage === FOCUS_OUT_OF_RANGE_MESSAGE ? null : s.replayMessage,
          chartFocus: { time: target, revision: (s.chartFocus?.revision ?? 0) + 1 }
        }))
      }

      if (onSeries()) {
        emit()
        return
      }

      // A target newer than the playhead is not history — replay has to reach it.
      const plotted = plottedSeries()
      if (plotted.length && target > plotted[plotted.length - 1].time) {
        set({ replayMessage: FOCUS_OUT_OF_RANGE_MESSAGE })
        return
      }

      if (focusInFlight) return
      focusInFlight = true
      set({ isPrefetching: true })

      try {
        const loaded = await loadHistoryForFocus(target)
        if (!loaded || !onSeries()) {
          set({ replayMessage: FOCUS_OUT_OF_RANGE_MESSAGE })
          return
        }
        emit()
      } catch (err) {
        const message = err instanceof Error ? err.message : FOCUS_OUT_OF_RANGE_MESSAGE
        set({ replayMessage: message })
      } finally {
        focusInFlight = false
        // A concurrent prefetch owns the spinner until its own finally runs.
        if (!prefetchInFlight) set({ isPrefetching: false })
      }
    },

    resetReplayState
  }
})
