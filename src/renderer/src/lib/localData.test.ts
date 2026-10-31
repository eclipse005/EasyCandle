import { describe, expect, it } from 'vitest'
import { formatApproxBytes } from '@/lib/localData'

describe('formatApproxBytes', () => {
  it('shows 0 KB for empty', () => {
    expect(formatApproxBytes(0)).toEqual({ value: '0', unit: 'KB' })
  })

  it('rounds small sizes up to at least 1 KB', () => {
    expect(formatApproxBytes(100)).toEqual({ value: '1', unit: 'KB' })
  })

  it('uses MB for megabyte-scale sizes', () => {
    expect(formatApproxBytes(2.5 * 1024 * 1024)).toEqual({ value: '2.5', unit: 'MB' })
  })
})
