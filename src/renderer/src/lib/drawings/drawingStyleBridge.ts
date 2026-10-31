import type { DrawingKind, DrawingStyle as LcdStyle } from 'lightweight-charts-drawing'
import { LineStyle } from 'lightweight-charts'
import type { DrawingStyle as LegacyStyle, DrawingToolType } from '@/lib/chart/drawingGeometry'
import { DEFAULT_TOOL_DEFAULTS, defaultStyleForTool, useDrawingSettingsStore } from '@/store/drawingSettingsStore'

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

/** TV-style interval string for LCD visibility (`"1"`, `"60"`, `"1D"`). */
export function toLcdInterval(timeframeId: string): string {
  switch (timeframeId) {
    case '1m':
      return '1'
    case '5m':
      return '5'
    case '15m':
      return '15'
    case '1h':
      return '60'
    case '4h':
      return '240'
    case '1d':
      return '1D'
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

/** Build an IntervalVisibility that shows only the selected app timeframe ids. */
export function visibilityFromTimeframes(enabled: readonly string[]): IntervalVisibility {
  const set = new Set(enabled)
  const minutesOn = ['1m', '5m', '15m'].some((id) => set.has(id))
  const hoursOn = ['1h', '4h'].some((id) => set.has(id))
  const daysOn = set.has('1d')

  const minuteValues = (['1m', '5m', '15m'] as const)
    .filter((id) => set.has(id))
    .map((id) => (id === '1m' ? 1 : id === '5m' ? 5 : 15))
  const hourValues = (['1h', '4h'] as const)
    .filter((id) => set.has(id))
    .map((id) => (id === '1h' ? 1 : 4))

  return {
    ticks: false,
    seconds: { ...UNIT_OFF },
    minutes: minutesOn
      ? {
          on: true,
          from: Math.min(...minuteValues),
          to: Math.max(...minuteValues)
        }
      : { ...UNIT_OFF },
    hours: hoursOn
      ? {
          on: true,
          from: Math.min(...hourValues),
          to: Math.max(...hourValues)
        }
      : { ...UNIT_OFF },
    days: daysOn ? { on: true, from: 1, to: 1 } : { ...UNIT_OFF },
    weeks: { ...UNIT_OFF },
    months: { ...UNIT_OFF },
    ranges: false
  }
}

/** Inverse of visibilityFromTimeframes for our six app timeframes (best-effort). */
export function timeframesFromVisibility(v: IntervalVisibility | undefined): string[] {
  if (!v) return ['1m', '5m', '15m', '1h', '4h', '1d']
  const out: string[] = []
  if (v.minutes?.on) {
    const from = v.minutes.from
    const to = v.minutes.to
    for (const [id, n] of [
      ['1m', 1],
      ['5m', 5],
      ['15m', 15]
    ] as const) {
      if (n >= from && n <= to) out.push(id)
    }
  }
  if (v.hours?.on) {
    const from = v.hours.from
    const to = v.hours.to
    for (const [id, n] of [
      ['1h', 1],
      ['4h', 4]
    ] as const) {
      if (n >= from && n <= to) out.push(id)
    }
  }
  if (v.days?.on) out.push('1d')
  return out.length > 0 ? out : ['1m', '5m', '15m', '1h', '4h', '1d']
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
