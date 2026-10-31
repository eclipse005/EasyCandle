import type { LucideIcon } from 'lucide-react'
import {
  ArrowDownFromLine,
  ArrowUpFromLine,
  Circle,
  Crosshair,
  GitBranch,
  Hash,
  LineChart,
  Minus,
  MousePointer2,
  Move3d,
  PenTool,
  Ruler,
  TrendingUp,
  Type,
  Waves,
  Waypoints
} from 'lucide-react'

/**
 * Tool registry for the drawing toolbar, backed by lightweight-charts-drawing's
 * `DrawingKind` ids. Groups mirror TradingView's left toolbar; every entry maps
 * 1:1 to a `DrawingManager.setTool(kind)` call.
 */
export type DrawingToolId =
  | 'trend-line'
  | 'horizontal-line'
  | 'horizontal-ray'
  | 'vertical-line'
  | 'cross-line'
  | 'parallel-channel'
  | 'disjoint-channel'
  | 'fib-retracement'
  | 'trend-based-fib-extension'
  | 'fib-channel'
  | 'pitchfork'
  | 'rectangle'
  | 'circle'
  | 'ellipse'
  | 'triangle'
  | 'long-position'
  | 'short-position'
  | 'position-forecast'
  | 'price-range'
  | 'date-and-price-range'
  | 'text'
  | 'note'
  | 'price-note'
  | 'callout'
  | 'brush'
  | 'highlighter'
  | 'polyline'
  | 'arrow'
  | 'regression-trend'
  | 'anchored-vwap'

export type DrawingToolGroup = {
  id: string
  label: string
  icon: typeof Minus
  tools: { kind: DrawingToolId; label: string }[]
}

export const DRAWING_TOOL_GROUPS: DrawingToolGroup[] = [
  {
    id: 'lines',
    label: 'Lines & channels',
    icon: Minus,
    tools: [
      { kind: 'trend-line', label: 'Trend line' },
      { kind: 'horizontal-line', label: 'Horizontal line' },
      { kind: 'horizontal-ray', label: 'Horizontal ray' },
      { kind: 'vertical-line', label: 'Vertical line' },
      { kind: 'cross-line', label: 'Cross line' },
      { kind: 'parallel-channel', label: 'Parallel channel' },
      { kind: 'disjoint-channel', label: 'Disjoint channel' }
    ]
  },
  {
    id: 'fib',
    label: 'Fibonacci & pitchforks',
    icon: Waves,
    tools: [
      { kind: 'fib-retracement', label: 'Fib retracement' },
      { kind: 'trend-based-fib-extension', label: 'Trend-based fib extension' },
      { kind: 'fib-channel', label: 'Fib channel' },
      { kind: 'pitchfork', label: 'Pitchfork' }
    ]
  },
  {
    id: 'shapes',
    label: 'Geometric shapes',
    icon: Circle,
    tools: [
      { kind: 'rectangle', label: 'Rectangle' },
      { kind: 'circle', label: 'Circle' },
      { kind: 'ellipse', label: 'Ellipse' },
      { kind: 'triangle', label: 'Triangle' }
    ]
  },
  {
    id: 'projection',
    label: 'Projections & ranges',
    icon: Move3d,
    tools: [
      { kind: 'long-position', label: 'Long position' },
      { kind: 'short-position', label: 'Short position' },
      { kind: 'position-forecast', label: 'Position forecast' },
      { kind: 'price-range', label: 'Price range' },
      { kind: 'date-and-price-range', label: 'Date and price range' }
    ]
  },
  {
    id: 'annotation',
    label: 'Annotation',
    icon: Type,
    tools: [
      { kind: 'text', label: 'Text' },
      { kind: 'note', label: 'Note' },
      { kind: 'price-note', label: 'Price note' },
      { kind: 'callout', label: 'Callout' },
      { kind: 'brush', label: 'Brush' },
      { kind: 'highlighter', label: 'Highlighter' },
      { kind: 'polyline', label: 'Polyline' },
      { kind: 'arrow', label: 'Arrow' }
    ]
  },
  {
    id: 'math',
    label: 'Math & data',
    icon: Hash,
    tools: [
      { kind: 'regression-trend', label: 'Regression trend' },
      { kind: 'anchored-vwap', label: 'Anchored VWAP' }
    ]
  }
]

/** All tool kinds in one flat set, for membership checks. */
export const DRAWING_TOOL_KINDS: ReadonlySet<string> = new Set(
  DRAWING_TOOL_GROUPS.flatMap((group) => group.tools.map((tool) => tool.kind))
)

export function toolLabel(kind: string): string {
  for (const group of DRAWING_TOOL_GROUPS) {
    const tool = group.tools.find((t) => t.kind === kind)
    if (tool) return tool.label
  }
  return kind
}

/** Icons for the toolbar favourites bar (mirrors TV's compact left rail). */
export const FAVOURITE_TOOLS: { kind: DrawingToolId; label: string; icon: LucideIcon }[] = [
  { kind: 'trend-line', label: 'Trend line', icon: LineChart },
  { kind: 'horizontal-line', label: 'Horizontal line', icon: Minus },
  { kind: 'fib-retracement', label: 'Fib retracement', icon: Waves },
  { kind: 'rectangle', label: 'Rectangle', icon: Circle },
  { kind: 'long-position', label: 'Long position', icon: TrendingUp },
  { kind: 'short-position', label: 'Short position', icon: ArrowDownFromLine },
  { kind: 'position-forecast', label: 'Position forecast', icon: ArrowUpFromLine },
  { kind: 'brush', label: 'Brush', icon: PenTool },
  { kind: 'text', label: 'Text', icon: Type }
]

export const CURSOR_ICON = Crosshair
export const SELECT_ICON = MousePointer2
export const MEASURE_ICON = Ruler
export const GROUP_ICON = Waypoints
export const BRANCH_ICON = GitBranch
