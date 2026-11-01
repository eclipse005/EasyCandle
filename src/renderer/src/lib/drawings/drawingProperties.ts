import {
  factoryStyleFor,
  type DataPoint,
  type DrawingKind,
  type DrawingStyle,
  type LevelDef
} from 'lightweight-charts-drawing'

/** Fib diagonal. Matches the library fallback (`gr`): on, gray, dashed. */
export const DEFAULT_FIB_TREND: NonNullable<DrawingStyle['fibTrendLine']> = {
  visible: true,
  color: '#808080',
  width: 2,
  style: 'dashed'
}

export type ExtendMode = 'none' | 'left' | 'right' | 'both'

export type StatsPreset = 'hidden' | 'price' | 'pricePct' | 'bars' | 'all' | 'custom'

export type DrawTab = 'style' | 'text' | 'coordinates' | 'visibility'

export type DrawSection =
  | 'line'
  | 'ends'
  | 'extend'
  | 'middle'
  | 'priceLabels'
  | 'stats'
  | 'fibTrend'
  | 'levelsLine'
  | 'levels'
  | 'oneColor'
  | 'background'
  | 'reverse'
  | 'extendLines'
  | 'fibLabels'
  | 'position'
  | 'textBody'
  | 'showTime'
  | 'extendVertical'
  | 'middleLine'

const STAT_FIELDS = [
  'showPriceRange',
  'showPercentPriceRange',
  'showPipsPriceRange',
  'showBarsRange',
  'showDateTimeRange',
  'showDistance',
  'showAngle'
] as const

type StatField = (typeof STAT_FIELDS)[number]

const NO_TEXT_TAB = new Set([
  'fib-retracement',
  'trend-based-fib-extension',
  'fib-channel',
  'pitchfork',
  'long-position',
  'short-position',
  'brush',
  'highlighter',
  'polyline',
  'anchored-vwap',
  'regression-trend'
])

const KIND_LABELS: Record<string, { zh: string; en: string }> = {
  'trend-line': { zh: '趋势线', en: 'Trend line' },
  'horizontal-line': { zh: '水平线', en: 'Horizontal line' },
  'horizontal-ray': { zh: '水平射线', en: 'Horizontal ray' },
  'vertical-line': { zh: '垂直线', en: 'Vertical line' },
  'cross-line': { zh: '十字线', en: 'Cross line' },
  'parallel-channel': { zh: '平行通道', en: 'Parallel channel' },
  'disjoint-channel': { zh: '不相交通道', en: 'Disjoint channel' },
  'fib-retracement': { zh: '斐波那契回撤', en: 'Fib retracement' },
  'trend-based-fib-extension': { zh: '斐波那契扩展', en: 'Trend-based fib extension' },
  'fib-channel': { zh: '斐波那契通道', en: 'Fib channel' },
  pitchfork: { zh: '音叉', en: 'Pitchfork' },
  rectangle: { zh: '矩形', en: 'Rectangle' },
  circle: { zh: '圆', en: 'Circle' },
  ellipse: { zh: '椭圆', en: 'Ellipse' },
  triangle: { zh: '三角形', en: 'Triangle' },
  'long-position': { zh: '多头', en: 'Long position' },
  'short-position': { zh: '空头', en: 'Short position' },
  'position-forecast': { zh: '仓位预测', en: 'Position forecast' },
  'price-range': { zh: '价格范围', en: 'Price range' },
  'date-and-price-range': { zh: '日期和价格范围', en: 'Date and price range' },
  text: { zh: '文字', en: 'Text' },
  note: { zh: '注释', en: 'Note' },
  'price-note': { zh: '价格注释', en: 'Price note' },
  callout: { zh: '标注', en: 'Callout' },
  brush: { zh: '笔刷', en: 'Brush' },
  highlighter: { zh: '荧光笔', en: 'Highlighter' },
  polyline: { zh: '折线', en: 'Polyline' },
  arrow: { zh: '箭头', en: 'Arrow' },
  'regression-trend': { zh: '回归趋势', en: 'Regression trend' },
  'anchored-vwap': { zh: '锚定 VWAP', en: 'Anchored VWAP' }
}

export function kindLabel(kind: string, locale: 'zh' | 'en'): string {
  const row = KIND_LABELS[kind]
  if (row) return locale === 'zh' ? row.zh : row.en
  return kind.replace(/-/g, ' ')
}

export function tabsFor(kind: string): DrawTab[] {
  if (NO_TEXT_TAB.has(kind)) return ['style', 'coordinates', 'visibility']
  return ['style', 'text', 'coordinates', 'visibility']
}

export function sectionsFor(kind: string): DrawSection[] {
  switch (kind) {
    case 'trend-line':
    case 'ray':
    case 'arrow':
    case 'extended-line':
      return ['line', 'ends', 'extend', 'middle', 'priceLabels', 'stats']
    case 'horizontal-line':
    case 'horizontal-ray':
      return ['line', 'priceLabels']
    case 'vertical-line':
      return ['line', 'extendVertical', 'showTime', 'priceLabels']
    case 'cross-line':
      return ['line', 'showTime', 'priceLabels']
    case 'parallel-channel':
      return ['line', 'extend', 'levels', 'oneColor', 'background']
    case 'disjoint-channel':
      return ['line', 'extend', 'background']
    case 'fib-retracement':
    case 'trend-based-fib-extension':
      return [
        'fibTrend',
        'levelsLine',
        'extend',
        'levels',
        'oneColor',
        'background',
        'reverse',
        'fibLabels'
      ]
    case 'fib-channel':
      return ['levelsLine', 'extend', 'levels', 'oneColor', 'background', 'fibLabels']
    case 'pitchfork':
      return ['line', 'levels', 'oneColor', 'extendLines', 'background']
    case 'rectangle':
      return ['line', 'extend', 'middleLine', 'background']
    case 'circle':
    case 'ellipse':
    case 'triangle':
    case 'price-range':
    case 'date-and-price-range':
    case 'position-forecast':
      return ['line', 'background']
    case 'long-position':
    case 'short-position':
      return ['line', 'position', 'priceLabels']
    case 'text':
    case 'note':
    case 'callout':
    case 'price-note':
      return ['textBody']
    case 'brush':
    case 'highlighter':
    case 'polyline':
      return ['line']
    case 'regression-trend':
    case 'anchored-vwap':
      return ['line', 'background', 'levels', 'oneColor']
    default:
      return ['line']
  }
}

