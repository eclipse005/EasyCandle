import type { Candle } from './candleUtils'
import { IMPORT_STORED_TIMEFRAMES } from './candleAggregate'
import type { ImportedDatasetMeta, ImportedTimeframeStats, ImportOrigin } from './importTypes'
import { clampPricePrecision, inferPrecisionFromPrices, precisionForSymbol } from './pricePrecision'
import { DEFAULT_TIMEFRAME } from './timeframes'

/** Quote decimals of the stored series, sampled across the whole import. */
export function importedPricePrecision(symbol: string, candles1m: readonly Candle[]): number {
  const step = Math.max(1, Math.floor(candles1m.length / 1000))
  const prices: number[] = []
  for (let i = 0; i < candles1m.length; i += step) {
    const candle = candles1m[i]
    prices.push(candle.open, candle.high, candle.low, candle.close)
  }
  const inferred = inferPrecisionFromPrices(prices)
  const convention = precisionForSymbol(symbol) ?? 0
  return clampPricePrecision(Math.max(inferred, convention))
}

export function statsForImportedSeries(candles: Candle[]): ImportedTimeframeStats {
  const first = candles[0]
  const last = candles[candles.length - 1]
  return {
    candleCount: candles.length,
    firstTime: first?.time ?? 0,
    lastTime: last?.time ?? 0
  }
}

export function buildImportedDatasetMeta(params: {
  id: string
  originalFileName: string
  symbol: string
  candlesByTimeframe: Record<string, Candle[]>
  activeTimeframe?: string
  createdAt?: string
  origin?: ImportOrigin
  contractSize?: number
}): ImportedDatasetMeta {
  const now = new Date().toISOString()
  const candles1m = params.candlesByTimeframe['1m'] || []
  const timeframes: Record<string, ImportedTimeframeStats> = {}

  for (const tf of IMPORT_STORED_TIMEFRAMES) {
    const series = params.candlesByTimeframe[tf]
    if (series?.length) timeframes[tf] = statsForImportedSeries(series)
  }

  const preferred =
    params.activeTimeframe && timeframes[params.activeTimeframe]
      ? params.activeTimeframe
      : timeframes[DEFAULT_TIMEFRAME]
        ? DEFAULT_TIMEFRAME
        : '1m'

  const primary = statsForImportedSeries(candles1m)

  return {
    id: params.id,
    symbol: params.symbol,
    sourceTimeframe: '1m',
    timeframe: preferred,
    originalFileName: params.originalFileName,
    candleCount: primary.candleCount,
    firstTime: primary.firstTime,
    lastTime: primary.lastTime,
    timeframes,
    pricePrecision: importedPricePrecision(params.symbol, candles1m),
    createdAt: params.createdAt ?? now,
    updatedAt: now,
    ...(params.origin ? { origin: params.origin } : {}),
    ...(params.contractSize != null && params.contractSize > 0
      ? { contractSize: params.contractSize }
      : {})
  }
}
