import { describe, expect, it } from 'vitest'
import type { Candle } from './candleUtils'
import { buildImportedDatasetMeta, importedPricePrecision } from './importMeta'

function candles(prices: number[], start = 1_700_000_000): Candle[] {
  return prices.map((price, index) => ({
    time: start + index * 60,
    open: price,
    high: price,
    low: price,
    close: price
  }))
}

describe('importedPricePrecision', () => {
  it('keeps the FX quote precision even when samples end in zeros', () => {
    expect(importedPricePrecision('EURUSD', candles([1.17, 1.17]))).toBe(5)
  })

  it('honours extra decimals actually present in the import', () => {
    expect(importedPricePrecision('EURUSD', candles([1.170123]))).toBe(6)
  })

  it('uses three digits for JPY quotes and infers unknown symbols', () => {
    expect(importedPricePrecision('USDJPY', candles([151.234]))).toBe(3)
    expect(importedPricePrecision('FOOBAR', candles([12.3456]))).toBe(4)
  })
})

describe('buildImportedDatasetMeta', () => {
  it('stores the quote precision from the imported 1m series', () => {
    const meta = buildImportedDatasetMeta({
      id: 'imp-1',
      originalFileName: 'EURUSD.csv',
      symbol: 'EURUSD',
      candlesByTimeframe: { '1m': candles([1.17011, 1.17012]) }
    })
    expect(meta.pricePrecision).toBe(5)
  })
})
