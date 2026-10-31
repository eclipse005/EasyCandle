export type TimeframeConfig = {
  id: string
  label: string
  seconds: number
}

/**
 * Full available list (TradingView-like). Month id is `1M` (distinct from `1m`).
 * Favorites stay empty until the user stars; DEFAULT_TIMEFRAME stays 15m.
 */
export const TIMEFRAMES: Record<string, TimeframeConfig> = {
  '1m': { id: '1m', label: '1m', seconds: 60 },
  '3m': { id: '3m', label: '3m', seconds: 180 },
  '5m': { id: '5m', label: '5m', seconds: 300 },
  '15m': { id: '15m', label: '15m', seconds: 900 },
  '30m': { id: '30m', label: '30m', seconds: 1800 },
  '1h': { id: '1h', label: '1h', seconds: 3600 },
  '4h': { id: '4h', label: '4h', seconds: 14400 },
  '6h': { id: '6h', label: '6h', seconds: 21600 },
  '1d': { id: '1d', label: '1d', seconds: 86400 },
  '1w': { id: '1w', label: '1w', seconds: 604800 },
  // Nominal 30d; real month buckets use NY calendar + NY close (see forexSession).
  '1M': { id: '1M', label: '1M', seconds: 2592000 }
}

export const TIMEFRAME_IDS: string[] = Object.keys(TIMEFRAMES)

export const DEFAULT_TIMEFRAME = '15m'

/**
 * Floor a UTC open time onto the candle open for `intervalSeconds`.
 * Used when remapping the replay playhead across timeframes.
 */
export function alignTimeToInterval(timeSeconds: number, intervalSeconds: number): number {
  const t = Math.floor(Number(timeSeconds))
  const step = Math.max(1, Math.floor(Number(intervalSeconds)) || 1)
  if (!Number.isFinite(t)) return 0
  return Math.floor(t / step) * step
}

/**
 * Last UTC second covered by the candle that opens at `openTimeSeconds`.
 * Used to sync a follower pane so that e.g. one 5m step reveals five 1m bars.
 */
export function playheadCoverEnd(openTimeSeconds: number, intervalSeconds: number): number {
  const open = Math.floor(Number(openTimeSeconds))
  const step = Math.max(1, Math.floor(Number(intervalSeconds)) || 1)
  if (!Number.isFinite(open)) return 0
  return open + step - 1
}

/**
 * UTC second the follower pane should seek to so its visible bars stay in
 * lockstep with the driver's current candle.
 *
 * Finer or equal follower: reveal every follower bar covered by the driver
 * candle (one 5m step shows five 1m bars).
 * Coarser follower: reveal the HTF bar as soon as any driver bar in that
 * period plays. Published OHLC for that bar is formed from driver bars so
 * far (live-style), not the completed bucket.
 */
export function followerPlayheadCover(
  driverOpenSeconds: number,
  driverIntervalSeconds: number,
  followerIntervalSeconds: number
): number {
  const driverCover = playheadCoverEnd(driverOpenSeconds, driverIntervalSeconds)
  const driverStep = Math.max(1, Math.floor(Number(driverIntervalSeconds)) || 1)
  const followerStep = Math.max(1, Math.floor(Number(followerIntervalSeconds)) || 1)

  if (followerStep <= driverStep) return driverCover

  const htfOpen = alignTimeToInterval(driverOpenSeconds, followerStep)
  return playheadCoverEnd(htfOpen, followerStep)
}

/**
 * UTC second to seek a coarser pane to after a waiting price is touched on a
 * finer bar. Reveals the HTF candle whose period contains the touch.
 */
export function coarserTouchedCover(
  touchOpenSeconds: number,
  coarserIntervalSeconds: number
): number {
  const htfOpen = alignTimeToInterval(touchOpenSeconds, coarserIntervalSeconds)
  return playheadCoverEnd(htfOpen, coarserIntervalSeconds)
}

/** Prefer a different TF so split view is useful out of the box. */
export function defaultSecondaryTimeframe(primaryTimeframe: string): string {
  if (primaryTimeframe === '1m') return '5m'
  if (TIMEFRAMES['1m']) return '1m'
  return DEFAULT_TIMEFRAME
}
