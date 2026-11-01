import { OVERLAY_SPECS, type DrawingKind } from 'lightweight-charts-drawing'

/**
 * TradingView left-toolbar groups, from lightweight-charts-drawing's demo
 * (`demo/tool-groups.ts`, captured from TradingView Desktop).
 */
export type ToolEntry = {
  kind: DrawingKind
  title: string
  placement: string
}

export type ToolSection = {
  header: string
  tools: ToolEntry[]
}

export type ToolGroup = {
  id: string
  title: string
  titleZh: string
  sections: ToolSection[]
}

const ZH: Record<string, string> = {
  Lines: '线条',
  Channels: '通道',
  Pitchforks: '音叉',
  Fibonacci: '斐波那契',
  Gann: '江恩',
  'Chart patterns': '图表形态',
  'Elliott waves': '艾略特波浪',
  Cycles: '周期',
  Forecasting: '预测',
  'Volume-based': '成交量',
  Measurers: '测量',
  Brushes: '笔刷',
  Arrows: '箭头',
  Shapes: '形状',
  'Text and notes': '文字和注释',
  Content: '内容',
  'trend-line': '趋势线',
  ray: '射线',
  'info-line': '信息线',
  'extended-line': '延长线',
  'trend-angle': '趋势角度',
  'horizontal-line': '水平线',
  'horizontal-ray': '水平射线',
  'vertical-line': '垂直线',
  'cross-line': '十字线',
  'parallel-channel': '平行通道',
  'regression-trend': '回归趋势',
  'flat-top-bottom': '平顶/平底',
  'disjoint-channel': '不相交通道',
  pitchfork: '音叉',
  'schiff-pitchfork': '希夫音叉',
  'modified-schiff-pitchfork': '修正希夫音叉',
  'inside-pitchfork': '内部分叉',
  'fib-retracement': '斐波那契回撤',
  'trend-based-fib-extension': '斐波那契趋势扩展',
  'fib-channel': '斐波那契通道',
  'fib-time-zone': '斐波那契时区',
  'fib-speed-resistance-fan': '斐波那契速度阻力扇',
  'trend-based-fib-time': '斐波那契趋势时间',
  'fib-circles': '斐波那契圈',
  'fib-spiral': '斐波那契螺旋',
  'fib-speed-resistance-arcs': '斐波那契速度阻力弧',
  'fib-wedge': '斐波那契楔形',
  pitchfan: '扇形线',
  'gann-box': '江恩箱',
  'gann-square-fixed': '固定江恩正方',
  'gann-square': '江恩正方',
  'gann-fan': '江恩扇',
  'xabcd-pattern': 'XABCD 形态',
  'cypher-pattern': '赛弗形态',
  'head-and-shoulders': '头肩形态',
  'abcd-pattern': 'ABCD 形态',
  'triangle-pattern': '三角形形态',
  'three-drives-pattern': '三驱形态',
  'elliott-impulse': '艾略特推动浪',
  'elliott-correction': '艾略特调整浪',
  'elliott-triangle': '艾略特三角浪',
  'elliott-double-combo': '艾略特双重组合浪',
  'elliott-triple-combo': '艾略特三重组合浪',
  'cyclic-lines': '循环线',
  'time-cycles': '时间周期',
  'sine-line': '正弦线',
  'long-position': '多头',
  'short-position': '空头',
  'position-forecast': '仓位预测',
  'bar-pattern': 'K 线形态',
  'ghost-feed': '模拟 K 线',
  sector: '扇形',
  'anchored-vwap': '锚定 VWAP',
  'fixed-range-volume-profile': '固定范围成交量分布',
  'anchored-volume-profile': '锚定成交量分布',
  'price-range': '价格范围',
  'date-range': '日期范围',
  'date-and-price-range': '日期和价格范围',
  brush: '笔刷',
  highlighter: '荧光笔',
  'arrow-marker': '箭头标记',
  arrow: '箭头',
  'arrow-mark-up': '向上箭头',
  'arrow-mark-down': '向下箭头',
  rectangle: '矩形',
  'rotated-rectangle': '旋转矩形',
  path: '路径',
  circle: '圆',
  ellipse: '椭圆',
  polyline: '折线',
  triangle: '三角形',
  arc: '弧线',
  curve: '曲线',
  'double-curve': '双曲线',
  text: '文字',
  note: '注释',
  'price-note': '价格注释',
  pin: '图钉',
  table: '表格',
  callout: '标注',
  comment: '评论',
  'price-label': '价格标签',
  signpost: '路标',
  'flag-mark': '旗标',
  image: '图片',
  'font-icon': '表情'
}

