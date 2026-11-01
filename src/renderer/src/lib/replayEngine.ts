import { dedupeCandlesByTime, findIndexAtOrBefore, type Candle } from '@shared/candleUtils'

export type ReplayStatus = 'idle' | 'ready' | 'playing' | 'paused' | 'ended'

export type ReplayState = {
  candles: Candle[]
  index: number
  isPlaying: boolean
  speed: number
  status: ReplayStatus
}

export const MIN_REPLAY_SPEED = 1
export const MAX_REPLAY_SPEED = 16

/** Every whole speed from 1x to 16x, ascending. */
export const REPLAY_SPEEDS: readonly number[] = Object.freeze(
  Array.from({ length: MAX_REPLAY_SPEED - MIN_REPLAY_SPEED + 1 }, (_, i) => MIN_REPLAY_SPEED + i)
)

/** Auto-advance interval at 1x: one bar per second. Higher speeds divide it. */
export const BASE_TICK_MS = 1000

/** Wall-clock ms between two auto-advanced candles at `speed`. */
export function replayTickMs(speed: number): number {
  return Math.max(30, BASE_TICK_MS / (speed || MIN_REPLAY_SPEED))
}

/** Whole candles the engine can advance per wall-clock second at `speed`. */
export function replayCandlesPerSecond(speed: number): number {
  return Math.round(1000 / replayTickMs(speed))
}

export type ReplaySeekOptions = {
  /** When false, move the playhead without stopping playback. Default true. */
  pause?: boolean
}

const DEFAULT_SPEED = 1
const DEFAULT_PREFETCH_THRESHOLD = 50

/** Clamp to the whole 1x..16x slider range. */
export function normalizeSpeed(value: number): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SPEED
  return Math.min(MAX_REPLAY_SPEED, Math.max(MIN_REPLAY_SPEED, Math.round(n)))
}

/** Step one speed up/down within the 1x..16x range. */
export function stepReplaySpeed(current: number, direction: 1 | -1): number {
  return normalizeSpeed(normalizeSpeed(current) + direction)
}

function normalizeCandles(candles: unknown): Candle[] {
  if (!Array.isArray(candles)) return []
  return dedupeCandlesByTime(
    candles.filter(
      (c): c is Candle =>
        Boolean(c) &&
        typeof c === 'object' &&
        Number.isFinite((c as Candle).time) &&
        Number.isFinite((c as Candle).open) &&
        Number.isFinite((c as Candle).high) &&
        Number.isFinite((c as Candle).low) &&
        Number.isFinite((c as Candle).close)
    )
  )
}

export function createReplayEngine(options: { prefetchThreshold?: number; speed?: number } = {}) {
  const prefetchThreshold =
    Number.isFinite(options.prefetchThreshold) && (options.prefetchThreshold as number) >= 0
      ? Math.floor(options.prefetchThreshold as number)
      : DEFAULT_PREFETCH_THRESHOLD

  let candles: Candle[] = []
  let index = 0
  let isPlaying = false
  let speed = normalizeSpeed(options.speed ?? DEFAULT_SPEED)
  let status: ReplayStatus = 'idle'

  function lastIndex(): number {
    return candles.length - 1
  }

  function hasCandles(): boolean {
    return candles.length > 0
  }

  function getState(): ReplayState {
    // Return the live buffer by reference — callers must treat it as read-only.
    // Copying tens of thousands of M1 bars on every seek/tick was a scrub bottleneck.
    return {
      candles,
      index,
      isPlaying,
      speed,
      status
    }
  }

  function load(nextCandles: Candle[]): ReplayState {
    candles = normalizeCandles(nextCandles)
    index = 0
    isPlaying = false
    status = hasCandles() ? 'ready' : 'idle'
    return getState()
  }

  function play(): ReplayState {
    if (!hasCandles() || status === 'ended') return getState()
    isPlaying = true
    status = 'playing'
    return getState()
  }

  function pause(): ReplayState {
    if (!hasCandles()) return getState()
    if (status === 'ended') {
      isPlaying = false
      return getState()
    }
    isPlaying = false
    status = 'paused'
    return getState()
  }

  function stepForward(): ReplayState {
    if (!hasCandles()) return getState()

    if (index >= lastIndex()) {
      isPlaying = false
      status = 'ended'
      return getState()
    }

    index += 1
    status = isPlaying ? 'playing' : 'paused'
    return getState()
  }

  function stepBackward(): ReplayState {
    if (!hasCandles()) return getState()

    if (index > 0) {
      index -= 1
    }

    isPlaying = false
    status = 'paused'
    return getState()
  }

  function setSpeed(nextSpeed: number): ReplayState {
    speed = normalizeSpeed(nextSpeed)
    return getState()
  }

  function seekToIndex(nextIndex: number, opts?: ReplaySeekOptions): ReplayState {
    if (!hasCandles()) return getState()

    const n = Number(nextIndex)
    if (!Number.isFinite(n)) return getState()

    index = Math.min(lastIndex(), Math.max(0, Math.floor(n)))
    if (opts?.pause === false) {
      if (isPlaying) status = 'playing'
      return getState()
    }

    isPlaying = false
    status = 'paused'
    return getState()
  }

  function seekToTime(timeSeconds: number, opts?: ReplaySeekOptions): ReplayState {
    if (!hasCandles()) return getState()

    const found = findIndexAtOrBefore(candles, timeSeconds)
    return seekToIndex(found < 0 ? 0 : found, opts)
  }

  function getVisibleCandles(): Candle[] {
    if (!hasCandles()) return []
    return candles.slice(0, index + 1)
  }

  function getCurrentCandle(): Candle | null {
    if (!hasCandles()) return null
    return candles[index] ?? null
  }

  function needsPrefetch(): boolean {
    if (!hasCandles() || status === 'idle') return false
    const remaining = lastIndex() - index
    return remaining <= prefetchThreshold
  }

  function appendCandles(more: Candle[]): ReplayState {
    if (!Array.isArray(more) || more.length === 0) return getState()

    const incoming = normalizeCandles(more)
    if (incoming.length === 0) return getState()

    const previousLast = hasCandles() ? candles[lastIndex()].time : null
    const extensions =
      previousLast == null ? incoming : incoming.filter((c) => c.time > previousLast)

    if (extensions.length === 0) return getState()

    const wasEnded = status === 'ended'
    candles = dedupeCandlesByTime(candles.concat(extensions))

    if (!hasCandles()) {
      index = 0
      isPlaying = false
      status = 'idle'
      return getState()
    }

    if (index > lastIndex()) {
      index = lastIndex()
    }

    if (wasEnded && index < lastIndex()) {
      isPlaying = false
      status = 'paused'
    }

    return getState()
  }

  return {
    getState,
    load,
    play,
    pause,
    stepForward,
    stepBackward,
    setSpeed,
    seekToIndex,
    seekToTime,
    getVisibleCandles,
    getCurrentCandle,
    needsPrefetch,
    appendCandles
  }
}

export type ReplayEngine = ReturnType<typeof createReplayEngine>
