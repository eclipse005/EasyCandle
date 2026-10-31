import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatTradeSizeForSymbol, pendingKindForEntry } from '@/lib/paperTrade'
import { useReplayStore } from '@/store/replayStore'
import { useDrawingUiStore } from '@/store/drawingUiStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import * as bridge from '@/lib/drawings/drawingBridge'
import {
  applySavedTemplate,
  bringDrawingToFront,
  clearAllDrawings,
  cloneDrawing,
  copyDrawing,
  hasDrawingClipboard,
  listPresetsForDrawing,
  pasteDrawing,
  removeDrawing,
  resetDrawingStyle,
  saveTemplateAs,
  sendDrawingToBack,
  setDrawingHidden,
  setDrawingLocked
} from '@/lib/drawings/drawingActions'
import { fitPrimaryChart, focusPrimaryLatest } from '@/lib/chart/chartViewBridge'

export type ContextMenuPoint = {
  x: number
  y: number
  price: number
  time: number | null
  /** When set, this is a drawing-object RMB (FXR inventory). */
  drawingId?: string | null
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

function Divider(): ReactNode {
  return <div className="my-1 h-px bg-zinc-800" />
}

/**
 * Right-click menu on the chart (FX Replay style).
 * Empty chart: replay / trade / view / drawings / settings.
 * Drawing hit: Settings, Copy, Clone, Visual order, Delete, Hide, Lock.
 */
export default function ChartContextMenu({
  point,
  pricePrecision,
  onClose
}: ChartContextMenuProps): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null)
  const mode = useReplayStore((s) => s.mode)
  const currentClose = useReplayStore((s) => s.currentCandle?.close ?? null)
  const tradeSize = useReplayStore((s) => s.tradeSize)
  const symbol = useReplayStore((s) => s.symbol)
  const setTicketOrderType = useReplayStore((s) => s.setTicketOrderType)
  const setTicketLimitPrice = useReplayStore((s) => s.setTicketLimitPrice)
  const jumpToTime = useReplayStore((s) => s.jumpToTime)
  const placeLimit = useReplayStore((s) => s.placeLimit)
  const paperBuy = useReplayStore((s) => s.paperBuy)
  const paperSell = useReplayStore((s) => s.paperSell)
  const setChartSettingsDialogOpen = useUiLayoutStore((s) => s.setChartSettingsDialogOpen)
  const openObjectDialog = useDrawingUiStore((s) => s.openObjectDialog)
  const setDrawingsVisible = useDrawingUiStore((s) => s.setDrawingsVisible)
  const drawingsVisible = useDrawingUiStore((s) => s.drawingsVisible)
  const [orderOpen, setOrderOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const setObjectTreeOpen = useDrawingUiStore((s) => s.setObjectTreeOpen)
  const tradeMarksVisible = useUiLayoutStore((s) => s.tradeMarksVisible)
  const setTradeMarksVisible = useUiLayoutStore((s) => s.setTradeMarksVisible)

  const priceText = point.price.toFixed(pricePrecision)
  const sizeText = formatTradeSizeForSymbol(tradeSize, symbol)
  const currentPrice = useReplayStore.getState().currentCandle?.close ?? currentClose
  const above = currentPrice != null && point.price > currentPrice
  const atMarket =
    currentPrice != null &&
    Number.isFinite(currentPrice) &&
    Math.abs(point.price - currentPrice) < Math.pow(10, -(pricePrecision + 1))

  const drawingId = point.drawingId ?? null
  const drawing = drawingId ? bridge.getPrimary()?.get(drawingId) : undefined

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

  function kindLabel(side: 'buy' | 'sell'): string {
    if (atMarket) return 'market'
    const stop = above ? side === 'buy' : side !== 'buy'
    return stop ? 'stop' : 'limit'
  }

  function placeInstant(side: 'buy' | 'sell'): void {
    if (mode !== 'replay') return
    if (atMarket) {
      if (side === 'buy') paperBuy()
      else paperSell()
      onClose()
      return
    }
    const marketSide = side === 'buy' ? 'long' : 'short'
    const mark = currentPrice ?? point.price
    const kind = pendingKindForEntry(marketSide, mark, point.price) ?? undefined
    placeLimit(marketSide, point.price, kind)
    onClose()
  }

  function prefill(side: 'buy' | 'sell'): void {
    const stop = above ? side === 'buy' : side !== 'buy'
    setTicketOrderType(stop ? 'stopLimit' : 'limit')
    setTicketLimitPrice(point.price)
    onClose()
  }

  if (drawing && drawingId) {
    return (
      <div
        ref={rootRef}
        role="menu"
        style={{ left: point.x, top: point.y }}
        className="absolute z-[60] min-w-[14rem] rounded-2xl border border-white/10 bg-zinc-950/95 py-1.5 shadow-xl shadow-black/40 backdrop-blur-sm"
      >
        <MenuItem
          label="Settings"
          onSelect={() => {
            bridge.getPrimary()?.select([drawingId])
            openObjectDialog(drawingId)
            onClose()
          }}
        />
        <MenuItem
          label="Copy"
          hint="Ctrl+C"
          onSelect={() => {
            copyDrawing(drawingId)
            onClose()
          }}
        />
        <MenuItem
          label="Clone"
          hint="Ctrl+D"
          onSelect={() => {
            cloneDrawing(drawingId)
            onClose()
          }}
        />
        <div className="relative">
          <MenuItem label="Visual order" hint="▸" onSelect={() => setOrderOpen((v) => !v)} />
          {orderOpen && (
            <div className="mx-1 mb-1 rounded-xl border border-zinc-800 bg-zinc-900 py-1">
              <MenuItem
                label="Bring to front"
                onSelect={() => {
                  bringDrawingToFront(drawingId)
                  onClose()
                }}
              />
              <MenuItem
                label="Send to back"
                onSelect={() => {
                  sendDrawingToBack(drawingId)
                  onClose()
                }}
              />
            </div>
          )}
        </div>
        <div className="relative">
          <MenuItem label="Templates" hint="▸" onSelect={() => setTemplatesOpen((v) => !v)} />
          {templatesOpen && (
            <div className="mx-1 mb-1 rounded-xl border border-zinc-800 bg-zinc-900 py-1">
              <MenuItem
                label="Save as…"
                onSelect={() => {
                  const name = window.prompt('Template name')
                  if (name && name.trim()) saveTemplateAs(drawingId, name.trim())
                  onClose()
                }}
              />
              <MenuItem
                label="Reset style"
                onSelect={() => {
                  resetDrawingStyle(drawingId)
                  onClose()
                }}
              />
              {listPresetsForDrawing(drawingId).map((preset) => (
                <MenuItem
                  key={preset.id}
                  label={preset.name}
                  onSelect={() => {
                    applySavedTemplate(drawingId, preset.id)
                    onClose()
                  }}
                />
              ))}
            </div>
          )}
        </div>
        <Divider />
        <MenuItem
          label="Delete"
          hint="Del"
          onSelect={() => {
            removeDrawing(drawingId)
            onClose()
          }}
        />
        <MenuItem
          label="Hide"
          onSelect={() => {
            setDrawingHidden(drawingId, true)
            onClose()
          }}
        />
        <MenuItem
          label={drawing.locked ? 'Unlock' : 'Lock'}
          onSelect={() => {
            setDrawingLocked(drawingId, !drawing.locked)
            onClose()
          }}
        />
      </div>
    )
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
          label="Replay to this candle"
          onSelect={() => {
            void jumpToTime(point.time ?? 0)
            onClose()
          }}
        />
      ) : null}
      {mode === 'replay' ? (
        <>
          <MenuItem
            label={`Buy ${sizeText} @ ${priceText} ${kindLabel('buy')}`}
            hint="Instant"
            onSelect={() => placeInstant('buy')}
          />
          <MenuItem
            label={`Sell ${sizeText} @ ${priceText} ${kindLabel('sell')}`}
            hint="Instant"
            onSelect={() => placeInstant('sell')}
          />
          <MenuItem
            label={`Prefill Buy ticket @ ${priceText}`}
            onSelect={() => prefill('buy')}
          />
          <MenuItem
            label={`Prefill Sell ticket @ ${priceText}`}
            onSelect={() => prefill('sell')}
          />
        </>
      ) : null}
      <Divider />
      <MenuItem
        label="Reset view"
        onSelect={() => {
          fitPrimaryChart()
          onClose()
        }}
      />
      <MenuItem
        label="Move to last candle"
        onSelect={() => {
          focusPrimaryLatest()
          onClose()
        }}
      />
      <MenuItem
        label={`Copy price ${priceText}`}
        onSelect={() => {
          void navigator.clipboard.writeText(String(point.price)).catch(() => {})
          onClose()
        }}
      />
      <MenuItem
        label="Paste drawing"
        hint="Ctrl+V"
        disabled={!hasDrawingClipboard()}
        onSelect={() => {
          pasteDrawing()
          onClose()
        }}
      />
      <Divider />
      <MenuItem
        label={drawingsVisible ? 'Hide drawings' : 'Show drawings'}
        onSelect={() => {
          setDrawingsVisible(!drawingsVisible)
          onClose()
        }}
      />
      <MenuItem
        label="Remove drawings"
        onSelect={() => {
          clearAllDrawings()
          onClose()
        }}
      />
      <MenuItem
        label="Remove indicators"
        onSelect={() => {
          useReplayStore.setState({ activeIndicators: [] })
          onClose()
        }}
      />
      <Divider />
      <MenuItem
        label="Object tree…"
        onSelect={() => {
          setObjectTreeOpen(true)
          onClose()
        }}
      />
      <MenuItem
        label="Table view…"
        onSelect={() => {
          // Same panel — table layout of drawings (FXR empty-RMB parity).
          setObjectTreeOpen(true)
          onClose()
        }}
      />
      <MenuItem
        label={tradeMarksVisible ? 'Hide marks' : 'Show marks'}
        onSelect={() => {
          setTradeMarksVisible(!tradeMarksVisible)
          onClose()
        }}
      />
      <Divider />
      <MenuItem
        label="Settings…"
        onSelect={() => {
          setChartSettingsDialogOpen(true)
          onClose()
        }}
      />
    </div>
  )
}
