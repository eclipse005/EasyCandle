import { describe, expect, it } from 'vitest'
import { formatAccountDateTime, formatAccountShortDate } from './displayTime'

describe('formatAccountDateTime', () => {
  it('formats Shanghai wall without UTC suffix', () => {
    // 2026-01-02 06:00:00 UTC → 14:00 Shanghai (UTC+8)
    const sec = Math.floor(Date.UTC(2026, 0, 2, 6, 0, 0) / 1000)
    expect(formatAccountDateTime(sec, 'Asia/Shanghai')).toBe('2026-01-02 14:00:00')
    expect(formatAccountDateTime(sec, 'Asia/Shanghai')).not.toMatch(/UTC/)
  })

  it('formats New York winter without UTC suffix', () => {
    const sec = Math.floor(Date.UTC(2026, 0, 2, 6, 0, 0) / 1000)
    expect(formatAccountDateTime(sec, 'America/New_York')).toBe('2026-01-02 01:00:00')
  })
})

describe('formatAccountShortDate', () => {
  it('uses account TZ calendar day', () => {
    // 2026-01-02 02:00 UTC = still Jan 1 in New York
    const sec = Math.floor(Date.UTC(2026, 0, 2, 2, 0, 0) / 1000)
    expect(formatAccountShortDate(sec, 'America/New_York')).toMatch(/Jan/)
    expect(formatAccountShortDate(sec, 'Asia/Shanghai')).toMatch(/Jan/)
  })
})
