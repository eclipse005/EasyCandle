import { describe, expect, it } from 'vitest'
import { factoryStyleFor } from 'lightweight-charts-drawing'
import {
  extendModeOf,
  extendPatch,
  fibTrendOf,
  levelsOf,
  levelsUseOneColor,
  paintLevels,
  patchLevel,
  restoreLevelColors,
  sectionsFor,
  statsPatch,
  statsPresetOf,
  tabsFor
} from '@/lib/drawings/drawingProperties'
import type { DrawingStyle } from 'lightweight-charts-drawing'

const base: DrawingStyle = { color: '#2962ff', width: 2, lineStyle: 'solid' }

describe('drawing property profiles', () => {
  it('gives a trend line the TradingView style rows and a text tab', () => {
    expect(sectionsFor('trend-line')).toEqual([
      'line',
      'ends',
      'extend',
      'middle',
      'priceLabels',
      'stats'
    ])
    expect(tabsFor('trend-line')).toContain('text')
  })

  it('gives fib retracement levels without a text tab', () => {
    expect(sectionsFor('fib-retracement')).toContain('levels')
    expect(sectionsFor('fib-retracement')).toContain('fibTrend')
    expect(tabsFor('fib-retracement')).not.toContain('text')
  })
})

describe('extend and stats', () => {
  it('round-trips extend modes and keeps a ray extended right by default', () => {
    expect(extendModeOf(base, 'trend-line')).toBe('none')
    expect(extendModeOf(base, 'ray')).toBe('right')
    expect(extendPatch('both')).toEqual({ extendLeft: true, extendRight: true })
    expect(extendModeOf({ ...base, ...extendPatch('left') }, 'trend-line')).toBe('left')
  })

  it('maps stat presets onto the library flags', () => {
    expect(statsPresetOf(base)).toBe('hidden')
    expect(statsPresetOf({ ...base, ...statsPatch('pricePct') })).toBe('pricePct')
    expect(statsPresetOf({ ...base, showAngle: true, showDistance: true })).toBe('custom')
  })
})

describe('fib levels', () => {
  it('uses the library factory ladder until the drawing stores its own', () => {
    const factory = factoryStyleFor('fib-retracement').levels ?? []
    expect(levelsOf(base, 'fib-retracement').map((level) => level.coeff)).toEqual(
      factory.map((level) => level.coeff)
    )
    expect(levelsOf(base, 'fib-retracement').some((level) => level.coeff === 0.618)).toBe(true)
    expect(levelsOf({ ...base, levels: [] }, 'fib-retracement')).toEqual([])
  })

  it('patches one level without dropping the others', () => {
    const levels = levelsOf(base, 'fib-retracement')
    const next = patchLevel(levels, 1, { color: '#123456', visible: false })
    expect(next?.[1]).toMatchObject({ color: '#123456', visible: false })
    expect(next).toHaveLength(levels.length)
    expect(patchLevel(levels, 0, { coeff: Number.NaN })).toBeNull()
  })

  it('paints one color and can restore factory colors', () => {
    const levels = levelsOf(base, 'fib-retracement')
    const painted = paintLevels(levels, '#abcdef')
    expect(levelsUseOneColor(painted)).toBe(true)
    const restored = restoreLevelColors(painted, levels)
    expect(restored[4]?.color).toBe(levels[4]?.color)
    expect(fibTrendOf(base)).toMatchObject({ visible: true, style: 'dashed', color: '#808080' })
  })
})
