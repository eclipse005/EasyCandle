import { describe, expect, it } from 'vitest'
import { LineStyle } from 'lightweight-charts'
import { DEFAULT_FIB_LEVELS } from '@/lib/chart/drawingGeometry'
import {
  lcdLevelsFromLegacyFib,
  legacyFibLevelsForNewDrawing,
  legacyFibLevelsUntouched,
  stylePatchOnAdd,
  timeframesFromVisibility,
  toLcdInterval,
  visibilityFromTimeframes
} from '@/lib/drawings/drawingStyleBridge'
import { TIMEFRAME_IDS } from '@shared/timeframes'

describe('lcd interval visibility', () => {
  it('maps every app timeframe onto the library interval string', () => {
    expect(toLcdInterval('3m')).toBe('3')
    expect(toLcdInterval('30m')).toBe('30')
    expect(toLcdInterval('6h')).toBe('360')
    expect(toLcdInterval('1w')).toBe('1W')
    expect(toLcdInterval('1M')).toBe('1M')
  })

  it('round-trips a single new timeframe and keeps an unset matrix as all timeframes', () => {
    expect(timeframesFromVisibility(undefined)).toEqual(TIMEFRAME_IDS)
    expect(timeframesFromVisibility(visibilityFromTimeframes(['1w', '1M']))).toEqual(['1w', '1M'])
    expect(timeframesFromVisibility(visibilityFromTimeframes(['6h']))).toEqual(['6h'])
  })

  it('keeps the range rule for minutes', () => {
    expect(timeframesFromVisibility(visibilityFromTimeframes(['1m', '15m']))).toEqual([
      '1m',
      '3m',
      '5m',
      '15m'
    ])
  })
})

const factoryLevels = [
  { coeff: 0, color: '#808080', visible: true, width: 2, style: 'solid' as const },
  { coeff: 0.618, color: '#089981', visible: true, width: 2, style: 'solid' as const },
  { coeff: 1.618, color: '#2962ff', visible: false, width: 1, style: 'dotted' as const }
]

describe('legacy fib levels on new drawings', () => {
  it('leaves the library ladder alone when the left bar is still stock', () => {
    expect(legacyFibLevelsUntouched(DEFAULT_FIB_LEVELS)).toBe(true)
    expect(
      legacyFibLevelsForNewDrawing('fib-retracement', DEFAULT_FIB_LEVELS, factoryLevels, '#111111')
    ).toBeNull()
    expect(
      legacyFibLevelsForNewDrawing('trend-line', [{ ratio: 0.5, color: '#123456' }], factoryLevels, '#111111')
    ).toBeNull()
  })

  it('maps a customized list and keeps factory visibility and width', () => {
    const legacy = [
      { ratio: 0 },
      { ratio: 0.618, color: '#123456', lineStyle: LineStyle.Dashed },
      { ratio: 1.618 },
      { ratio: 0.9, color: '#abcdef' }
    ]
    expect(lcdLevelsFromLegacyFib(legacy, factoryLevels, '#111111')).toEqual([
      { coeff: 0, color: '#808080', visible: true, width: 2, style: 'solid' },
      { coeff: 0.618, color: '#123456', visible: true, width: 2, style: 'dashed' },
      { coeff: 1.618, color: '#2962ff', visible: false, width: 1, style: 'dotted' },
      { coeff: 0.9, color: '#abcdef', visible: true }
    ])
    expect(
      legacyFibLevelsForNewDrawing('fib-channel', legacy, factoryLevels, '#111111')
    ).toHaveLength(4)
    expect(
      legacyFibLevelsForNewDrawing('trend-based-fib-extension', legacy, factoryLevels, '#111111')
    ).toHaveLength(4)
  })

  it('does not seed when an LCD kind default exists or the stroke was already changed', () => {
    const levels = lcdLevelsFromLegacyFib(
      [{ ratio: 0.5, color: '#123456' }],
      factoryLevels,
      '#111111'
    )
    const stroke = { color: '#2962ff', width: 2, lineStyle: 'solid' as const }
    expect(
      stylePatchOnAdd({
        hasKindDefault: true,
        stillFactoryStroke: true,
        stroke,
        levels
      })
    ).toBeNull()
    expect(
      stylePatchOnAdd({
        hasKindDefault: false,
        stillFactoryStroke: false,
        stroke,
        levels
      })
    ).toBeNull()
    expect(
      stylePatchOnAdd({
        hasKindDefault: false,
        stillFactoryStroke: true,
        stroke,
        levels: null
      })
    ).toEqual(stroke)
    expect(
      stylePatchOnAdd({
        hasKindDefault: false,
        stillFactoryStroke: true,
        stroke,
        levels
      })?.levels
    ).toEqual(levels)
  })
})
