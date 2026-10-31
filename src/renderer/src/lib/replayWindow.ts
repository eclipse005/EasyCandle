/** Candles before the replay start (context left of the playhead). */
export const REPLAY_LOOKBACK_BARS = 200

/** Candles after the replay start loaded up front. */
export const REPLAY_FORWARD_BARS = 500

/**
 * Build the UTC millisecond window that a replay start should request.
 * Kept provider-agnostic: this build has no live feed, but the replay engine
 * still needs a window when jumping inside an imported dataset.
 */
export function buildReplayWindowMs(opts: {
  startTimeSeconds: number
  intervalSeconds: number
  lookbackBars?: number
  forwardBars?: number
}): { startTimeMs: number; endTimeMs: number } {
  const intervalSeconds = Math.max(1, opts.intervalSeconds)
  const lookback = opts.lookbackBars ?? REPLAY_LOOKBACK_BARS
  const forward = opts.forwardBars ?? REPLAY_FORWARD_BARS
  const startSec = Math.floor(opts.startTimeSeconds)

  const startTimeMs = Math.max(0, (startSec - lookback * intervalSeconds) * 1000)
  const endTimeMs = Math.min(Date.now(), (startSec + forward * intervalSeconds) * 1000)

  return { startTimeMs, endTimeMs }
}
