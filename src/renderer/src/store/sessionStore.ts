import { create } from 'zustand'
import type { Drawing, FibLevelConfig } from '@/lib/chart/drawingGeometry'
import {
  exportDrawings,
  importDrawings,
  legacyDrawingsToJSON
} from '@/lib/drawings/drawingBridge'
import type {
  ClosedTrade,
  HistoricOrder,
  PendingOrder,
  PendingOrderKind,
  Position
} from '@/lib/paperTrade'
import { useReplayStore, type ViewMode } from '@/store/replayStore'
import { useDrawingUiStore } from '@/store/drawingUiStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

const STORAGE_KEY = 'bar-replay:sessions'

export const SESSION_NAME_MAX_LENGTH = 48

/** Debounce between a chart change and the auto-save write. */
const AUTO_SAVE_DEBOUNCE_MS = 800

/**
 * A named, persisted bundle of the chart state: the drawings on the chart,
 * every paper-trade order (open position, pending limit or stop-limit, closed trades,
 * and order history including canceled pendings),
 * and the replay position — captured together. With `autoSave` enabled the
 * bundle follows live edits, so the replay playhead is kept up to date while
 * the app is closed and can be resumed later from the same spot.
 */
export type Session = {
  id: string
  name: string
  symbol: string
  timeframe: string
  createdAt: number
  updatedAt: number
  /** When true, chart drawing/order edits are written back automatically. */
  autoSave: boolean
  /**
   * Drawings in lightweight-charts-drawing JSON format (source of truth for
   * the DrawingManager). Legacy hand-built drawings are migrated on load.
   */
  drawingsJSON: string
  positions: Position[]
  pendingOrders: PendingOrder[]
  closedTrades: ClosedTrade[]
  orderHistory: HistoricOrder[]
  /** Closed trades whose arrows are drawn on the chart. */
  shownClosedTradeIds: string[]
  /** Hide every open-position drawing on the chart. */
  chartPositionsHidden: boolean
  /** Open positions omitted from the chart. */
  hiddenPositionIds: string[]
  /** Live vs replay — the mode the chart was in when captured. */
  mode: ViewMode
  /** Playhead candle open time (unix seconds); null when not in replay. */
  replayTime: number | null
  speed: number
  dataSource: 'imported'
  /** Imported dataset id to reload when resuming an imported replay. */
  importId: string | null
  /**
   * Account balance for the session, denominated in USD (the fixed account
   * currency). Realized P/L is converted to USD before being added.
   */
  startingBalance: number
  /** Optional strategy this backtesting session belongs to. */
  strategyId?: string
}

type SessionSnapshot = Pick<
  Session,
  | 'symbol'
  | 'timeframe'
  | 'drawingsJSON'
  | 'positions'
  | 'pendingOrders'
  | 'closedTrades'
  | 'orderHistory'
  | 'shownClosedTradeIds'
  | 'chartPositionsHidden'
  | 'hiddenPositionIds'
  | 'mode'
  | 'replayTime'
  | 'speed'
  | 'dataSource'
  | 'importId'
>

type SessionStoreState = {
  sessions: Session[]
  /** The session currently receiving auto-saves; null when none is active. */
  activeSessionId: string | null
  createSession: (name: string) => string | null
  renameSession: (id: string, name: string) => void
  /** Local copy of a session (new id, “(copy)” name). */
  duplicateSession: (id: string) => string | null
  deleteSession: (id: string) => void
  setActiveSession: (id: string | null) => void
  /** Restore a session's drawings, orders, and replay position onto the chart. */
  loadSession: (id: string) => Promise<boolean>
  /** Write the current chart drawings/orders into the active session. */
  saveActiveSession: () => boolean
  setSessionAutoSave: (id: string, enabled: boolean) => void
  /**
   * Create a brand-new backtesting session from a symbol (merged imports) and enter
   * it: the chart is positioned at `startDate` in replay context.
   */
  openSession: (input: {
    name?: string
    /** Symbol whose imported files are merged for the session. */
    symbol: string
    timeframe: string
    startDate: number
    balance: number
    strategyId?: string
  }) => Promise<string | null>
  /** Save the active session snapshot and return to the session list. */
  closeActiveSession: () => Promise<void>
}

