import { forexSessionDayOpen } from '@shared/forexSession'

export type PriceScaleSide = 'left' | 'right'

/**
 * Axis width in CSS pixels. lightweight-charts throws while the axis widget
 * is visible in options but not mounted yet (the frame a side swap is applied).
 */
export function priceScaleWidth(
  chart: {
    priceScale: (id: PriceScaleSide) => {
      options: () => { visible: boolean }
      width: () => number
    }
  },
  side: PriceScaleSide
): number {
  try {
    const scale = chart.priceScale(side)
    if (!scale.options().visible) return 0
    const width = scale.width()
    return Number.isFinite(width) && width > 0 ? width : 0
  } catch {
    return 0
  }
}

/** Which price scale a chart-local x hits, if any. */
export function priceScaleHit(
  localX: number,
  width: number,
  leftWidth: number,
  rightWidth: number
): PriceScaleSide | null {
  if (!Number.isFinite(localX) || !Number.isFinite(width) || width <= 0) return null
  if (leftWidth > 1 && localX <= leftWidth + 1) return 'left'
  if (rightWidth > 1 && localX >= width - rightWidth - 1) return 'right'
  return null
}

/** Visible price span divided by the number of bars on screen. */
export function pricePerBar(
  range: { from: number; to: number },
  bars: number
): number | null {
  if (!Number.isFinite(range.from) || !Number.isFinite(range.to) || !(bars > 0)) return null
  const span = Math.abs(range.to - range.from)
  if (!(span > 0)) return null
  return span / bars
}

/** Price window that keeps `ratio` price-units per bar, centered on `center`. */
export function lockedPriceRange(
  center: number,
  ratio: number,
  bars: number
): { from: number; to: number } | null {
  if (!Number.isFinite(center) || !(ratio > 0) || !(bars > 0)) return null
  const span = ratio * bars
  return { from: center - span / 2, to: center + span / 2 }
}

/** TradingView-style ratio label, e.g. 0.0006. */
export function formatPriceBarRatio(ratio: number): string {
  if (!Number.isFinite(ratio) || !(ratio > 0)) return ''
  const digits =
    ratio >= 1 ? 4 : Math.min(8, Math.ceil(-Math.log10(ratio)) + 1)
  return ratio.toFixed(digits).replace(/\.?0+$/, '')
}

/** Seconds left until the bar that opened at `barOpen` closes. */
export function barRemainingSeconds(
  barOpen: number,
  playhead: number,
  barSeconds: number
): number {
  const step = Math.max(1, Math.floor(barSeconds) || 1)
  const open = Math.floor(Number(barOpen))
  const now = Math.floor(Number(playhead))
  if (!Number.isFinite(open) || !Number.isFinite(now)) return step
  return Math.max(0, open + step - now)
}

export function formatBarCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(secs).padStart(2, '0')
  if (hours > 0) return `${hours}:${mm}:${ss}`
  return `${mm}:${ss}`
}

type ScaleCandle = { time: number; high: number; low: number; close: number }

/**
 * Previous forex-session close, plus the session high and low up to the playhead.
 * Future bars are ignored.
 */
export function sessionScaleLevels(
  candles: readonly ScaleCandle[],
  playheadTime: number
): { previousClose: number | null; high: number | null; low: number | null } {
  const open = forexSessionDayOpen(playheadTime)
  if (open == null) return { previousClose: null, high: null, low: null }
  let previousClose: number | null = null
  let high = -Infinity
  let low = Infinity
  let saw = false
  for (const candle of candles) {
    if (candle.time < open) {
      previousClose = candle.close
      continue
    }
    if (candle.time > playheadTime) break
    if (candle.high > high) high = candle.high
    if (candle.low < low) low = candle.low
    saw = true
  }
  return {
    previousClose,
    high: saw && Number.isFinite(high) ? high : null,
    low: saw && Number.isFinite(low) ? low : null
  }
}
