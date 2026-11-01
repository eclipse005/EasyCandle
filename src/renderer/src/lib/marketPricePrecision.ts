import type { ImportedDatasetMeta } from '@shared/importTypes'
import {
  clampPricePrecision,
  resolvePricePrecision,
  type OhlcLike
} from '@shared/pricePrecision'

/**
 * Decimals present in the imported quotes. Chart-derived prices snap to this;
 * the display precision may pad zeros beyond it but never invent digits.
 */
export function marketPricePrecisionFor(
  symbol: string,
  meta: ImportedDatasetMeta | null | undefined,
  candles?: readonly OhlcLike[] | null
): number {
  const stored = meta?.pricePrecision
  if (stored != null && Number.isFinite(stored)) return clampPricePrecision(stored)
  return resolvePricePrecision(symbol, candles)
}
