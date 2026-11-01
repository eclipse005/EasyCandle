import { useMemo } from 'react'
import { useReplayStore } from '@/store/replayStore'
import { marketPricePrecisionFor } from '@/lib/marketPricePrecision'

/** Decimals of the imported quotes, independent of the display precision. */
export function useMarketPricePrecision(): number {
  const symbol = useReplayStore((s) => s.symbol)
  const importMeta = useReplayStore((s) => s.importMeta)
  const candles = useReplayStore((s) => s.candles)
  return useMemo(
    () => marketPricePrecisionFor(symbol, importMeta, candles),
    [symbol, importMeta, candles]
  )
}
