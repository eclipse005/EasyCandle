import {
  ACCOUNT_CURRENCY,
  accountPnlFromQuote,
  formatPnlCcy,
  quoteCurrencyForSymbol
} from '@shared/pnlCurrency'
import type { ClosedTrade } from '@/lib/paperTrade'

/**
 * A money amount that is in the account currency when the chart can provide
 * the quote→USD rate, otherwise in the instrument's quote currency.
 */
export type AccountValue = {
  value: number | null
  currency: string
  converted: boolean
}

export function formatAccountValue(amount: AccountValue): string {
  return formatPnlCcy(amount.value, amount.currency)
}

export function accountPnlValue(
  quotePnl: number | null | undefined,
  symbol: string,
  price: number | null | undefined
): AccountValue {
  const quoteCurrency = quoteCurrencyForSymbol(symbol)
  if (quotePnl == null || !Number.isFinite(quotePnl)) {
    return { value: null, currency: quoteCurrency, converted: false }
  }
  if (price == null || !Number.isFinite(price)) {
    return { value: quotePnl, currency: quoteCurrency, converted: false }
  }
  const usd = accountPnlFromQuote(quotePnl, symbol, price)
  if (usd != null) return { value: usd, currency: ACCOUNT_CURRENCY, converted: true }
  return { value: quotePnl, currency: quoteCurrency, converted: false }
}

export function accountClosedTradePnl(trade: ClosedTrade, symbol: string): AccountValue {
  return accountPnlValue(trade.pnl, symbol, trade.exitPrice)
}

export function accountCommission(trade: ClosedTrade, symbol: string): AccountValue {
  return accountPnlValue(trade.commission ?? 0, symbol, trade.exitPrice)
}

export type AccountSessionAmounts = {
  realized: AccountValue
  open: AccountValue
  total: AccountValue
}

/**
 * Session totals in USD when every exit price can supply the rate. A true
 * cross cannot be converted from its own series, so those totals stay in the
 * quote currency and are labelled as such.
 */
export function accountSessionAmounts(
  symbol: string,
  closedTrades: ClosedTrade[],
  quoteRealized: number,
  quoteOpen: number | null,
  mark: number | null | undefined
): AccountSessionAmounts {
  const quoteCurrency = quoteCurrencyForSymbol(symbol)
  let realizedUsd: number | null = 0
  for (const trade of closedTrades) {
    const usd = accountPnlFromQuote(trade.pnl, symbol, trade.exitPrice)
    if (usd == null) {
      realizedUsd = null
      break
    }
    realizedUsd += usd
  }

  const realized: AccountValue =
    realizedUsd != null
      ? { value: realizedUsd, currency: ACCOUNT_CURRENCY, converted: true }
      : { value: quoteRealized, currency: quoteCurrency, converted: false }
  const open = accountPnlValue(quoteOpen, symbol, mark)

  let total: AccountValue
  if (realized.converted && open.converted) {
    total = {
      value: (realized.value ?? 0) + (open.value ?? 0),
      currency: ACCOUNT_CURRENCY,
      converted: true
    }
  } else if (
    !realized.converted &&
    !open.converted &&
    realized.currency === open.currency
  ) {
    total = {
      value: (realized.value ?? 0) + (open.value ?? 0),
      currency: realized.currency,
      converted: false
    }
  } else {
    total = {
      value: quoteRealized + (quoteOpen ?? 0),
      currency: quoteCurrency,
      converted: false
    }
  }

  return { realized, open, total }
}

/** USD account balance. Unavailable when realized P/L could not be converted. */
export function accountBalance(
  startingBalance: number | null | undefined,
  realized: AccountValue
): AccountValue {
  if (
    startingBalance == null ||
    !Number.isFinite(startingBalance) ||
    realized.value == null ||
    realized.currency !== ACCOUNT_CURRENCY
  ) {
    return { value: null, currency: ACCOUNT_CURRENCY, converted: false }
  }
  return {
    value: startingBalance + realized.value,
    currency: ACCOUNT_CURRENCY,
    converted: true
  }
}