function cloneJson<T>(value: T): T {
  return value == null ? value : (JSON.parse(JSON.stringify(value)) as T)
}

/** Capture the current chart drawings, orders, and replay position. */
function chartSnapshot(): SessionSnapshot {
  const state = useReplayStore.getState()
  const ui = useUiLayoutStore.getState()
  return {
    symbol: state.symbol,
    timeframe: state.timeframe,
    drawingsJSON: exportDrawings(),
    positions: cloneJson(state.positions),
    pendingOrders: cloneJson(state.pendingOrders),
    closedTrades: cloneJson(state.closedTrades),
    orderHistory: cloneJson(state.orderHistory),
    shownClosedTradeIds: [...ui.shownClosedTradeIds],
    chartPositionsHidden: ui.chartPositionsHidden,
    hiddenPositionIds: [...ui.hiddenPositionIds],
    mode: state.mode,
    replayTime: state.mode === 'replay' && state.currentCandle ? state.currentCandle.time : null,
    speed: state.speed,
    dataSource: state.dataSource,
    importId: state.importMeta?.id ?? null
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function sanitizeStyle(raw: unknown): Drawing['style'] {
  if (!raw || typeof raw !== 'object') return undefined
  const rec = raw as Record<string, unknown>
  const style: Partial<NonNullable<Drawing['style']>> = {}
  if (typeof rec.color === 'string' && rec.color.length > 0) style.color = rec.color
  if (isFiniteNumber(rec.lineWidth)) style.lineWidth = rec.lineWidth
  if (typeof rec.lineStyle === 'number') {
    style.lineStyle = rec.lineStyle as NonNullable<Drawing['style']>['lineStyle']
  }
  if (typeof rec.fillColor === 'string' && rec.fillColor.length > 0) style.fillColor = rec.fillColor
  if (typeof rec.tpColor === 'string' && rec.tpColor.length > 0) style.tpColor = rec.tpColor
  if (typeof rec.slColor === 'string' && rec.slColor.length > 0) style.slColor = rec.slColor
  return Object.keys(style).length > 0 ? (style as Drawing['style']) : undefined
}

function sanitizeFibLevels(raw: unknown): FibLevelConfig[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const levels: FibLevelConfig[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    if (!isFiniteNumber(rec.ratio)) continue
    const level: FibLevelConfig = { ratio: rec.ratio }
    if (typeof rec.color === 'string' && rec.color.length > 0) level.color = rec.color
    if (typeof rec.lineStyle === 'number') {
      level.lineStyle = rec.lineStyle as FibLevelConfig['lineStyle']
    }
    levels.push(level)
  }
  return levels.length > 0 ? levels : undefined
}

function sanitizeDrawing(raw: unknown): Drawing | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  if (typeof rec.id !== 'string' || rec.id.length === 0) return null
  const style = sanitizeStyle(rec.style)

  switch (rec.type) {
    case 'hline': {
      if (!isFiniteNumber(rec.price)) return null
      return { id: rec.id, type: 'hline', price: rec.price, ...(style ? { style } : {}) }
    }
    case 'trendline':
    case 'rect': {
      if (
        !isFiniteNumber(rec.t1) ||
        !isFiniteNumber(rec.p1) ||
        !isFiniteNumber(rec.t2) ||
        !isFiniteNumber(rec.p2)
      ) {
        return null
      }
      return {
        id: rec.id,
        type: rec.type,
        t1: rec.t1,
        p1: rec.p1,
        t2: rec.t2,
        p2: rec.p2,
        ...(style ? { style } : {})
      }
    }
    case 'fib': {
      if (
        !isFiniteNumber(rec.t1) ||
        !isFiniteNumber(rec.p1) ||
        !isFiniteNumber(rec.t2) ||
        !isFiniteNumber(rec.p2)
      ) {
        return null
      }
      const levels = sanitizeFibLevels(rec.levels)
      return {
        id: rec.id,
        type: 'fib',
        t1: rec.t1,
        p1: rec.p1,
        t2: rec.t2,
        p2: rec.p2,
        ...(style ? { style } : {}),
        ...(levels ? { levels } : {})
      }
    }
    case 'fibchannel': {
      if (
        !isFiniteNumber(rec.t1) ||
        !isFiniteNumber(rec.p1) ||
        !isFiniteNumber(rec.t2) ||
        !isFiniteNumber(rec.p2) ||
        !isFiniteNumber(rec.t3) ||
        !isFiniteNumber(rec.p3)
      ) {
        return null
      }
      const levels = sanitizeFibLevels(rec.levels)
      return {
        id: rec.id,
        type: 'fibchannel',
        t1: rec.t1,
        p1: rec.p1,
        t2: rec.t2,
        p2: rec.p2,
        t3: rec.t3,
        p3: rec.p3,
        ...(style ? { style } : {}),
        ...(levels ? { levels } : {})
      }
    }
    case 'long':
    case 'short': {
      if (!isFiniteNumber(rec.t) || !isFiniteNumber(rec.entry)) return null
      return {
        id: rec.id,
        type: rec.type,
        t: rec.t,
        entry: rec.entry,
        target: isFiniteNumber(rec.target) ? rec.target : null,
        stop: isFiniteNumber(rec.stop) ? rec.stop : null,
        span: isFiniteNumber(rec.span) ? rec.span : 6,
        ...(style ? { style } : {})
      }
    }
    default:
      return null
  }
}

function sanitizeSide(raw: unknown): 'long' | 'short' | null {
  return raw === 'long' || raw === 'short' ? raw : null
}

function sanitizePendingKind(raw: unknown): PendingOrderKind | undefined {
  return raw === 'stopLimit' || raw === 'limit' ? raw : undefined
}

function sanitizePositionList(raw: unknown, legacy: unknown): Position[] {
  const out: Position[] = []
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const position = sanitizePosition(item)
      if (position) out.push(position)
    }
    return out
  }
  const one = sanitizePosition(legacy)
  return one ? [one] : []
}

