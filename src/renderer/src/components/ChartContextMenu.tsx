import { useEffect, useRef, type ReactNode } from 'react'
import { useReplayStore } from '@/store/replayStore'
import * as bridge from '@/lib/drawings/drawingBridge'
import { useDrawingUiStore } from '@/store/drawingUiStore'

export type ContextMenuPoint = {
  x: number
  y: number
  price: number
  time: number | null
}

type ChartContextMenuProps = {
  point: ContextMenuPoint
  pricePrecision: number
  onClose: () => void
}

function MenuItem({
  label,
  hint,
  disabled,
  onSelect
}: {
  label: string
  hint?: string
  disabled?: boolean
  onSelect: () => void
}): ReactNode {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="flex-1">{label}</span>
      {hint ? <span className="text-[10px] text-zinc-500">{hint}</span> : null}
    </button>
  )
}

/**
 * Right-click menu on the chart (FX Replay style): trade prefill at the
 * clicked price, jump, copy price, and drawing management.
 */
export default function ChartContextMenu({
  point,
  pricePrecision,
  onClose
}: ChartContextMenuProps): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null)
  const mode = useReplayStore((s) => s.mode)
  const currentClose = useReplayStore((s) => s.currentCandle?.close ?? null)
  const setTicketOrderType = useReplayStore((s) => s.setTicketOrderType)
  const setTicketLimitPrice = useReplayStore((s) => s.setTicketLimitPrice)
  const jumpToTime = useReplayStore((s) => s.jumpToTime)
  const priceText = point.price.toFixed(pricePrecision)
  const currentPrice = useReplayStore.getState().currentCandle?.close ?? currentClose
  const above = currentPrice != null && point.price > currentPrice

  useEffect(() => {
    function onPointerDown(event: PointerEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onClose()
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  function prefill(side: 'buy' | 'sell'): void {
    // Above the market a buy fills as stop / a sell as limit; below it inverts.
    const stop = above ? side === 'buy' : side !== 'buy'
    setTicketOrderType(stop ? 'stopLimit' : 'limit')
    setTicketLimitPrice(point.price)
    onClose()
  }

  return (
    <div
      ref={rootRef}
      role="menu"
      style={{ left: point.x, top: point.y }}
      className="absolute z-[60] min-w-[15rem] rounded-2xl border border-white/10 bg-zinc-950/95 py-1.5 shadow-xl shadow-black/40 backdrop-blur-sm"
    >
      {mode === 'replay' && point.time != null ? (
        <MenuItem
          label="Jump to this candle"
          onSelect={() => {
            void jumpToTime(point.time ?? 0)
            onClose()
          }}
        />
      ) : null}
      <MenuItem
        label={`Buy 1 @ ${priceText} ${above ? 'stop' : 'limit'}`}
        onSelect={() => prefill('buy')}
      />
      <MenuItem
        label={`Sell 1 @ ${priceText} ${above ? 'limit' : 'stop'}`}
        onSelect={() => prefill('sell')}
      />
      <div className="my-1 h-px bg-zinc-800" />
      <MenuItem
        label={`Copy price ${priceText}`}
        onSelect={() => {
          void navigator.clipboard.writeText(String(point.price)).catch(() => {})
          onClose()
        }}
      />
      <MenuItem
        label="Remove all drawings"
        onSelect={() => {
          bridge.getPrimary()?.clear()
          useDrawingUiStore.getState().bumpRevision()
          useDrawingUiStore.getState().refreshUndoRedo()
          onClose()
        }}
      />
    </div>
  )
}
