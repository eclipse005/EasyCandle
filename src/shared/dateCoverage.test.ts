import { describe, expect, it } from 'vitest'
import { coveragePeriodIndex } from './dateCoverage'

describe('coveragePeriodIndex', () => {
  it('marks a year and month when any day in them has data', () => {
    const index = coveragePeriodIndex(
      new Set(['2023-01-02', '2023-01-31', '2026-11-01', 'bad', '2024'])
    )
    expect([...index.years].sort()).toEqual([2023, 2026])
    expect([...index.months].sort()).toEqual(['2023-01', '2026-11'])
  })

  it('stays empty when nothing is covered', () => {
    const index = coveragePeriodIndex(new Set())
    expect(index.years.size).toBe(0)
    expect(index.months.size).toBe(0)
  })
})
