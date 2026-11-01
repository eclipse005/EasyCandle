import { describe, expect, it } from 'vitest'
import {
  coverEndForTimeframe,
  floorOpenForTimeframe,
  floorToForexMonthOpen,
  floorToForexWeekOpen,
  floorToInterval,
  forexNyCloseOffsetSeconds,
  forexSessionDayOpen,
  importedForexSessionOffset,
  isForexWeekSessionOpen,
  nextForexGoTo,
  nextForexMonthOpen,
  omitForexWeekendCandles
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

describe('isForexWeekSessionOpen', () => {
  it('closes Friday 17:00 NY and reopens Sunday 17:00 NY (EST, Jan 2026 Dukascopy)', () => {
    expect(isForexWeekSessionOpen(utcSeconds(2026, 0, 2, 21, 59))).toBe(true)
    expect(isForexWeekSessionOpen(utcSeconds(2026, 0, 2, 22, 0))).toBe(false)
    expect(isForexWeekSessionOpen(utcSeconds(2026, 0, 3, 12, 0))).toBe(false)
    expect(isForexWeekSessionOpen(utcSeconds(2026, 0, 4, 21, 59))).toBe(false)
    expect(isForexWeekSessionOpen(utcSeconds(2026, 0, 4, 22, 0))).toBe(true)
  })

  it('uses the 21:00 UTC close while New York is on EDT', () => {
    expect(isForexWeekSessionOpen(utcSeconds(2020, 7, 28, 20, 59))).toBe(true)
    expect(isForexWeekSessionOpen(utcSeconds(2020, 7, 28, 21, 0))).toBe(false)
    expect(isForexWeekSessionOpen(utcSeconds(2020, 7, 23, 20, 59))).toBe(false)
    expect(isForexWeekSessionOpen(utcSeconds(2020, 7, 23, 21, 0))).toBe(true)
  })

  it('drops only the closed gap and keeps in-session flat bars', () => {
    const insideFlat = { time: utcSeconds(2026, 0, 1, 22, 0), volume: 0 }
    const fridayClose = { time: utcSeconds(2026, 0, 2, 22, 0), volume: 0 }
    const sundayOpen = { time: utcSeconds(2026, 0, 4, 22, 0), volume: 12 }
    const cleaned = omitForexWeekendCandles([insideFlat, fridayClose, sundayOpen])
    expect(cleaned).toEqual([insideFlat, sundayOpen])
    const open = [insideFlat, sundayOpen]
    expect(omitForexWeekendCandles(open)).toBe(open)
  })
})

describe('nextForexGoTo', () => {
  it('skips the Friday New York close and lands on Sunday 17:00 (EST)', () => {
    const fridayAfternoon = utcSeconds(2026, 0, 2, 21, 59)
    expect(nextForexGoTo(fridayAfternoon, 'dayOpen')).toBe(utcSeconds(2026, 0, 4, 22, 0))
    expect(nextForexGoTo(fridayAfternoon, 'asian')).toBe(utcSeconds(2026, 0, 5, 0, 0))
    expect(nextForexGoTo(fridayAfternoon, 'london')).toBe(utcSeconds(2026, 0, 5, 7, 0))
    expect(nextForexGoTo(fridayAfternoon, 'newYork')).toBe(utcSeconds(2026, 0, 5, 12, 0))
    expect(nextForexGoTo(fridayAfternoon, 'nextSession')).toBe(utcSeconds(2026, 0, 5, 0, 0))
  })

  it('picks the soonest of 19:00, 02:00, and 07:00 after a Monday morning (EST)', () => {
    const mondayMorning = utcSeconds(2026, 0, 5, 13, 0)
    expect(nextForexGoTo(mondayMorning, 'nextSession')).toBe(utcSeconds(2026, 0, 6, 0, 0))
    expect(nextForexGoTo(mondayMorning, 'dayOpen')).toBe(utcSeconds(2026, 0, 5, 22, 0))
    expect(nextForexGoTo(mondayMorning, 'newYork')).toBe(utcSeconds(2026, 0, 6, 12, 0))
  })

  it('steps past an exact session clock to the following one', () => {
    const mondayAsian = utcSeconds(2026, 0, 6, 0, 0)
    expect(nextForexGoTo(mondayAsian, 'nextSession')).toBe(utcSeconds(2026, 0, 6, 7, 0))
    expect(nextForexGoTo(mondayAsian, 'asian')).toBe(utcSeconds(2026, 0, 7, 0, 0))
  })

  it('uses the 21:00 UTC close while New York is on EDT', () => {
    const fridayAfternoon = utcSeconds(2020, 7, 28, 20, 59)
    expect(nextForexGoTo(fridayAfternoon, 'dayOpen')).toBe(utcSeconds(2020, 7, 30, 21, 0))
  })

  it('crosses the March DST change onto Sunday 17:00 EDT', () => {
    const fridayBeforeDst = utcSeconds(2026, 2, 6, 21, 0)
    expect(nextForexGoTo(fridayBeforeDst, 'dayOpen')).toBe(utcSeconds(2026, 2, 8, 21, 0))
    const sundayAsian = utcSeconds(2026, 2, 8, 23, 0)
    expect(nextForexGoTo(sundayAsian, 'london')).toBe(utcSeconds(2026, 2, 9, 6, 0))
  })
})

describe('forexSessionDayOpen', () => {
  it('returns the NY 17:00 that opened the session day', () => {
    expect(forexSessionDayOpen(utcSeconds(2026, 0, 5, 13, 0))).toBe(utcSeconds(2026, 0, 4, 22, 0))
    expect(forexSessionDayOpen(utcSeconds(2026, 0, 2, 21, 0))).toBe(utcSeconds(2026, 0, 1, 22, 0))
    expect(forexSessionDayOpen(utcSeconds(2026, 0, 4, 22, 0))).toBe(utcSeconds(2026, 0, 4, 22, 0))
  })

  it('returns null on the closed weekend', () => {
    expect(forexSessionDayOpen(utcSeconds(2026, 0, 3, 17, 0))).toBeNull()
    expect(forexSessionDayOpen(utcSeconds(2026, 0, 2, 22, 0))).toBeNull()
  })
})

describe('floorToForexWeekOpen', () => {
  it('buckets Sun 17:00 NY → next Sun 17:00 (EDT Aug 2020 / TradingView)', () => {
    // Sunday 2020-08-23 17:00 NY = 21:00 UTC
    const weekOpen = utcSeconds(2020, 7, 23, 21)
    const midWeek = utcSeconds(2020, 7, 26, 15)
    const almostNext = utcSeconds(2020, 7, 30, 20, 59)
    const nextOpen = utcSeconds(2020, 7, 30, 21)
    expect(floorToForexWeekOpen(weekOpen)).toBe(weekOpen)
    expect(floorToForexWeekOpen(midWeek)).toBe(weekOpen)
    expect(floorToForexWeekOpen(almostNext)).toBe(weekOpen)
    expect(floorToForexWeekOpen(nextOpen)).toBe(nextOpen)
    expect(coverEndForTimeframe(weekOpen, '1w')).toBe(nextOpen - 1)
  })

  it('floors Mon after Sun open back to that Sunday (EDT Oct 2026 sample)', () => {
    // Sunday 2026-10-25 17:00 NY = 21:00 UTC (EDT)
    const weekOpen = utcSeconds(2026, 9, 25, 21)
    const monEarly = utcSeconds(2026, 9, 26, 1)
    expect(floorToForexWeekOpen(weekOpen)).toBe(weekOpen)
    expect(floorToForexWeekOpen(monEarly)).toBe(weekOpen)
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
