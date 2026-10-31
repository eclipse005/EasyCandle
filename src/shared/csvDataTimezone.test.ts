import { describe, expect, it } from 'vitest'
import {
  formatCsvWallClock,
  isCsvDataTimezone,
  remapCandlesCsvTimezone,
  remapProvisionalCsvSeconds,
  wallClockToUnixSeconds
} from './csvDataTimezone'

describe('csvDataTimezone', () => {
  it('accepts account/import curated ids only', () => {
    expect(isCsvDataTimezone('UTC')).toBe(true)
    expect(isCsvDataTimezone('America/New_York')).toBe(true)
    expect(isCsvDataTimezone('Asia/Shanghai')).toBe(true)
    expect(isCsvDataTimezone('Pacific/Pago_Pago')).toBe(true)
    expect(isCsvDataTimezone('Europe/Athens')).toBe(false) // not in account list
    expect(isCsvDataTimezone('')).toBe(false)
    expect(isCsvDataTimezone('Not/AZone')).toBe(false)
  })

  it('UTC remap is identity', () => {
    const sec = Date.UTC(2024, 6, 15, 12, 30, 0) / 1000
    expect(remapProvisionalCsvSeconds(sec, 'UTC')).toBe(sec)
    const candles = [{ time: sec, open: 1, high: 1, low: 1, close: 1 }]
    expect(remapCandlesCsvTimezone(candles, 'UTC')).toBe(candles)
  })

  it('New York summer wall → true UTC', () => {
    // CSV says 2024-07-15 00:00:00 in New York (EDT = UTC-4) → 04:00 UTC
    const provisional = Date.UTC(2024, 6, 15, 0, 0, 0) / 1000
    expect(formatCsvWallClock(provisional)).toBe('2024-07-15 00:00:00')
    expect(remapProvisionalCsvSeconds(provisional, 'America/New_York')).toBe(
      Date.UTC(2024, 6, 15, 4, 0, 0) / 1000
    )
  })

  it('Dubai GMT+4 wall → true UTC', () => {
    const provisional = Date.UTC(2024, 0, 2, 4, 0, 0) / 1000
    expect(remapProvisionalCsvSeconds(provisional, 'Asia/Dubai')).toBe(
      Date.UTC(2024, 0, 2, 0, 0, 0) / 1000
    )
  })

  it('wallClockToUnixSeconds matches remap for UTC', () => {
    expect(wallClockToUnixSeconds(2024, 1, 2, 3, 4, 5, 'UTC')).toBe(
      Date.UTC(2024, 0, 2, 3, 4, 5) / 1000
    )
  })
})
