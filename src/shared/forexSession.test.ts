import { describe, expect, it } from 'vitest'
import {
  coverEndForTimeframe,
  floorOpenForTimeframe,
  floorToForexMonthOpen,
  floorToForexWeekOpen,
  floorToInterval,
  forexNyCloseOffsetSeconds,
  importedForexSessionOffset,
  nextForexMonthOpen
} from './forexSession'

function utcSeconds(year: number, month: number, day: number, hour: number, minute = 0): number {
  return Date.UTC(year, month, day, hour, minute, 0) / 1000
}

describe('forexNyCloseOffsetSeconds', () => {
  it('uses 21h during EDT (28 Aug 2020)', () => {
    expect(forexNyCloseOffsetSeconds(utcSeconds(2020, 7, 28, 12))).toBe(21 * 3600)
  })

  it('uses 22h during EST (January 2020)', () => {
    expect(forexNyCloseOffsetSeconds(utcSeconds(2020, 0, 15, 12))).toBe(22 * 3600)
  })
})

describe('floorToInterval', () => {
  it('matches UTC floor when offset is 0', () => {
    const t = 1_700_000_123
    const step = 300
    expect(floorToInterval(t, step, 0)).toBe(Math.floor(t / step) * step)
  })

  it('shares a daily NY-close open across 2020-08-27 21:00 and 2020-08-28 20:59', () => {
    const offset = 21 * 3600
    const day = 86400
    const open = utcSeconds(2020, 7, 27, 21)
    const almostClose = utcSeconds(2020, 7, 28, 20, 59)
    const nextOpen = utcSeconds(2020, 7, 28, 21)
    expect(floorToInterval(open, day, offset)).toBe(open)
    expect(floorToInterval(almostClose, day, offset)).toBe(open)
    expect(floorToInterval(nextOpen, day, offset)).toBe(nextOpen)
  })
})

describe('importedForexSessionOffset', () => {
  it('returns the NY offset fn for 4h/6h/1d only', () => {
    expect(importedForexSessionOffset('4h')).toBe(forexNyCloseOffsetSeconds)
    expect(importedForexSessionOffset('6h')).toBe(forexNyCloseOffsetSeconds)
    expect(importedForexSessionOffset('1d')).toBe(forexNyCloseOffsetSeconds)
    expect(importedForexSessionOffset('5m')).toBeUndefined()
    expect(importedForexSessionOffset('1h')).toBeUndefined()
    expect(importedForexSessionOffset('1w')).toBeUndefined()
    expect(importedForexSessionOffset('1M')).toBeUndefined()
  })
})

describe('floorToForexWeekOpen', () => {
  it('buckets Mon 17:00 NY → next Mon 17:00 (EDT Aug 2020)', () => {
    // Monday 2020-08-24 17:00 NY = 21:00 UTC
    const weekOpen = utcSeconds(2020, 7, 24, 21)
    const midWeek = utcSeconds(2020, 7, 26, 15)
    const almostNext = utcSeconds(2020, 7, 31, 20, 59)
    const nextOpen = utcSeconds(2020, 7, 31, 21)
    expect(floorToForexWeekOpen(weekOpen)).toBe(weekOpen)
    expect(floorToForexWeekOpen(midWeek)).toBe(weekOpen)
    expect(floorToForexWeekOpen(almostNext)).toBe(weekOpen)
    expect(floorToForexWeekOpen(nextOpen)).toBe(nextOpen)
    expect(coverEndForTimeframe(weekOpen, '1w')).toBe(nextOpen - 1)
  })
})

describe('floorToForexMonthOpen', () => {
  it('buckets NY calendar month at NY close (EDT Aug 2020)', () => {
    const augOpen = floorToForexMonthOpen(utcSeconds(2020, 7, 15, 12))
    const sepOpen = nextForexMonthOpen(augOpen)
    expect(floorToForexMonthOpen(augOpen)).toBe(augOpen)
    expect(floorToForexMonthOpen(utcSeconds(2020, 7, 31, 20, 59))).toBe(augOpen)
    expect(floorToForexMonthOpen(sepOpen)).toBe(sepOpen)
    expect(coverEndForTimeframe(augOpen, '1M')).toBe(sepOpen - 1)
    // Aug open should be 1 Aug 21:00 UTC (EDT) = session day Aug 1
    expect(augOpen).toBe(utcSeconds(2020, 7, 1, 21))
  })
})

describe('floorOpenForTimeframe', () => {
  it('routes 1w/1M and NY session TFs', () => {
    const t = utcSeconds(2020, 7, 26, 12)
    expect(floorOpenForTimeframe('1w', t)).toBe(floorToForexWeekOpen(t))
    expect(floorOpenForTimeframe('1M', t)).toBe(floorToForexMonthOpen(t))
    expect(floorOpenForTimeframe('1d', t)).toBe(
      floorToInterval(t, 86400, forexNyCloseOffsetSeconds(t))
    )
    expect(floorOpenForTimeframe('30m', t)).toBe(floorToInterval(t, 1800, 0))
  })
})
