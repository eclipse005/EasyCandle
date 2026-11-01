import { describe, expect, it } from 'vitest'
import {
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
