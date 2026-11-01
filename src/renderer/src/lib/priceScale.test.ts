import { describe, expect, it } from 'vitest'
import {
  barRemainingSeconds,
  formatBarCountdown,
  formatPriceBarRatio,
  lockedPriceRange,
  pricePerBar,
  priceScaleHit,
  priceScaleWidth,
  sessionScaleLevels
} from './priceScale'

describe('priceScaleHit', () => {
  it('hits the right scale and ignores the plot', () => {
    expect(priceScaleHit(960, 1000, 0, 60)).toBe('right')
    expect(priceScaleHit(500, 1000, 0, 60)).toBeNull()
    expect(priceScaleHit(20, 1000, 56, 0)).toBe('left')
  })

  it('treats a missing axis widget as zero width', () => {
    expect(
      priceScaleWidth(
        {
          priceScale: () => ({
            options: () => ({ visible: true }),
            width: () => {
              throw new Error('Value is null')
            }
          })
        },
        'right'
      )
    ).toBe(0)
    expect(
      priceScaleWidth(
        {
          priceScale: () => ({
            options: () => ({ visible: false }),
            width: () => 40
          })
        },
        'left'
      )
    ).toBe(0)
  })
})

describe('price bar ratio', () => {
  it('locks the visible span to the ratio times the bar count', () => {
    expect(pricePerBar({ from: 1.1, to: 1.16 }, 100)).toBeCloseTo(0.0006)
    expect(formatPriceBarRatio(0.0006)).toBe('0.0006')
    const locked = lockedPriceRange(1.13, 0.0006, 100)
    expect(locked?.from).toBeCloseTo(1.1)
    expect(locked?.to).toBeCloseTo(1.16)
  })
})

describe('formatBarCountdown', () => {
  it('formats the time left in the current bar', () => {
    expect(barRemainingSeconds(1_700_000_000, 1_700_000_000, 900)).toBe(900)
    expect(barRemainingSeconds(1_700_000_000, 1_700_000_040, 60)).toBe(20)
    expect(formatBarCountdown(900)).toBe('15:00')
    expect(formatBarCountdown(3661)).toBe('1:01:01')
  })
})

describe('sessionScaleLevels', () => {
  it('uses the forex session day and ignores bars after the playhead', () => {
    const sundayOpen = Date.UTC(2026, 0, 4, 22, 0) / 1000
    const mondayMorning = Date.UTC(2026, 0, 5, 13, 0) / 1000
    const later = Date.UTC(2026, 0, 5, 18, 0) / 1000
    const levels = sessionScaleLevels(
      [
        { time: sundayOpen - 60, high: 1.2, low: 1.1, close: 1.11 },
        { time: sundayOpen, high: 1.15, low: 1.12, close: 1.14 },
        { time: mondayMorning, high: 1.18, low: 1.13, close: 1.16 },
        { time: later, high: 1.3, low: 1.0, close: 1.2 }
      ],
      mondayMorning
    )
    expect(levels.previousClose).toBe(1.11)
    expect(levels.high).toBe(1.18)
    expect(levels.low).toBe(1.12)
  })
})
