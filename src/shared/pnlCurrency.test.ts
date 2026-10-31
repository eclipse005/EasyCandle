import { describe, expect, it } from 'vitest'
import { pnlForSide, pnlScaleForSymbol } from '@/lib/paperTrade'
import {
  accountPnlFromQuote,
  accountRateForSymbol,
  formatPnlCcy,
  quoteCurrencyForSymbol
} from './pnlCurrency'

/** Regression set from upstream issue #51. */

describe('quoteCurrencyForSymbol', () => {
  it('derives the quote (profit) currency from the symbol', () => {
    expect(quoteCurrencyForSymbol('EURUSD')).toBe('USD')
    expect(quoteCurrencyForSymbol('USDJPY')).toBe('JPY')
    expect(quoteCurrencyForSymbol('EURGBP')).toBe('GBP')
    expect(quoteCurrencyForSymbol('BTCUSDT')).toBe('USDT')
    expect(quoteCurrencyForSymbol('XAUUSD')).toBe('USD')
    expect(quoteCurrencyForSymbol('eur/usd')).toBe('USD')
  })
})

describe('#51 case 1 — EURUSD, USD account, 100,000 contract', () => {
  it('returns -35.00 USD for the reported example', () => {
    // 1 lot long from 1.10000 stopped at 1.09965 = 3.5 pips = -35 USD.
    const quote = pnlForSide('long', 1.1, 1.09965, pnlScaleForSymbol('EURUSD', 1))
    expect(quote).toBeCloseTo(-35, 6)
    expect(accountPnlFromQuote(quote, 'EURUSD', 1.09965)).toBeCloseTo(-35, 6)
    expect(formatPnlCcy(quote, 'USD')).toBe('- 35.00 USD')
  })
})

describe('#51 case 2 — USDJPY converts via the exit price, not treated as dollars', () => {
  it('labels JPY and converts to USD at the chart exit rate', () => {
    const quote = pnlForSide('long', 155.0, 154.5, pnlScaleForSymbol('USDJPY', 1))
    expect(quote).toBeCloseTo(-50_000, 4) // 0.50 × 100,000 = -50,000 JPY
    expect(formatPnlCcy(quote, 'JPY')).toBe('- 50,000.00 JPY')
    const rate = accountRateForSymbol('USDJPY', 154.5)
    expect(rate).toBeCloseTo(1 / 154.5, 10)
    const usd = accountPnlFromQuote(quote, 'USDJPY', 154.5)
    expect(usd).toBeCloseTo(-50_000 / 154.5, 6)
    expect(formatPnlCcy(usd, 'USD')).toBe('- 323.62 USD')
  })
})

describe('#51 case 3 — EURGBP true cross stays GBP (no fabricated USD)', () => {
  it('reports null conversion against a USD account', () => {
    const quote = pnlForSide('long', 0.86, 0.85, pnlScaleForSymbol('EURGBP', 1))
    expect(quoteCurrencyForSymbol('EURGBP')).toBe('GBP')
    expect(accountRateForSymbol('EURGBP', 0.85)).toBeNull()
    expect(accountPnlFromQuote(quote, 'EURGBP', 0.85)).toBeNull()
  })
})

describe('#51 case 4 — XAUUSD follows the imported contract-size spec', () => {
  it('scales with 1 and 100 contract sizes when explicitly provided', () => {
    const one = pnlForSide('long', 2000, 2010, pnlScaleForSymbol('XAUUSD', 1, 1))
    const hundred = pnlForSide('long', 2000, 2010, pnlScaleForSymbol('XAUUSD', 1, 100))
    expect(one).toBeCloseTo(10, 6)
    expect(hundred).toBeCloseTo(1000, 6)
    // Default (no import spec) falls back to the name-derived 100 oz.
    expect(pnlScaleForSymbol('XAUUSD', 1).contractSize).toBe(100)
  })
})

describe('#51 case 5 — long and short with the same move', () => {
  it('have equal magnitude and opposite sign', () => {
    const long = pnlForSide('long', 135.0, 135.5, pnlScaleForSymbol('USDJPY', 1, 100_000))
    const short = pnlForSide('short', 135.0, 135.5, pnlScaleForSymbol('USDJPY', 1, 100_000))
    expect(long).toBeCloseTo(-short, 10)
  })
})

describe('#51 case 6 — invalid or missing inputs never fabricate money', () => {
  it('returns null for non-finite prices and keeps the name default when no spec exists', () => {
    expect(accountRateForSymbol('USDJPY', Number.NaN)).toBeNull()
    expect(accountRateForSymbol('USDJPY', 0)).toBeNull()
    expect(accountPnlFromQuote(Number.NaN, 'USDJPY', 154.5)).toBeNull()
    // Unknown short symbol falls back to the account currency for quoting.
    expect(quoteCurrencyForSymbol('GOLD')).toBe('USD')
  })
})
