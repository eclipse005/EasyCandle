/**
 * Local usage + graded clears for Settings → Storage.
 * Total size prefers navigator.storage.estimate() (origin usage).
 * IndexedDB holds market datasets; sessions / strategies / prefs live in localStorage.
 */

import { idbClearAllImportStores, idbGetAll } from '@/lib/importIdb'
import { clearImportMemoryCaches } from '@/lib/webApiBridge'
import { clearAllSessionNotes } from '@/lib/sessionNotes'
import { ACCOUNT_TIMEZONE_STORAGE_KEY } from '@/store/accountPrefsStore'
import { useSessionStore } from '@/store/sessionStore'
import { useStrategiesStore } from '@/store/strategiesStore'
import { useReplayStore } from '@/store/replayStore'
import { LOCALE_STORAGE_KEY } from '@/i18n/messages'
import { THEME_STORAGE_KEY } from '@/lib/theme'
import type { ImportedDatasetMeta } from '@shared/importTypes'

/** Approx structured-clone size per OHLC bar in IDB (breakdown only). */
const BYTES_PER_CANDLE_EST = 56

/** Keys preserved by default on “clear all” (language / theme / account TZ). */
export const PRESERVED_SETTINGS_KEYS = [
  LOCALE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  ACCOUNT_TIMEZONE_STORAGE_KEY
] as const

const BACKTEST_LOCAL_KEYS = [
  'bar-replay:sessions',
  'bar-replay:strategies',
  'bar-replay:session-notes'
] as const

const OTHER_APP_LOCAL_KEYS = [
  'bar-replay:ui-layout',
  'bar-replay:drawing-settings',
  'bar-replay:chart-settings',
  'bar-replay:symbol-visibility',
  'bar-replay:symbol-params',
  'bar-replay:pause-on-tp-sl',
  'bar-replay:timeframe-favorites',
  'bar-replay:charttype-favorites'
] as const

export type LocalUsageBreakdown = {
  /** Prefer navigator.storage.estimate().usage when available. */
  totalBytes: number
  /** Category breakdowns remain approximate (~). */
  marketBytes: number
  backtestBytes: number
  otherBytes: number
  /** True when total came from estimate(); false when falling back to sum of approx categories. */
  fromStorageEstimate: boolean
}

function utf16Bytes(value: string): number {
  return value.length * 2
}

function localStorageBytesForKeys(keys: readonly string[]): number {
  let sum = 0
  try {
    for (const key of keys) {
      const raw = localStorage.getItem(key)
      if (raw != null) sum += utf16Bytes(key) + utf16Bytes(raw)
    }
  } catch {
    // private mode
  }
  return sum
}

function estimateMarketBytesFromMetas(metas: ImportedDatasetMeta[]): number {
  let candles = 0
  for (const meta of metas) {
    const tfStats = meta.timeframes ? Object.values(meta.timeframes) : []
    if (tfStats.length > 0) {
      for (const tf of tfStats) {
        candles += Math.max(0, Number(tf.candleCount) || 0)
      }
    } else {
      candles += Math.max(0, Number(meta.candleCount) || 0)
    }
  }
  const metaOverhead = metas.length * 2048
  return candles * BYTES_PER_CANDLE_EST + metaOverhead
}

/** Format usage bytes for Settings total (e.g. 11.2 MB). */
export function formatStorageBytes(bytes: number): { value: string; unit: 'KB' | 'MB' | 'GB' } {
  const safe = Math.max(0, Number.isFinite(bytes) ? bytes : 0)
  if (safe >= 1024 * 1024 * 1024) {
    const gb = safe / (1024 * 1024 * 1024)
    const rounded = gb >= 10 ? Math.round(gb) : Math.round(gb * 10) / 10
    return { value: String(rounded), unit: 'GB' }
  }
  if (safe >= 1024 * 1024) {
    const mb = safe / (1024 * 1024)
    const rounded = mb >= 10 ? Math.round(mb * 10) / 10 : Math.round(mb * 10) / 10
    return { value: String(rounded), unit: 'MB' }
  }
  if (safe === 0) return { value: '0', unit: 'KB' }
  const kb = Math.max(0.1, Math.round((safe / 1024) * 10) / 10)
  return { value: String(kb), unit: 'KB' }
}

