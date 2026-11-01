import { describe, expect, it } from 'vitest'
import {
  accountBalance,
  accountClosedTradePnl,
  accountPnlValue,
  accountSessionAmounts
} from './accountPnl'
import type { ClosedTrade } from './paperTrade'

function trade(overrides: Partial<ClosedTrade> = {}): ClosedTrade {
  return {
    id: 't-1',
    side: 'long',
    entryPrice: 100,
    entryTime: 1000,
    exitPrice: 101,
    exitTime: 2000,
    lots: 1,
    pnl: 10,
    exitReason: 'manual',
    takeProfit: null,
    stopLoss: null,
    ...overrides
  }
}

describe('accountPnlValue', () => {
  it('keeps USD-quoted P/L in USD', () => {
    expect(accountPnlValue(25, 'EURUSD', 1.1)).toEqual({
      value: 25,
      currency: 'USD',
      converted: true
    })
  })

  it('converts USD-base quote P/L to USD at the exit price', () => {
    expect(accountPnlValue(1500, 'USDJPY', 150)).toEqual({
      value: 10,
      currency: 'USD',
      converted: true
    })
  })

  it('falls back to the quote currency for a true cross', () => {
    expect(accountPnlValue(25, 'EURGBP', 0.85)).toEqual({
      value: 25,
      currency: 'GBP',
      converted: false
    })
  })

  it('falls back when the rate is unavailable', () => {
    expect(accountPnlValue(25, 'USDJPY', null)).toEqual({
      value: 25,
      currency: 'JPY',
      converted: false
    })
  })
})

describe('accountSessionAmounts', () => {
  it('converts realized and open P/L for a USD-base pair', () => {
    const amounts = accountSessionAmounts(
      'USDJPY',
      [trade({ pnl: 1500, exitPrice: 150 }), trade({ pnl: -300, exitPrice: 150 })],
      1200,
      150,
      150
    )
    expect(amounts.realized).toEqual({ value: 8, currency: 'USD', converted: true })
    expect(amounts.open).toEqual({ value: 1, currency: 'USD', converted: true })
    expect(amounts.total).toEqual({ value: 9, currency: 'USD', converted: true })
  })

  it('keeps totals in the quote currency when a leg cannot be converted', () => {
    const amounts = accountSessionAmounts(
      'EURGBP',
      [trade({ pnl: 25, exitPrice: 0.85 })],
      25,
      5,
      0.86
    )
    expect(amounts.realized).toEqual({ value: 25, currency: 'GBP', converted: false })
    expect(amounts.open).toEqual({ value: 5, currency: 'GBP', converted: false })
    expect(amounts.total).toEqual({ value: 30, currency: 'GBP', converted: false })
  })
})

describe('accountBalance', () => {
  it('adds USD realized P/L to the USD starting balance', () => {
    expect(
      accountBalance(100000, { value: 8, currency: 'USD', converted: true })
    ).toEqual({ value: 100008, currency: 'USD', converted: true })
  })

  it('is unavailable when realized P/L is not in USD', () => {
    expect(
      accountBalance(100000, { value: 25, currency: 'GBP', converted: false })
    ).toEqual({ value: null, currency: 'USD', converted: false })
  })
})

describe('accountClosedTradePnl', () => {
  it('uses the trade exit price for the conversion', () => {
    expect(accountClosedTradePnl(trade({ pnl: 1500, exitPrice: 150 }), 'USDJPY')).toEqual({
      value: 10,
      currency: 'USD',
      converted: true
    })
  })
})