function sanitizePendingOrderList(raw: unknown, legacy: unknown): PendingOrder[] {
  const out: PendingOrder[] = []
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const pending = sanitizePendingOrder(item)
      if (pending) out.push(pending)
    }
    return out
  }
  const one = sanitizePendingOrder(legacy)
  return one ? [one] : []
}

function sanitizePosition(raw: unknown): Position | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const side = sanitizeSide(rec.side)
  if (typeof rec.id !== 'string' || rec.id.length === 0 || side == null) return null
  if (
    !isFiniteNumber(rec.entryPrice) ||
    !isFiniteNumber(rec.entryTime) ||
    !isFiniteNumber(rec.lots)
  ) {
    return null
  }
  return {
    id: rec.id,
    side,
    entryPrice: rec.entryPrice,
    entryTime: rec.entryTime,
    lots: rec.lots,
    takeProfit: isFiniteNumber(rec.takeProfit) ? rec.takeProfit : null,
    stopLoss: isFiniteNumber(rec.stopLoss) ? rec.stopLoss : null,
    ...(isFiniteNumber(rec.pendingPlacedTime)
      ? { pendingPlacedTime: rec.pendingPlacedTime as number }
      : {}),
    ...(sanitizePendingKind(rec.pendingKind)
      ? { pendingKind: sanitizePendingKind(rec.pendingKind) }
      : {})
  }
}

function sanitizePendingOrder(raw: unknown): PendingOrder | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const side = sanitizeSide(rec.side)
  if (typeof rec.id !== 'string' || rec.id.length === 0 || side == null) return null
  if (!isFiniteNumber(rec.price) || !isFiniteNumber(rec.placedTime) || !isFiniteNumber(rec.lots)) {
    return null
  }
  return {
    id: rec.id,
    side,
    kind: sanitizePendingKind(rec.kind) ?? 'limit',
    price: rec.price,
    placedTime: rec.placedTime,
    lots: rec.lots,
    takeProfit: isFiniteNumber(rec.takeProfit) ? rec.takeProfit : null,
    stopLoss: isFiniteNumber(rec.stopLoss) ? rec.stopLoss : null
  }
}

const EXIT_REASONS = ['manual', 'tp', 'sl', 'session_exit'] as const
const ORDER_TYPES = ['market', 'limit', 'stopLimit'] as const
const ORDER_STATUSES = ['filled', 'canceled'] as const

