import { create } from 'zustand'
import type { IChartApi } from 'lightweight-charts'
import type { SessionReport } from '@/store/replayStore'

const STORAGE_KEY = 'bar-replay:ui-layout:v2'

/** Primary left-sidebar destinations (FX Replay–style). */
export type SidebarNav = 'testing' | 'strategies' | 'datasets' | 'symbols' | 'settings'

/** Horizontal sub-tabs when Testing is selected. */
export type TestingTab = 'dashboard' | 'sessions' | 'trades' | 'analytics'

/** @deprecated Prefer SidebarNav + TestingTab; kept for older call sites. */
export type DashboardTab = TestingTab | 'datasets' | 'symbols' | 'strategies' | 'settings'

export type PanelPos = { x: number; y: number }

/** Chart settings pages, in TradingView order. */
export type ChartSettingsTab = 'symbol' | 'canvas' | 'scales'

/** Which side panel sits left of the right-hand icon rail. Null is collapsed. */
export type RightDock = 'order' | 'objects' | 'journal' | null

type PersistedLayout = {
  replayControlsPos?: PanelPos | null
  tradePanelPos?: PanelPos
  drawingWidgetPos?: PanelPos
  showMainToolbar?: boolean
  showStatusBar?: boolean
  showDrawingToolbar?: boolean
  showReplayControls?: boolean
  showPaperTrade?: boolean
  hasCompletedTour?: boolean
  tradeMarksVisible?: boolean
  rightDock?: RightDock
}

type UiLayoutState = {
  chartFullscreen: boolean
  /** null means use default placement (bottom-center) on first layout */
  replayControlsPos: PanelPos | null
  tradePanelPos: PanelPos | null
  /** Last dragged position of the drawing-style floating widget; null re-anchors to the drawing. */
  drawingWidgetPos: PanelPos | null
  showMainToolbar: boolean
  showStatusBar: boolean
  showDrawingToolbar: boolean
  showReplayControls: boolean
  showPaperTrade: boolean
  /** Trade entry/exit markers on the chart (FXR "Hide marks"). */
  tradeMarksVisible: boolean
  /** Side panel left of the right icon rail. Null keeps only the icons. */
  rightDock: RightDock
  /** Session-only previous rail selection, restored when the tour preview ends. */
  tourRightDockRestore: RightDock
  shortcutsDialogOpen: boolean
  aboutDialogOpen: boolean
  importDataDialogOpen: boolean
  chartSettingsDialogOpen: boolean
  /** Which page the chart settings dialog opens on. */
  chartSettingsTab: ChartSettingsTab
  /** Active left-sidebar destination. */
  sidebarNav: SidebarNav
  /** Active Testing sub-tab (only meaningful when sidebarNav === 'testing'). */
  testingTab: TestingTab
  /**
   * @deprecated Derived bridge for older callers — prefer sidebarNav / testingTab.
   * Writing via setDashboardTab still works.
   */
  dashboardTab: DashboardTab
  hasCompletedTour: boolean
  /** Session-only counter; bumping it asks AppTour to (re)start. */
  tourRequestId: number
  /** Session-only; bump to open the Jump / Replay-to-date menu in ReplayControls. */
  jumpMenuRequestId: number
  /** Session-only: show the paper-trade chrome during the tour without entering replay. */
  tourPaperTradePreview: boolean
  /** Session-only: `showPaperTrade` to restore after the tour preview. */
  tourPaperTradeRestore: boolean | null
  /** Session-only: positions / orders book above the bottom trade bar. */
  tradeBookOpen: boolean
  /**
   * Closed trades whose arrows are on the chart. Persisted with the session so
   * reopening it restores the same annotations.
   */
  shownClosedTradeIds: string[]
  /** Hide every open-position drawing on the chart. Persisted with the session. */
  chartPositionsHidden: boolean
  /** Open positions omitted from the chart. Persisted with the session. */
  hiddenPositionIds: string[]
  /** Primary chart instance, used by chart snapshot actions. */
  primaryChart: IChartApi | null
  /** Preview session report shown in the session report dialog; null when closed. */
  previewSessionReport: SessionReport | null
  toggleChartFullscreen: () => void
  setChartFullscreen: (value: boolean) => void
  setReplayControlsPos: (pos: PanelPos) => void
  setTradePanelPos: (pos: PanelPos) => void
  setDrawingWidgetPos: (pos: PanelPos) => void
  toggleMainToolbar: () => void
  toggleStatusBar: () => void
  toggleDrawingToolbar: () => void
  toggleReplayControls: () => void
  togglePaperTrade: () => void
  setTradeMarksVisible: (value: boolean) => void
  setRightDock: (value: RightDock) => void
  setShortcutsDialogOpen: (value: boolean) => void
  setAboutDialogOpen: (value: boolean) => void
  setImportDataDialogOpen: (value: boolean) => void
  setChartSettingsDialogOpen: (value: boolean, tab?: ChartSettingsTab) => void
  setSidebarNav: (nav: SidebarNav) => void
  setTestingTab: (tab: TestingTab) => void
  setDashboardTab: (tab: DashboardTab) => void
  requestJumpMenu: () => void
  startTour: () => void
  completeTour: () => void
  skipTour: () => void
  beginPaperTradePreview: () => void
  endPaperTradePreview: () => void
  setTradeBookOpen: (value: boolean) => void
  setShownClosedTradeIds: (ids: string[]) => void
  setChartPositionsHidden: (value: boolean) => void
  setHiddenPositionIds: (ids: string[]) => void
  toggleHiddenPosition: (id: string) => void
  setPrimaryChart: (chart: IChartApi | null) => void
  setPreviewSessionReport: (report: SessionReport | null) => void
}

