import { describe, expect, it, vi, afterEach } from 'vitest'
import { formatApproxBytes, formatStorageBytes, estimateLocalUsage } from '@/lib/localData'

describe('formatStorageBytes', () => {
  it('shows 0 KB for empty', () => {
    expect(formatStorageBytes(0)).toEqual({ value: '0', unit: 'KB' })
  })

  it('formats small sizes in KB with one decimal', () => {
    expect(formatStorageBytes(100)).toEqual({ value: '0.1', unit: 'KB' })
    expect(formatStorageBytes(1536)).toEqual({ value: '1.5', unit: 'KB' })
  })

  it('uses MB for megabyte-scale sizes', () => {
    expect(formatStorageBytes(2.5 * 1024 * 1024)).toEqual({ value: '2.5', unit: 'MB' })
    expect(formatStorageBytes(11.2 * 1024 * 1024)).toEqual({ value: '11.2', unit: 'MB' })
  })
})

describe('formatApproxBytes', () => {
  it('delegates KB/MB formatting', () => {
    expect(formatApproxBytes(0)).toEqual({ value: '0', unit: 'KB' })
    expect(formatApproxBytes(2.5 * 1024 * 1024)).toEqual({ value: '2.5', unit: 'MB' })
  })
})

describe('estimateLocalUsage', () => {
  const original = globalThis.navigator

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: original
    })
  })

  it('prefers navigator.storage.estimate usage for total', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        storage: {
          estimate: vi.fn(async () => ({ usage: 11_743_232, quota: 1_000_000_000 }))
        }
      }
    })
    const usage = await estimateLocalUsage()
    expect(usage.totalBytes).toBe(11_743_232)
    expect(usage.fromStorageEstimate).toBe(true)
  })
})