function sanitizeClosedTrade(raw: unknown): ClosedTrade | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const side = sanitizeSide(rec.side)
  const reason = EXIT_REASONS.find((item) => item === rec.exitReason)
  if (typeof rec.id !== 'string' || rec.id.length === 0 || side == null || reason == null) {
    return null
  }
  if (
    !isFiniteNumber(rec.entryPrice) ||
    !isFiniteNumber(rec.entryTime) ||
    !isFiniteNumber(rec.exitPrice) ||
    !isFiniteNumber(rec.exitTime) ||
    !isFiniteNumber(rec.lots) ||
    !isFiniteNumber(rec.pnl)
  ) {
    return null
  }
  return {
    id: rec.id,
    side,
    entryPrice: rec.entryPrice,
    entryTime: rec.entryTime,
    exitPrice: rec.exitPrice,
    exitTime: rec.exitTime,
    lots: rec.lots,
    pnl: rec.pnl,
    exitReason: reason,
    takeProfit: isFiniteNumber(rec.takeProfit) ? rec.takeProfit : null,
    stopLoss: isFiniteNumber(rec.stopLoss) ? rec.stopLoss : null,
    ...(isFiniteNumber(rec.pendingPlacedTime)
      ? { pendingPlacedTime: rec.pendingPlacedTime as number }
      : {}),
    ...(sanitizePendingKind(rec.pendingKind)
      ? { pendingKind: sanitizePendingKind(rec.pendingKind) }
      : {})
  }
}

function sanitizeHistoricOrder(raw: unknown): HistoricOrder | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const side = sanitizeSide(rec.side)
  const type = ORDER_TYPES.find((item) => item === rec.type)
  const status = ORDER_STATUSES.find((item) => item === rec.status)
  if (
    typeof rec.id !== 'string' ||
    rec.id.length === 0 ||
    side == null ||
    type == null ||
    status == null
  ) {
    return null
  }
  if (
    !isFiniteNumber(rec.price) ||
    !isFiniteNumber(rec.lots) ||
    !isFiniteNumber(rec.placedTime) ||
    !isFiniteNumber(rec.updateTime)
  ) {
    return null
  }
  return {
    id: rec.id,
    side,
    type,
    status,
    price: rec.price,
    lots: rec.lots,
    placedTime: rec.placedTime,
    updateTime: rec.updateTime,
    takeProfit: isFiniteNumber(rec.takeProfit) ? rec.takeProfit : null,
    stopLoss: isFiniteNumber(rec.stopLoss) ? rec.stopLoss : null
  }
}

function sanitizeSession(raw: unknown): Session | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const name = typeof rec.name === 'string' ? rec.name.trim().slice(0, SESSION_NAME_MAX_LENGTH) : ''
  if (!name) return null
  const id = typeof rec.id === 'string' && rec.id.length > 0 ? rec.id : crypto.randomUUID()
  const createdAt = isFiniteNumber(rec.createdAt) ? rec.createdAt : Date.now()
  const updatedAt = isFiniteNumber(rec.updatedAt) ? rec.updatedAt : createdAt

  // Legacy hand-built drawings (SVG era) migrate into the lib JSON; lib-format
  // JSON passes through untouched.
  const legacyDrawings: Drawing[] = []
  if (Array.isArray(rec.drawings)) {
    for (const item of rec.drawings) {
      const drawing = sanitizeDrawing(item)
      if (drawing) legacyDrawings.push(drawing)
    }
  }
  const drawingsJSON =
    typeof rec.drawingsJSON === 'string' && rec.drawingsJSON.length > 0
      ? rec.drawingsJSON
      : legacyDrawingsToJSON(
          legacyDrawings,
          isFiniteNumber(rec.replayTime) ? rec.replayTime : 0
        )

  const closedTrades: ClosedTrade[] = []
  if (Array.isArray(rec.closedTrades)) {
    for (const item of rec.closedTrades) {
      const trade = sanitizeClosedTrade(item)
      if (trade) closedTrades.push(trade)
    }
  }

  const orderHistory: HistoricOrder[] = []
  if (Array.isArray(rec.orderHistory)) {
    for (const item of rec.orderHistory) {
      const order = sanitizeHistoricOrder(item)
      if (order) orderHistory.push(order)
    }
  }

  const shownClosedTradeIds = Array.isArray(rec.shownClosedTradeIds)
    ? rec.shownClosedTradeIds.filter((id): id is string => typeof id === 'string')
    : []
  const chartPositionsHidden = rec.chartPositionsHidden === true
  const hiddenPositionIds = Array.isArray(rec.hiddenPositionIds)
    ? rec.hiddenPositionIds.filter((id): id is string => typeof id === 'string')
    : []

  return {
    id,
    name,
    symbol: typeof rec.symbol === 'string' ? rec.symbol : '',
    timeframe: typeof rec.timeframe === 'string' ? rec.timeframe : '',
    createdAt,
    updatedAt,
    autoSave: rec.autoSave !== false,
    drawingsJSON,
    positions: sanitizePositionList(rec.positions, rec.position),
    pendingOrders: sanitizePendingOrderList(rec.pendingOrders, rec.pendingOrder),
    closedTrades,
    orderHistory,
    shownClosedTradeIds,
    chartPositionsHidden,
    hiddenPositionIds,
    mode: rec.mode === 'replay' ? 'replay' : 'live',
    replayTime: isFiniteNumber(rec.replayTime) ? rec.replayTime : null,
    speed: isFiniteNumber(rec.speed) ? Math.min(1000, Math.max(0.1, rec.speed)) : 1,
    // Older sessions may persist 'binance'/'mtbridge'; both normalize to imported.
    dataSource: 'imported',
    importId: typeof rec.importId === 'string' && rec.importId.length > 0 ? rec.importId : null,
    startingBalance:
      isFiniteNumber(rec.startingBalance) && rec.startingBalance > 0 ? rec.startingBalance : 100000,
    strategyId: typeof rec.strategyId === 'string' && rec.strategyId.length > 0 ? rec.strategyId : undefined
  }
}

