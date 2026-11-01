import type { DrawingKind, DrawingStyle as LcdStyle } from 'lightweight-charts-drawing'
import { LineStyle } from 'lightweight-charts'
import type { DrawingStyle as LegacyStyle, DrawingToolType } from '@/lib/chart/drawingGeometry'
import { DEFAULT_TOOL_DEFAULTS, defaultStyleForTool, useDrawingSettingsStore } from '@/store/drawingSettingsStore'
import { TIMEFRAME_IDS } from '@shared/timeframes'

/** Map LCD DrawingKind → legacy tool type used by presets / toolDefaults. */
export function legacyToolForKind(kind: string): DrawingToolType | null {
  switch (kind) {
    case 'horizontal-line':
    case 'horizontal-ray':
      return 'hline'
    case 'trend-line':
    case 'arrow':
    case 'ray':
    case 'extended-line':
      return 'trendline'
    case 'fib-retracement':
    case 'trend-based-fib-extension':
      return 'fib'
    case 'fib-channel':
      return 'fibchannel'
    case 'rectangle':
      return 'rect'
    case 'long-position':
      return 'long'
    case 'short-position':
      return 'short'
    default:
      return null
  }
}

function lwcStyleToLcd(lineStyle: number | undefined): LcdStyle['lineStyle'] {
  switch (lineStyle) {
    case LineStyle.Dotted:
      return 'dotted'
    case LineStyle.Dashed:
    case LineStyle.LargeDashed:
    case LineStyle.SparseDotted:
      return 'dashed'
    default:
      return 'solid'
  }
}

function lcdStyleToLwc(lineStyle: LcdStyle['lineStyle'] | undefined): LineStyle {
  if (lineStyle === 'dotted') return LineStyle.Dotted
  if (lineStyle === 'dashed') return LineStyle.Dashed
  return LineStyle.Solid
}

/** Convert a legacy tool-default / preset style into an LCD style patch. */
export function legacyStyleToLcd(style: LegacyStyle): Partial<LcdStyle> {
  return {
    color: style.color,
    width: style.lineWidth,
    lineStyle: lwcStyleToLcd(style.lineStyle),
    textColor: style.color
  }
}

/** Snapshot the LCD style back into a legacy preset payload. */
export function lcdStyleToLegacy(style: LcdStyle, fallback: LegacyStyle): LegacyStyle {
  return {
    color: style.color ?? fallback.color,
    lineWidth: style.width ?? fallback.lineWidth,
    lineStyle: lcdStyleToLwc(style.lineStyle),
    fillColor: fallback.fillColor,
    tpColor: fallback.tpColor,
    slColor: fallback.slColor
  }
}

/** Defaults the user set for this LCD kind (falls back to factory). */
export function lcdDefaultsForKind(kind: DrawingKind | string): Partial<LcdStyle> | null {
  const tool = legacyToolForKind(kind)
  if (!tool) return null
  return legacyStyleToLcd(defaultStyleForTool(tool))
}

/** TV-style interval string for LCD visibility (`"1"`, `"60"`, `"1D"`, `"1W"`, `"1M"`). */
export function toLcdInterval(timeframeId: string): string {
  switch (timeframeId) {
    case '1m':
      return '1'
    case '3m':
      return '3'
    case '5m':
      return '5'
    case '15m':
      return '15'
    case '30m':
      return '30'
    case '1h':
      return '60'
    case '4h':
      return '240'
    case '6h':
      return '360'
    case '1d':
      return '1D'
    case '1w':
      return '1W'
    case '1M':
      return '1M'
    default:
      return timeframeId
  }
}

export type IntervalVisibility = {
  ticks: boolean
  seconds: { on: boolean; from: number; to: number }
  minutes: { on: boolean; from: number; to: number }
  hours: { on: boolean; from: number; to: number }
  days: { on: boolean; from: number; to: number }
  weeks: { on: boolean; from: number; to: number }
  months: { on: boolean; from: number; to: number }
  ranges: boolean
}

const UNIT_OFF = { on: false, from: 1, to: 1 }

const MINUTE_STEPS = [
  ['1m', 1],
  ['3m', 3],
  ['5m', 5],
  ['15m', 15],
  ['30m', 30]
] as const

const HOUR_STEPS = [
  ['1h', 1],
  ['4h', 4],
  ['6h', 6]
] as const

function span(values: number[]): { on: boolean; from: number; to: number } {
  if (values.length === 0) return { ...UNIT_OFF }
  return { on: true, from: Math.min(...values), to: Math.max(...values) }
}

/** Build an IntervalVisibility that shows the selected app timeframe ids.
 *  Each unit is a from–to range, so checking both ends includes the steps between. */
export function visibilityFromTimeframes(enabled: readonly string[]): IntervalVisibility {
  const set = new Set(enabled)
  const minuteValues = MINUTE_STEPS.filter(([id]) => set.has(id)).map(([, n]) => n)
  const hourValues = HOUR_STEPS.filter(([id]) => set.has(id)).map(([, n]) => n)

  return {
    ticks: false,
    seconds: { ...UNIT_OFF },
    minutes: span(minuteValues),
    hours: span(hourValues),
    days: set.has('1d') ? { on: true, from: 1, to: 1 } : { ...UNIT_OFF },
    weeks: set.has('1w') ? { on: true, from: 1, to: 1 } : { ...UNIT_OFF },
    months: set.has('1M') ? { on: true, from: 1, to: 1 } : { ...UNIT_OFF },
    ranges: false
  }
}

/** Inverse of visibilityFromTimeframes. Absent visibility means every app timeframe. */
export function timeframesFromVisibility(v: IntervalVisibility | undefined): string[] {
  if (!v) return [...TIMEFRAME_IDS]
  const out: string[] = []
  if (v.minutes?.on) {
    for (const [id, n] of MINUTE_STEPS) {
      if (n >= v.minutes.from && n <= v.minutes.to) out.push(id)
    }
  }
  if (v.hours?.on) {
    for (const [id, n] of HOUR_STEPS) {
      if (n >= v.hours.from && n <= v.hours.to) out.push(id)
    }
  }
  if (v.days?.on) out.push('1d')
  if (v.weeks?.on) out.push('1w')
  if (v.months?.on) out.push('1M')
  return out
}

export function savePresetFromLcd(
  kind: string,
  name: string,
  style: LcdStyle
): boolean {
  const tool = legacyToolForKind(kind)
  if (!tool) return false
  const fallback = defaultStyleForTool(tool)
  return useDrawingSettingsStore
    .getState()
    .savePreset(tool, name, lcdStyleToLegacy(style, fallback))
}

export function resetLcdStyleToFactory(kind: string): Partial<LcdStyle> | null {
  const tool = legacyToolForKind(kind)
  if (!tool) return null
  return legacyStyleToLcd(DEFAULT_TOOL_DEFAULTS[tool])
}