function loadPersisted(): PersistedLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as PersistedLayout
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function persist(partial: PersistedLayout): void {
  try {
    const current = loadPersisted()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...partial }))
  } catch {
    // ignore quota / private mode
  }
}

function readRightDock(value: unknown): RightDock {
  if (value === 'order' || value === 'objects' || value === 'journal' || value === null) return value
  return 'order'
}

function isValidPos(value: unknown): value is PanelPos {
  if (!value || typeof value !== 'object') return false
  const pos = value as PanelPos
  return (
    typeof pos.x === 'number' &&
    typeof pos.y === 'number' &&
    Number.isFinite(pos.x) &&
    Number.isFinite(pos.y)
  )
}

const initial = loadPersisted()

export const useUiLayoutStore = create<UiLayoutState>((set, get) => ({
  // Always launch in normal chrome; fullscreen is session-only.
  chartFullscreen: false,
  replayControlsPos: isValidPos(initial.replayControlsPos) ? initial.replayControlsPos : null,
  tradePanelPos: isValidPos(initial.tradePanelPos) ? initial.tradePanelPos : null,
  drawingWidgetPos: isValidPos(initial.drawingWidgetPos) ? initial.drawingWidgetPos : null,
  showMainToolbar: initial.showMainToolbar !== false,
  showStatusBar: initial.showStatusBar !== false,
  showDrawingToolbar: initial.showDrawingToolbar !== false,
  showReplayControls: initial.showReplayControls !== false,
  showPaperTrade: initial.showPaperTrade !== false,
  tradeMarksVisible: initial.tradeMarksVisible !== false,
  rightDock: readRightDock(initial.rightDock),
  tourRightDockRestore: null,
  shortcutsDialogOpen: false,
  aboutDialogOpen: false,
  importDataDialogOpen: false,
  chartSettingsDialogOpen: false,
  chartSettingsTab: 'symbol',
  symbolManagerDialogOpen: false,
  sessionManagerDialogOpen: false,
  sidebarNav: 'testing',
  testingTab: 'dashboard',
  dashboardTab: 'dashboard',
  hasCompletedTour: initial.hasCompletedTour === true,
  tourRequestId: 0,
  jumpMenuRequestId: 0,
  tourPaperTradePreview: false,
  tourPaperTradeRestore: null,
  tradeBookOpen: false,
  shownClosedTradeIds: [],
  chartPositionsHidden: false,
  hiddenPositionIds: [],
  primaryChart: null,
  previewSessionReport: null,

  toggleChartFullscreen: () => {
    set({ chartFullscreen: !get().chartFullscreen })
  },

  setChartFullscreen: (value) => {
    if (value === get().chartFullscreen) return
    set({ chartFullscreen: value })
  },

  setReplayControlsPos: (pos) => {
    const current = get().replayControlsPos
    if (current && current.x === pos.x && current.y === pos.y) return
    set({ replayControlsPos: pos })
    persist({ replayControlsPos: pos })
  },

  setTradePanelPos: (pos) => {
    const current = get().tradePanelPos
    if (current && current.x === pos.x && current.y === pos.y) return
    set({ tradePanelPos: pos })
    persist({ tradePanelPos: pos })
  },

  setDrawingWidgetPos: (pos) => {
    const current = get().drawingWidgetPos
    if (current && current.x === pos.x && current.y === pos.y) return
    set({ drawingWidgetPos: pos })
    persist({ drawingWidgetPos: pos })
  },

  toggleMainToolbar: () => {
    const value = !get().showMainToolbar
    set({ showMainToolbar: value })
    persist({ showMainToolbar: value })
  },

  toggleStatusBar: () => {
    const value = !get().showStatusBar
    set({ showStatusBar: value })
    persist({ showStatusBar: value })
  },

  toggleDrawingToolbar: () => {
    const value = !get().showDrawingToolbar
    set({ showDrawingToolbar: value })
    persist({ showDrawingToolbar: value })
  },

  toggleReplayControls: () => {
    const value = !get().showReplayControls
    set({ showReplayControls: value })
    persist({ showReplayControls: value })
  },

  togglePaperTrade: () => {
    const value = !get().showPaperTrade
    set({ showPaperTrade: value })
    persist({ showPaperTrade: value })
  },

  setTradeMarksVisible: (value) => {
    set({ tradeMarksVisible: value })
    persist({ tradeMarksVisible: value })
  },

  setRightDock: (value) => {
    if (value === get().rightDock) return
    set({ rightDock: value })
    persist({ rightDock: value })
  },

  setShortcutsDialogOpen: (value) => {
    set({ shortcutsDialogOpen: value })
  },

  setAboutDialogOpen: (value) => {
    set({ aboutDialogOpen: value })
  },

  setImportDataDialogOpen: (value) => {
    set({ importDataDialogOpen: value })
  },

  setChartSettingsDialogOpen: (value, tab) => {
    if (!value) {
      set({ chartSettingsDialogOpen: false })
      return
    }
    set({ chartSettingsDialogOpen: true, chartSettingsTab: tab ?? 'symbol' })
  },

  setSidebarNav: (nav) => {
    if (nav === get().sidebarNav) return
    // Bridge: keep dashboardTab roughly aligned for anything still reading it.
    const bridge: DashboardTab =
      nav === 'testing' ? get().testingTab : nav
    set({ sidebarNav: nav, dashboardTab: bridge })
  },

  setTestingTab: (tab) => {
    set({ testingTab: tab, sidebarNav: 'testing', dashboardTab: tab })
  },

  setDashboardTab: (tab) => {
    if (tab === 'datasets' || tab === 'symbols' || tab === 'strategies' || tab === 'settings') {
      set({ sidebarNav: tab, dashboardTab: tab })
      return
    }
    set({ sidebarNav: 'testing', testingTab: tab, dashboardTab: tab })
  },

  requestJumpMenu: () => {
    set({ jumpMenuRequestId: get().jumpMenuRequestId + 1 })
  },

  startTour: () => {
    const showMainToolbar = get().showMainToolbar
    const showDrawingToolbar = get().showDrawingToolbar
    const persistPatch: PersistedLayout = {}
    if (!showMainToolbar) persistPatch.showMainToolbar = true
    if (!showDrawingToolbar) persistPatch.showDrawingToolbar = true
    if (Object.keys(persistPatch).length > 0) persist(persistPatch)
    set({
      showMainToolbar: true,
      showDrawingToolbar: true,
      chartFullscreen: false,
      shortcutsDialogOpen: false,
      aboutDialogOpen: false,
      importDataDialogOpen: false,
      chartSettingsDialogOpen: false,
      sidebarNav: 'testing',
      testingTab: 'dashboard',
      dashboardTab: 'dashboard',
      tourRequestId: get().tourRequestId + 1
    })
  },

  completeTour: () => {
    get().endPaperTradePreview()
    if (get().hasCompletedTour) return
    set({ hasCompletedTour: true })
    persist({ hasCompletedTour: true })
  },

  skipTour: () => {
    get().completeTour()
  },

  beginPaperTradePreview: () => {
    if (get().tourPaperTradePreview) return
    set({
      tourPaperTradePreview: true,
      tourPaperTradeRestore: get().showPaperTrade,
      tourRightDockRestore: get().rightDock,
      showPaperTrade: true,
      rightDock: get().rightDock ?? 'order'
    })
  },

  setTradeBookOpen: (value) => {
    set({ tradeBookOpen: value })
  },

  setShownClosedTradeIds: (ids) => {
    const current = get().shownClosedTradeIds
    if (current.length === ids.length && current.every((id, index) => id === ids[index])) return
    set({ shownClosedTradeIds: ids })
  },

  setChartPositionsHidden: (value) => {
    set({ chartPositionsHidden: value, ...(value ? {} : { hiddenPositionIds: [] }) })
  },

  setHiddenPositionIds: (ids) => {
    set({ hiddenPositionIds: ids, chartPositionsHidden: false })
  },

  toggleHiddenPosition: (id) => {
    const ids = get().hiddenPositionIds
    set({
      chartPositionsHidden: false,
      hiddenPositionIds: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
    })
  },

  endPaperTradePreview: () => {
    if (!get().tourPaperTradePreview && get().tourPaperTradeRestore == null) return
    const restore = get().tourPaperTradeRestore
    set({
      tourPaperTradePreview: false,
      tourPaperTradeRestore: null,
      showPaperTrade: restore ?? get().showPaperTrade,
      rightDock: get().tourRightDockRestore,
      tourRightDockRestore: null
    })
  },

  setPrimaryChart: (chart) => {
    set({ primaryChart: chart })
  },

  setPreviewSessionReport: (report) => {
    set({ previewSessionReport: report })
  }
}))

/** Clamp a panel top-left position so the panel stays inside the container. */
export function clampPanelPos(
  pos: PanelPos,
  containerWidth: number,
  containerHeight: number,
  panelWidth: number,
  panelHeight: number,
  margin = 8
): PanelPos {
  const maxX = Math.max(margin, containerWidth - panelWidth - margin)
  const maxY = Math.max(margin, containerHeight - panelHeight - margin)
  return {
    x: Math.min(Math.max(margin, pos.x), maxX),
    y: Math.min(Math.max(margin, pos.y), maxY)
  }
}