function loadPersisted(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return []
    const rec = parsed as Record<string, unknown>
    if (!Array.isArray(rec.sessions)) return []
    const sessions: Session[] = []
    const seen = new Set<string>()
    for (const item of rec.sessions) {
      const session = sanitizeSession(item)
      if (!session || seen.has(session.id)) continue
      seen.add(session.id)
      sessions.push(session)
    }
    return sessions
  } catch {
    return []
  }
}

function persistLive(): void {
  try {
    const { sessions } = useSessionStore.getState()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions }))
  } catch {
    // ignore quota / private mode
  }
}

/** Merge a fresh chart snapshot into an existing session and persist it. */
function updateSessionSnapshot(id: string, snap: SessionSnapshot): boolean {
  const state = useSessionStore.getState()
  const exists = state.sessions.some((session) => session.id === id)
  if (!exists) return false
  useSessionStore.setState((current) => ({
    sessions: current.sessions.map((session) =>
      session.id === id ? { ...session, ...snap, updatedAt: Date.now() } : session
    )
  }))
  persistLive()
  return true
}

const initialSessions = loadPersisted()

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  sessions: initialSessions,
  activeSessionId: null,

  createSession(name) {
    const trimmed = name.trim().slice(0, SESSION_NAME_MAX_LENGTH)
    if (!trimmed) return null
    const session: Session = {
      id: crypto.randomUUID(),
      name: trimmed,
      autoSave: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      startingBalance: 100000,
      ...chartSnapshot()
    }
    set((state) => ({ sessions: [...state.sessions, session], activeSessionId: session.id }))
    persistLive()
    return session.id
  },

  renameSession(id, name) {
    const trimmed = name.trim().slice(0, SESSION_NAME_MAX_LENGTH)
    if (!trimmed) return
    const sessions = get().sessions.map((session) =>
      session.id === id ? { ...session, name: trimmed, updatedAt: Date.now() } : session
    )
    set({ sessions })
    persistLive()
  },

  duplicateSession(id) {
    const src = get().sessions.find((session) => session.id === id)
    if (!src) return null
    const base = src.name.trim() || 'Session'
    const suffix = ' (copy)'
    const name = `${base}${suffix}`.slice(0, SESSION_NAME_MAX_LENGTH)
    const session: Session = {
      ...cloneJson(src),
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    set((state) => ({ sessions: [...state.sessions, session] }))
    persistLive()
    return session.id
  },

  deleteSession(id) {
    const sessions = get().sessions.filter((session) => session.id !== id)
    if (sessions.length === get().sessions.length) return
    set((state) => ({
      sessions,
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId
    }))
    persistLive()
  },

  setActiveSession(id) {
    if (get().activeSessionId === id) return
    set({ activeSessionId: id })
  },

  async loadSession(id) {
    const session = get().sessions.find((item) => item.id === id)
    if (!session) return false
    const leavingId = get().activeSessionId
    if (leavingId != null && leavingId !== id) {
      updateSessionSnapshot(leavingId, chartSnapshot())
    }
    suppressAutoSave += 1
    try {
      const replay = useReplayStore.getState()
      const replayTime = session.replayTime

      if (session.importId) {
        // Imported sessions always open in replay context — positioned at the
        // saved playhead, or at the start of the dataset for fresh sessions.
        if (replay.mode === 'replay') {
          useReplayStore.getState().resetReplayState()
        }
        // Re-read after resetReplayState: it clears importMeta when the
        // previous session was still in replay mode.
        const afterReset = useReplayStore.getState()
        if (afterReset.importMeta?.id !== session.importId || afterReset.timeframe !== session.timeframe) {
          await useReplayStore
            .getState()
            .selectImportedDataset(session.importId, session.timeframe)
        }
        // Align before the first window load: a Timestep left over from the
        // session we just left must not trigger a needless full 1m source load.
        useReplayStore.getState().ensureReplayTimestepAligned()
        const meta = useReplayStore.getState().importMeta
        const target =
          replayTime ??
          meta?.timeframes[session.timeframe]?.firstTime ??
          meta?.timeframes['1m']?.firstTime ??
          0
        if (target > 0) {
          // Imported series load in windows, so resume by time instead of index.
          await useReplayStore.getState().startImportedReplayAtTime(target)
        }
        useReplayStore.getState().setSpeed(session.speed)
      } else if (replayTime != null) {
        // Legacy snapshot without a dataset link.
        if (replay.symbol !== session.symbol || replay.timeframe !== session.timeframe) {
          useReplayStore.setState({
            symbol: session.symbol,
            timeframe: session.timeframe,
            dataSource: 'imported'
          })
          await useReplayStore.getState().loadCandles()
        }
        await useReplayStore.getState().startReplayAt(replayTime)
        useReplayStore.getState().setSpeed(session.speed)
      }

      // Restore drawings and orders after the replay is positioned so the
      // entering-replay reset does not wipe them.
      useDrawingUiStore.getState().resetWorkspace()
      importDrawings(session.drawingsJSON)
      useReplayStore.setState({
        drawTool: 'select',
        pendingTrend: null,
        pendingTrendEnd: null,
        selectedDrawingId: null,
        positions: cloneJson(session.positions),
        pendingOrders: cloneJson(session.pendingOrders),
        selectedWorkingId: null,
        closedTrades: cloneJson(session.closedTrades),
        orderHistory: cloneJson(session.orderHistory ?? [])
      })
      useUiLayoutStore.setState({
        shownClosedTradeIds: [...session.shownClosedTradeIds],
        chartPositionsHidden: session.chartPositionsHidden,
        hiddenPositionIds: [...session.hiddenPositionIds]
      })
      set({ activeSessionId: id })
      return true
    } finally {
      suppressAutoSave -= 1
    }
  },

  async openSession(input) {
    suppressAutoSave += 1
    try {
      useDrawingUiStore.getState().resetWorkspace()
      useUiLayoutStore.setState({
        shownClosedTradeIds: [],
        chartPositionsHidden: false,
        hiddenPositionIds: []
      })
      const replay = useReplayStore.getState()
      if (replay.mode === 'replay') {
        useReplayStore.getState().resetReplayState()
      }
      // Re-read after resetReplayState (it clears importMeta in replay mode).
      const afterReset = useReplayStore.getState()
      const wantSymbol = String(input.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
      const haveSymbol = String(afterReset.importMeta?.symbol || afterReset.symbol || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
      if (haveSymbol !== wantSymbol || afterReset.timeframe !== input.timeframe) {
        // Merges all CSVs under the symbol; importId on the session = primary file.
        await useReplayStore.getState().selectImportedSymbol(input.symbol, input.timeframe)
      }
      // A leftover finer Timestep must not force a full 1m load for this window.
      useReplayStore.getState().ensureReplayTimestepAligned()
      await useReplayStore.getState().startImportedReplayAtTime(input.startDate)
      useReplayStore.getState().setSpeed(1)
      // A stale report from a previously closed session must not pop here.
      useReplayStore.setState({ sessionReport: null })

      const snap = chartSnapshot()
      const symbol = snap.symbol || 'Session'
      const autoName = `${symbol} ${new Date(input.startDate * 1000).toISOString().slice(0, 10)}`
      const name = (input.name?.trim() || autoName).slice(0, SESSION_NAME_MAX_LENGTH)
      const session: Session = {
        id: crypto.randomUUID(),
        name,
        autoSave: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        startingBalance: input.balance > 0 ? input.balance : 100000,
        ...(input.strategyId ? { strategyId: input.strategyId } : {}),
        ...snap
      }
      set((s) => ({ sessions: [...s.sessions, session], activeSessionId: session.id }))
      persistLive()
      return session.id
    } finally {
      suppressAutoSave -= 1
    }
  },

  async closeActiveSession() {
    const id = get().activeSessionId
    if (id == null) return
    suppressAutoSave += 1
    try {
      // Exit is non-destructive: persist the playhead, open orders, drawings,
      // and trade state so reopening the session continues exactly here.
      updateSessionSnapshot(id, chartSnapshot())
      useReplayStore.setState({ sessionReport: null })
      // Return the chart store to its neutral state while on the dashboard:
      // otherwise the lingering replay mode would keep the import button on
      // the Datasets tab disabled.
      useReplayStore.getState().resetReplayState()
      useDrawingUiStore.getState().resetWorkspace()
      set({ activeSessionId: null })
    } finally {
      suppressAutoSave -= 1
    }
  },

  saveActiveSession() {
    const activeId = get().activeSessionId
    if (activeId == null) return false
    return updateSessionSnapshot(activeId, chartSnapshot())
  },

  setSessionAutoSave(id, enabled) {
    const sessions = get().sessions.map((session) =>
      session.id === id ? { ...session, autoSave: enabled } : session
    )
    set({ sessions })
    persistLive()
  }
}))