export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'trend',
    title: 'Trend tools',
    titleZh: '趋势线工具',
    sections: [
      {
        header: 'Lines',
        tools: [
          { kind: 'trend-line', title: 'Trendline', placement: '2 clicks' },
          { kind: 'ray', title: 'Ray', placement: '2 clicks' },
          { kind: 'info-line', title: 'Info line', placement: '2 clicks' },
          { kind: 'extended-line', title: 'Extended line', placement: '2 clicks' },
          { kind: 'trend-angle', title: 'Trend angle', placement: '2 clicks' },
          { kind: 'horizontal-line', title: 'Horizontal line', placement: '1 click' },
          { kind: 'horizontal-ray', title: 'Horizontal ray', placement: '1 click' },
          { kind: 'vertical-line', title: 'Vertical line', placement: '1 click' },
          { kind: 'cross-line', title: 'Cross line', placement: '1 click' }
        ]
      },
      {
        header: 'Channels',
        tools: [
          { kind: 'parallel-channel', title: 'Parallel channel', placement: '3 clicks' },
          { kind: 'regression-trend', title: 'Regression trend', placement: '2 clicks' },
          { kind: 'flat-top-bottom', title: 'Flat top/bottom', placement: '3 clicks' },
          { kind: 'disjoint-channel', title: 'Disjoint channel', placement: '3 clicks' }
        ]
      },
      {
        header: 'Pitchforks',
        tools: [
          { kind: 'pitchfork', title: 'Pitchfork', placement: '3 clicks' },
          { kind: 'schiff-pitchfork', title: 'Schiff pitchfork', placement: '3 clicks' },
          { kind: 'modified-schiff-pitchfork', title: 'Modified Schiff pitchfork', placement: '3 clicks' },
          { kind: 'inside-pitchfork', title: 'Inside pitchfork', placement: '3 clicks' }
        ]
      }
    ]
  },
  {
    id: 'fibonacci',
    title: 'Gann and Fibonacci tools',
    titleZh: '江恩和斐波那契',
    sections: [
      {
        header: 'Fibonacci',
        tools: [
          { kind: 'fib-retracement', title: 'Fib retracement', placement: '2 clicks' },
          { kind: 'trend-based-fib-extension', title: 'Trend-based fib extension', placement: '3 clicks' },
          { kind: 'fib-channel', title: 'Fib channel', placement: '3 clicks' },
          { kind: 'fib-time-zone', title: 'Fib time zone', placement: '2 clicks' },
          { kind: 'fib-speed-resistance-fan', title: 'Fib speed resistance fan', placement: '2 clicks' },
          { kind: 'trend-based-fib-time', title: 'Trend-based fib time', placement: '3 clicks' },
          { kind: 'fib-circles', title: 'Fib circles', placement: '2 clicks' },
          { kind: 'fib-spiral', title: 'Fib spiral', placement: '2 clicks' },
          { kind: 'fib-speed-resistance-arcs', title: 'Fib speed resistance arcs', placement: '2 clicks' },
          { kind: 'fib-wedge', title: 'Fib wedge', placement: '3 clicks' },
          { kind: 'pitchfan', title: 'Pitchfan', placement: '3 clicks' }
        ]
      },
      {
        header: 'Gann',
        tools: [
          { kind: 'gann-box', title: 'Gann box', placement: '2 clicks' },
          { kind: 'gann-square-fixed', title: 'Gann square fixed', placement: '2 clicks' },
          { kind: 'gann-square', title: 'Gann square', placement: '2 clicks' },
          { kind: 'gann-fan', title: 'Gann fan', placement: '2 clicks' }
        ]
      }
    ]
  },
  {
    id: 'patterns',
    title: 'Patterns',
    titleZh: '形态',
    sections: [
      {
        header: 'Chart patterns',
        tools: [
          { kind: 'xabcd-pattern', title: 'XABCD pattern', placement: '5 clicks' },
          { kind: 'cypher-pattern', title: 'Cypher pattern', placement: '5 clicks' },
          { kind: 'head-and-shoulders', title: 'Head and shoulders', placement: '7 clicks' },
          { kind: 'abcd-pattern', title: 'ABCD pattern', placement: '4 clicks' },
          { kind: 'triangle-pattern', title: 'Triangle pattern', placement: '4 clicks' },
          { kind: 'three-drives-pattern', title: 'Three drives pattern', placement: '7 clicks' }
        ]
      },
      {
        header: 'Elliott waves',
        tools: [
          { kind: 'elliott-impulse', title: 'Elliott impulse wave', placement: '6 clicks' },
          { kind: 'elliott-correction', title: 'Elliott correction wave', placement: '4 clicks' },
          { kind: 'elliott-triangle', title: 'Elliott triangle wave', placement: '6 clicks' },
          { kind: 'elliott-double-combo', title: 'Elliott double combo wave', placement: '4 clicks' },
          { kind: 'elliott-triple-combo', title: 'Elliott triple combo wave', placement: '6 clicks' }
        ]
      },
      {
        header: 'Cycles',
        tools: [
          { kind: 'cyclic-lines', title: 'Cyclic lines', placement: '2 clicks' },
          { kind: 'time-cycles', title: 'Time cycles', placement: '2 clicks' },
          { kind: 'sine-line', title: 'Sine line', placement: '2 clicks' }
        ]
      }
    ]
  },
  {
    id: 'forecast',
    title: 'Forecasting and measurement tools',
    titleZh: '预测和测量',
    sections: [
      {
        header: 'Forecasting',
        tools: [
          { kind: 'long-position', title: 'Long position', placement: '1 click' },
          { kind: 'short-position', title: 'Short position', placement: '1 click' },
          { kind: 'position-forecast', title: 'Position forecast', placement: '2 clicks' },
          { kind: 'bar-pattern', title: 'Bars pattern', placement: '2 clicks' },
          { kind: 'ghost-feed', title: 'Ghost feed', placement: 'double-click to finish' },
          { kind: 'sector', title: 'Sector', placement: '3 clicks' }
        ]
      },
      {
        header: 'Volume-based',
        tools: [
          { kind: 'anchored-vwap', title: 'Anchored VWAP', placement: '1 click' },
          { kind: 'fixed-range-volume-profile', title: 'Fixed range volume profile', placement: '2 clicks' },
          { kind: 'anchored-volume-profile', title: 'Anchored volume profile', placement: '1 click' }
        ]
      },
      {
        header: 'Measurers',
        tools: [
          { kind: 'price-range', title: 'Price range', placement: '2 clicks' },
          { kind: 'date-range', title: 'Date range', placement: '2 clicks' },
          { kind: 'date-and-price-range', title: 'Date and price range', placement: '2 clicks' }
        ]
      }
    ]
  },
  {
    id: 'shapes',
    title: 'Geometric shapes',
    titleZh: '几何形状',
    sections: [
      {
        header: 'Brushes',
        tools: [
          { kind: 'brush', title: 'Brush', placement: 'drag' },
          { kind: 'highlighter', title: 'Highlighter', placement: 'drag' }
        ]
      },
      {
        header: 'Arrows',
        tools: [
          { kind: 'arrow-marker', title: 'Arrow marker', placement: '2 clicks' },
          { kind: 'arrow', title: 'Arrow', placement: '2 clicks' },
          { kind: 'arrow-mark-up', title: 'Arrow mark up', placement: '1 click' },
          { kind: 'arrow-mark-down', title: 'Arrow mark down', placement: '1 click' }
        ]
      },
      {
        header: 'Shapes',
        tools: [
          { kind: 'rectangle', title: 'Rectangle', placement: '2 clicks' },
          { kind: 'rotated-rectangle', title: 'Rotated rectangle', placement: '3 clicks' },
          { kind: 'path', title: 'Path', placement: 'double-click to finish' },
          { kind: 'circle', title: 'Circle', placement: '2 clicks' },
          { kind: 'ellipse', title: 'Ellipse', placement: '3 clicks' },
          { kind: 'polyline', title: 'Polyline', placement: 'double-click to finish' },
          { kind: 'triangle', title: 'Triangle', placement: '3 clicks' },
          { kind: 'arc', title: 'Arc', placement: '3 clicks' },
          { kind: 'curve', title: 'Curve', placement: '2 clicks' },
          { kind: 'double-curve', title: 'Double curve', placement: '2 clicks' }
        ]
      }
    ]
  },
  {
    id: 'annotation',
    title: 'Annotation tools',
    titleZh: '注释',
    sections: [
      {
        header: 'Text and notes',
        tools: [
          { kind: 'text', title: 'Text', placement: '1 click' },
          { kind: 'note', title: 'Note', placement: '2 clicks' },
          { kind: 'price-note', title: 'Price note', placement: '2 clicks' },
          { kind: 'pin', title: 'Pin', placement: '1 click' },
          { kind: 'table', title: 'Table', placement: '1 click' },
          { kind: 'callout', title: 'Callout', placement: '2 clicks' },
          { kind: 'comment', title: 'Comment', placement: '1 click' },
          { kind: 'price-label', title: 'Price label', placement: '1 click' },
          { kind: 'signpost', title: 'Signpost', placement: '1 click' },
          { kind: 'flag-mark', title: 'Flag mark', placement: '1 click' }
        ]
      },
      {
        header: 'Content',
        tools: [{ kind: 'image', title: 'Image', placement: '1 click' }]
      }
    ]
  }
]

