import { formatAssetPrice } from '@shared/pricePrecision'
import { useLocaleStore } from '@/i18n/localeStore'
import type { ClosedTrade } from '@/lib/paperTrade'
import { tradeMarkerForExit, tradeMarkerForSide, type TradeMarker } from '@/store/replayStore'

/** Arrow labels for one checked closed trade: entry, then the closing side. */
export function closedTradeArrowMarkers(trade: ClosedTrade, pricePrecision: number): TradeMarker[] {
  const t = useLocaleStore.getState().t
  const entry = tradeMarkerForSide(trade.side, trade.entryTime)
  const exit = tradeMarkerForExit(trade.side, trade.exitTime)
  const entryKey = trade.side === 'long' ? 'trade.markBuy' : 'trade.markSell'
  const exitKey = trade.side === 'long' ? 'trade.markSell' : 'trade.markBuy'
  return [
    {
      ...entry,
      text: t(entryKey, { price: formatAssetPrice(trade.entryPrice, pricePrecision) })
    },
    {
      ...exit,
      text: t(exitKey, { price: formatAssetPrice(trade.exitPrice, pricePrecision) })
    }
  ]
}
