import type {
  ExitReason,
  HistoricOrderStatus,
  HistoricOrderType,
  PositionSide
} from '@/lib/paperTrade'
import { formatTradeSizeForSymbol, resolvedLots } from '@/lib/paperTrade'
import { tradeSizeKindForSymbol } from '@shared/pricePrecision'
import { useLocaleStore } from '@/i18n/localeStore'

/** Localized exit-reason badge (TP / SL / EXIT / Manual). */
export function exitReasonLabel(reason: ExitReason | undefined): string {
  const t = useLocaleStore.getState().t
  switch (reason) {
    case 'tp':
      return t('trade.exitTp')
    case 'sl':
      return t('trade.exitSl')
    case 'session_exit':
      return t('trade.exitSession')
    case 'manual':
    default:
      return t('trade.exitManual')
  }
}

/** Localized position size: `1.00 lot` / `1.00 手`, or bare coin amount. */
export function positionSizeLabel(lots: number | null | undefined, symbol: string): string {
  const t = useLocaleStore.getState().t
  const size = formatTradeSizeForSymbol(resolvedLots(lots), symbol)
  return tradeSizeKindForSymbol(symbol) === 'lot' ? t('trade.lot', { size }) : size
}

export function orderSideLabel(side: PositionSide, type: HistoricOrderType): string {
  const t = useLocaleStore.getState().t
  if (type === 'stopLimit') return side === 'long' ? t('trade.buyStopLimit') : t('trade.sellStopLimit')
  if (type === 'limit') return side === 'long' ? t('trade.buyLimit') : t('trade.sellLimit')
  return side === 'long' ? t('trade.buy') : t('trade.sell')
}

export function orderStatusLabel(status: HistoricOrderStatus): string {
  const t = useLocaleStore.getState().t
  return status === 'canceled' ? t('trade.canceled') : t('trade.filled')
}

export function sideWord(side: 'long' | 'short'): string {
  const t = useLocaleStore.getState().t
  return side === 'long' ? t('trade.sideLong') : t('trade.sideShort')
}

export function sideLetter(side: 'long' | 'short', kind: 'entry' | 'exit'): string {
  const t = useLocaleStore.getState().t
  if (kind === 'entry') return side === 'long' ? t('trade.sideB') : t('trade.sideS')
  return side === 'long' ? t('trade.sideS') : t('trade.sideB')
}