export const EMOJIS = [
  '🚀', '📈', '📉', '💰', '🔥', '⚡', '🎯', '⭐', '🔔', '💡', '📌', '🐂', '🐻', '👍', '👎', '👀'
]

export function groupTools(group: ToolGroup): ToolEntry[] {
  return group.sections.flatMap((section) => section.tools)
}

export function findTool(kind: string): ToolEntry | undefined {
  for (const group of TOOL_GROUPS) {
    const tool = groupTools(group).find((entry) => entry.kind === kind)
    if (tool) return tool
  }
  return undefined
}

export function findGroup(kind: string): ToolGroup | undefined {
  return TOOL_GROUPS.find((group) => groupTools(group).some((tool) => tool.kind === kind))
}

export function toolTitle(kind: string, locale: 'zh' | 'en'): string {
  const tool = findTool(kind)
  if (!tool) return ZH[kind] ?? kind
  return locale === 'zh' ? (ZH[kind] ?? tool.title) : tool.title
}

export function headerTitle(header: string, locale: 'zh' | 'en'): string {
  return locale === 'zh' ? (ZH[header] ?? header) : header
}

export function toolHotkey(kind: string): string {
  const hotkey = OVERLAY_SPECS[kind as DrawingKind]?.hotkey
  return typeof hotkey === 'string' ? hotkey : ''
}
