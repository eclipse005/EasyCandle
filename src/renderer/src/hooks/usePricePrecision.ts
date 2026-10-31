import { useMemo } from 'react'
import { resolvePricePrecision } from '@shared/pricePrecision'
import { useReplayStore } from '@/store/replayStore'
import { useSymbolParamsStore } from '@/store/symbolParamsStore'

/**
 * Price-scale digits for the active symbol. A user-managed precision
 * (Dashboard > Symbols) wins; otherwise the FX convention or inferred OHLC.
 */
export function usePricePrecision(): number {
  const symbol = useReplayStore((s) => s.symbol)
  const candles = useReplayStore((s) => s.candles)
  const params = useSymbolParamsStore((s) => s.params)
  return useMemo(() => {
    const key = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const override = params[key]?.precision
    if (override != null && Number.isFinite(override) && override >= 0) {
      return Math.min(8, Math.round(override))
    }
    return resolvePricePrecision(symbol, candles)
  }, [symbol, candles, params])
}