/** Set >0 while `loadSession` is writing to the replay store to skip auto-saves. */
let suppressAutoSave = 0
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleAutoSave(): void {
  if (suppressAutoSave > 0) return
  const state = useSessionStore.getState()
  if (state.activeSessionId == null) return
  const active = state.sessions.find((session) => session.id === state.activeSessionId)
  if (!active || !active.autoSave) return
  const captured = suppressAutoSave
  if (autoSaveTimer != null) globalThis.clearTimeout(autoSaveTimer)
  autoSaveTimer = globalThis.setTimeout(() => {
    autoSaveTimer = null
    if (suppressAutoSave !== captured) return
    const current = useSessionStore.getState()
    if (current.activeSessionId == null) return
    updateSessionSnapshot(current.activeSessionId, chartSnapshot())
  }, AUTO_SAVE_DEBOUNCE_MS)
}

/** Follow drawing/order edits, replay progress, and drawing-canvas changes so
 * an auto-saving session stays in sync — including the playhead, which is what
 * makes resume possible. */
useReplayStore.subscribe((state, prev) => {
  if (
    state.positions !== prev.positions ||
    state.pendingOrders !== prev.pendingOrders ||
    state.closedTrades !== prev.closedTrades ||
    state.orderHistory !== prev.orderHistory ||
    state.symbol !== prev.symbol ||
    state.timeframe !== prev.timeframe ||
    state.currentCandle !== prev.currentCandle ||
    state.speed !== prev.speed
  ) {
    scheduleAutoSave()
  }
})

/** Drawing-canvas changes (lib change events bump the revision). */
useDrawingUiStore.subscribe((state, prev) => {
  if (state.revision !== prev.revision) scheduleAutoSave()
})

/** Chart visibility choices belong to the session snapshot too. */
useUiLayoutStore.subscribe((state, prev) => {
  if (
    state.shownClosedTradeIds !== prev.shownClosedTradeIds ||
    state.chartPositionsHidden !== prev.chartPositionsHidden ||
    state.hiddenPositionIds !== prev.hiddenPositionIds
  ) {
    scheduleAutoSave()
  }
})
