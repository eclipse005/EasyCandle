import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  clampTradeSize,
  formatTradeSize,
  MAX_LOT_SIZE,
  MIN_CRYPTO_SIZE,
  MIN_LOT_SIZE
} from '@/lib/paperTrade'
import { tradeSizeKindForSymbol } from '@shared/pricePrecision'
import { useReplayStore, selectPriceFollowCandle } from '@/store/replayStore'

/**
 * FX Replay–style chart overlay: instant Buy (primary blue) / Sell (red) + qty.
 * Places market orders via paperBuy / paperSell using the shared tradeSize.
 */
export default function ChartInstantTrade() {
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

  if (mode !== 'replay') return null

  const busy = replayLoading || replayStatus === 'ended' || !currentCandle
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
    <div
      className="pointer-events-auto absolute bottom-7 left-2 z-20 flex items-center gap-1 rounded-xl border border-white/10 bg-zinc-900/95 p-1 shadow-lg shadow-black/30 backdrop-blur-sm"
      data-tour="chart-instant-trade"
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => paperBuy()}
        className="inline-flex h-7 min-w-[3.25rem] items-center justify-center rounded-lg px-2.5 text-xs font-semibold text-white transition-colors bg-primary-500 hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Buy
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => paperSell()}
        className="inline-flex h-7 min-w-[3.25rem] items-center justify-center rounded-lg px-2.5 text-xs font-semibold text-white transition-colors bg-red-400 hover:bg-red-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Sell
      </button>
      <label className="flex h-7 items-center rounded-xl border border-zinc-800 bg-zinc-950 px-1.5">
        <span className="sr-only">Order size</span>
        <input
          type="text"
          inputMode="decimal"
          disabled={busy}
          value={draft}
          aria-label="Order size"
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
          className="h-full w-12 bg-transparent text-center text-xs font-semibold tabular-nums text-zinc-100 outline-none disabled:opacity-40"
        />
      </label>
    </div>
  )
}