export function cloneStyle(style: DrawingStyle): DrawingStyle {
  return structuredClone(style)
}

export function cssHex(value: string | undefined, fallback = '#2962ff'): string {
  if (!value) return fallback
  const full = /^#([0-9a-fA-F]{6})/.exec(value)
  if (full) return `#${full[1]}`
  const short = /^#([0-9a-fA-F]{3})$/.exec(value)
  if (short) {
    return `#${short[1]
      .split('')
      .map((ch) => ch + ch)
      .join('')}`
  }
  return fallback
}

export function extendModeOf(style: DrawingStyle, kind: string): ExtendMode {
  const left = style.extendLeft ?? kind === 'extended-line'
  const right = style.extendRight ?? (kind === 'ray' || kind === 'extended-line')
  if (left && right) return 'both'
  if (left) return 'left'
  if (right) return 'right'
  return 'none'
}

export function extendPatch(mode: ExtendMode): Pick<DrawingStyle, 'extendLeft' | 'extendRight'> {
  return {
    extendLeft: mode === 'left' || mode === 'both',
    extendRight: mode === 'right' || mode === 'both'
  }
}

export function statsPresetOf(style: DrawingStyle): StatsPreset {
  const on = STAT_FIELDS.filter((key) => Boolean(style[key]))
  if (on.length === 0) return 'hidden'
  if (on.length === STAT_FIELDS.length) return 'all'
  if (on.length === 1 && style.showPriceRange) return 'price'
  if (on.length === 2 && style.showPriceRange && style.showPercentPriceRange) return 'pricePct'
  if (on.length === 1 && style.showBarsRange) return 'bars'
  return 'custom'
}

export function statsPatch(preset: Exclude<StatsPreset, 'custom'>): Pick<DrawingStyle, StatField> {
  const off = Object.fromEntries(STAT_FIELDS.map((key) => [key, false])) as Pick<
    DrawingStyle,
    StatField
  >
  if (preset === 'hidden') return off
  if (preset === 'price') return { ...off, showPriceRange: true }
  if (preset === 'pricePct') return { ...off, showPriceRange: true, showPercentPriceRange: true }
  if (preset === 'bars') return { ...off, showBarsRange: true }
  return Object.fromEntries(STAT_FIELDS.map((key) => [key, true])) as Pick<DrawingStyle, StatField>
}

export function opacityOf(transparency: number | undefined, fallback = 20): number {
  if (transparency == null || !Number.isFinite(transparency)) return fallback
  return Math.round(100 - Math.min(100, Math.max(0, transparency)))
}

export function transparencyOf(opacity: number): number {
  return Math.round(100 - Math.min(100, Math.max(0, opacity)))
}

export function levelsOf(style: DrawingStyle, kind: string): LevelDef[] {
  if (style.levels) return style.levels.map((level) => ({ ...level }))
  try {
    const factory = factoryStyleFor(kind as DrawingKind)
    return (factory.levels ?? []).map((level) => ({ ...level }))
  } catch {
    return []
  }
}

export function levelsUseOneColor(levels: readonly LevelDef[]): boolean {
  if (levels.length === 0) return false
  const first = levels[0]?.color?.toLowerCase()
  return levels.every((level) => level.color?.toLowerCase() === first)
}

export function paintLevels(levels: readonly LevelDef[], color: string): LevelDef[] {
  return levels.map((level) => ({ ...level, color }))
}

export function restoreLevelColors(
  levels: readonly LevelDef[],
  factory: readonly LevelDef[]
): LevelDef[] {
  return levels.map((level) => {
    const match = factory.find((item) => Math.abs(item.coeff - level.coeff) < 1e-6)
    return match ? { ...level, color: match.color } : { ...level }
  })
}

export function fibTrendOf(style: DrawingStyle): NonNullable<DrawingStyle['fibTrendLine']> {
  return { ...DEFAULT_FIB_TREND, ...style.fibTrendLine }
}

export function patchLevel(
  levels: readonly LevelDef[],
  index: number,
  patch: Partial<LevelDef>
): LevelDef[] | null {
  if (index < 0 || index >= levels.length) return null
  const next = levels.map((level) => ({ ...level }))
  const current = next[index]
  if (!current) return null
  if (patch.coeff != null && !Number.isFinite(patch.coeff)) return null
  next[index] = { ...current, ...patch }
  return next
}

export type DrawingSnapshot = {
  style: DrawingStyle
  points: DataPoint[]
  name?: string
  text?: string
  locked?: boolean
  hidden?: boolean
  visibility?: unknown
}

export function snapshotFrom(drawing: {
  style: DrawingStyle
  points: readonly DataPoint[]
  name?: string
  text?: string
  locked?: boolean
  hidden?: boolean
  visibility?: unknown
}): DrawingSnapshot {
  return {
    style: cloneStyle(drawing.style),
    points: drawing.points.map((point) => ({ ...point })),
    name: drawing.name,
    text: drawing.text,
    locked: drawing.locked,
    hidden: drawing.hidden,
    visibility: drawing.visibility
  }
}
