import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  clampTradeSize,
  formatTradeSize,
  MAX_LOT_SIZE,
  MIN_CRYPTO_SIZE,
  MIN_LOT_SIZE
} from '@/lib/paperTrade'
import { tradeSizeKindForSymbol } from '@shared/pricePrecision'
import { useT } from '@/i18n/useT'
import { useReplayStore, selectPriceFollowCandle } from '@/store/replayStore'

/**
 * Bottom-bar instant Buy / Sell + size. Places market orders via paperBuy / paperSell.
 */
export default function ChartInstantTrade() {
  const { t } = useT()
  const mode = useReplayStore((s) => s.mode)
  const replayStatus = useReplayStore((s) => s.replayStatus)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const currentCandle = useReplayStore(selectPriceFollowCandle)
  const tradeSize = useReplayStore((s) => s.tradeSize)
  const setTradeSize = useReplayStore((s) => s.setTradeSize)
  const paperBuy = useReplayStore((s) => s.paperBuy)
  const paperSell = useReplayStore((s) => s.paperSell)
  const symbol = useReplayStore((s) => s.symbol)

  const kind = tradeSizeKindForSymbol(symbol)
  const display = formatTradeSize(tradeSize, kind)
  const [draft, setDraft] = useState(display)
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) setDraft(display)
  }, [display])

  const busy = mode !== 'replay' || replayLoading || replayStatus === 'ended' || !currentCandle
  const atMin = kind === 'lot' ? tradeSize <= MIN_LOT_SIZE : tradeSize <= MIN_CRYPTO_SIZE
  const atMax = kind === 'lot' && tradeSize >= MAX_LOT_SIZE

  function commit(raw: string): void {
    const parsed = Number(String(raw).trim().replace(',', '.'))
    if (!Number.isFinite(parsed)) {
      setDraft(display)
      return
    }
    const next = clampTradeSize(parsed, kind)
    setTradeSize(next)
    setDraft(formatTradeSize(next, kind))
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
      return
    }
    if (event.key === 'Escape') {
      setDraft(display)
      event.currentTarget.blur()
    }
  }

  return (
    <div className="flex items-center gap-1.5" data-tour="chart-instant-trade">
      <button
        type="button"
        disabled={busy}
        onClick={() => paperBuy()}
        className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary-500 px-3 text-sm font-semibold text-white transition-colors hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        {t('trades.buy')}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => paperSell()}
        className="inline-flex h-8 items-center gap-1 rounded-lg bg-rose-400 px-3 text-sm font-semibold text-white transition-colors hover:bg-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />
        {t('trades.sell')}
      </button>
      <label className="flex h-8 items-center rounded-lg border border-white/10 bg-zinc-950 px-1.5">
        <span className="sr-only">{t('blotter.size')}</span>
        <input
          type="text"
          inputMode="decimal"
          disabled={busy}
          value={draft}
          aria-label={t('blotter.size')}
          title={atMin || atMax ? 'Size limits apply' : 'Lots / amount for market Buy or Sell'}
          onFocus={() => {
            focusedRef.current = true
          }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => {
            focusedRef.current = false
            commit(event.target.value)
          }}
          onKeyDown={onKeyDown}
          className="h-full w-14 bg-transparent text-center text-sm font-semibold tabular-nums text-zinc-100 outline-none disabled:opacity-40"
        />
      </label>
    </div>
  )
}