/** @deprecated Prefer formatStorageBytes — kept for existing tests / call sites. */
export function formatApproxBytes(bytes: number): { value: string; unit: 'KB' | 'MB' } {
  const fmt = formatStorageBytes(bytes)
  if (fmt.unit === 'GB') {
    const mb = Math.round((Math.max(0, bytes) / (1024 * 1024)) * 10) / 10
    return { value: String(mb), unit: 'MB' }
  }
  return { value: fmt.value, unit: fmt.unit }
}

async function readOriginUsageBytes(): Promise<number | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
    const est = await navigator.storage.estimate()
    if (est && typeof est.usage === 'number' && Number.isFinite(est.usage)) {
      return Math.max(0, est.usage)
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * Total = navigator.storage.estimate().usage when available (accurate origin usage).
 * Category fields stay approximate for internal/breakdown use.
 */
export async function estimateLocalUsage(): Promise<LocalUsageBreakdown> {
  let metas: ImportedDatasetMeta[] = []
  try {
    metas = await idbGetAll<ImportedDatasetMeta>('metas')
  } catch {
    metas = []
  }
  const marketBytes = estimateMarketBytesFromMetas(metas)
  const backtestBytes = localStorageBytesForKeys(BACKTEST_LOCAL_KEYS)
  const otherBytes = localStorageBytesForKeys([
    ...OTHER_APP_LOCAL_KEYS,
    ...PRESERVED_SETTINGS_KEYS
  ])
  const approxSum = marketBytes + backtestBytes + otherBytes
  const originUsage = await readOriginUsageBytes()
  return {
    totalBytes: originUsage != null ? originUsage : approxSum,
    marketBytes,
    backtestBytes,
    otherBytes,
    fromStorageEstimate: originUsage != null
  }
}

async function leaveActiveReplay(): Promise<void> {
  const session = useSessionStore.getState()
  if (session.activeSessionId) {
    await session.closeActiveSession()
    return
  }
  const replay = useReplayStore.getState()
  if (replay.mode === 'replay') {
    replay.resetReplayState()
  }
}

/** Wipe IndexedDB market datasets; keep sessions/settings. Sessions may become orphaned. */
export async function clearMarketDataOnly(): Promise<void> {
  await leaveActiveReplay()
  await idbClearAllImportStores()
  clearImportMemoryCaches()
  useReplayStore.setState({
    importedList: [],
    importMeta: null,
    importedSourceCandles: []
  })
  await useReplayStore.getState().refreshImportedList()
}

/** Clear sessions, trades, strategies, session notes. Keep market data + settings. */
export async function clearBacktestRecordsOnly(): Promise<void> {
  await leaveActiveReplay()
  useSessionStore.setState({ sessions: [], activeSessionId: null })
  try {
    localStorage.removeItem('bar-replay:sessions')
  } catch {
    /* ignore */
  }
  useStrategiesStore.setState({ strategies: [] })
  try {
    localStorage.removeItem('bar-replay:strategies')
  } catch {
    /* ignore */
  }
  clearAllSessionNotes()
  useReplayStore.setState({
    positions: [],
    pendingOrders: [],
    closedTrades: [],
    orderHistory: [],
    tradeMarkers: [],
    sessionReport: null
  })
}

/**
 * Wipe all local app data including Language / Appearance / Account TZ.
 */
export async function clearAllLocalAppData(): Promise<void> {
  await clearMarketDataOnly()
  await clearBacktestRecordsOnly()

  for (const key of OTHER_APP_LOCAL_KEYS) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }

  for (const key of PRESERVED_SETTINGS_KEYS) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }
}
