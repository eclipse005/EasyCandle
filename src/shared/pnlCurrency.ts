/**
 * P/L currency semantics (upstream issue #51).
 *
 * P/L is always computed in the instrument's quote (profit) currency first.
 * Conversion to the account currency (default USD) happens only when the same
 * chart series can provide the rate at the exit timestamp:
 *  - quote === account currency          → rate 1 (EURUSD, XAUUSD, BTCUSDT→USDT kept as-is)
 *  - base === account currency (USD/XXX) → 1 quote unit = 1/exitPrice USD (USDJPY: JPY P/L ÷ exit)
 *  - anything else (true crosses)        → unavailable; never fabricate a USD figure.
 */

import { contractSizeInfoForSymbol, normalizeSymbolKey } from './pricePrecision'

/** Account currency all P/L totals target. Fixed until a setting exists. */
export const ACCOUNT_CURRENCY = 'USD'

/**
 * Quote (profit) currency from the symbol name: `USDJPY`→JPY, `EURUSD`→USD,
 * `XAUUSD`→USD, and crypto/indices take the whole tail (`BTCUSDT`→USDT,
 * `ETHBTC`→BTC, `SPXUSD`→USD).
 */
export function quoteCurrencyForSymbol(symbol: string): string {
  const key = normalizeSymbolKey(symbol)
  if (key.length < 6) return ACCOUNT_CURRENCY
  // Crypto and non-FX instruments trade against the full tail after the base.
  if (contractSizeInfoForSymbol(key).kind === 'unit') return key.slice(3)
  return key.slice(3, 6)
}

/**
 * Rate that converts an amount in the symbol's quote currency into the account
 * currency, using the exit price of this chart. `null` when the same series
 * cannot provide it (true cross) — callers must not fabricate a figure.
 */
export function accountRateForSymbol(
  symbol: string,
  exitPrice: number,
  accountCurrency: string = ACCOUNT_CURRENCY
): number | null {
  if (!Number.isFinite(exitPrice) || exitPrice <= 0) return null
  const key = normalizeSymbolKey(symbol)
  const quote = key.length >= 6 ? key.slice(3, 6) : ACCOUNT_CURRENCY
  const base = key.length >= 6 ? key.slice(0, 3) : ''
  const account = normalizeSymbolKey(accountCurrency) || ACCOUNT_CURRENCY
  if (quote === account) return 1
  if (base === account) return 1 / exitPrice
  return null
}

/** Quote-currency P/L → account-currency P/L, or `null` when not convertible. */
export function accountPnlFromQuote(
  quotePnl: number,
  symbol: string,
  exitPrice: number,
  accountCurrency: string = ACCOUNT_CURRENCY
): number | null {
  if (!Number.isFinite(quotePnl)) return null
  const rate = accountRateForSymbol(symbol, exitPrice, accountCurrency)
  if (rate == null) return null
  return quotePnl * rate
}

/** `+ 12.50 USD` / `- 3,500.25 JPY` — the quote currency is always labeled. */
export function formatPnlCcy(pnl: number | null | undefined, currency: string): string {
  if (pnl == null || !Number.isFinite(pnl)) return `— ${currency}`
  const abs = Math.abs(pnl).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
  if (pnl > 0) return `+ ${abs} ${currency}`
  if (pnl < 0) return `- ${abs} ${currency}`
  return `0.00 ${currency}`
}
