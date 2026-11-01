import { useEffect, useRef, useState, type ReactNode } from 'react'
import { forexSessionDayOpen } from '@shared/forexSession'
import { formatTradeSizeForSymbol, pendingKindForEntry } from '@/lib/paperTrade'
import { useReplayStore } from '@/store/replayStore'
import { useDrawingUiStore } from '@/store/drawingUiStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { useT } from '@/i18n/useT'
import type { MessageKey } from '@/i18n/messages'
import * as bridge from '@/lib/drawings/drawingBridge'
import {
  applySavedTemplate,
  bringDrawingToFront,
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
  const { t } = useT()
  const rootRef = useRef<HTMLDivElement>(null)
  const mode = useReplayStore((s) => s.mode)
  const currentClose = useReplayStore((s) => s.currentCandle?.close ?? null)
  const tradeSize = useReplayStore((s) => s.tradeSize)
  const symbol = useReplayStore((s) => s.symbol)
  const indicatorCount = useReplayStore((s) => s.activeIndicators.length)
  const placeLimit = useReplayStore((s) => s.placeLimit)
  const paperBuy = useReplayStore((s) => s.paperBuy)
  const paperSell = useReplayStore((s) => s.paperSell)
  const jumpToTime = useReplayStore((s) => s.jumpToTime)
  const setChartSettingsDialogOpen = useUiLayoutStore((s) => s.setChartSettingsDialogOpen)
  const openObjectDialog = useDrawingUiStore((s) => s.openObjectDialog)
  const setDrawingsVisible = useDrawingUiStore((s) => s.setDrawingsVisible)
  const drawingsVisible = useDrawingUiStore((s) => s.drawingsVisible)
  const [orderOpen, setOrderOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const rightDock = useUiLayoutStore((s) => s.rightDock)
  const setRightDock = useUiLayoutStore((s) => s.setRightDock)
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

  function orderKind(side: 'buy' | 'sell'): 'market' | 'limit' | 'stop' {
    if (atMarket) return 'market'
    const stop = above ? side === 'buy' : side !== 'buy'
    return stop ? 'stop' : 'limit'
  }

  function orderLabel(side: 'buy' | 'sell'): string {
    const kind = orderKind(side)
    const kindKey: Record<typeof kind, MessageKey> = {
      market: 'context.orderKind.market',
      limit: 'context.orderKind.limit',
      stop: 'context.orderKind.stop'
    }
    return t(side === 'buy' ? 'context.orderBuy' : 'context.orderSell', {
      size: sizeText,
      price: priceText,
      kind: t(kindKey[kind])
    })
  }

  function placeFromMenu(side: 'buy' | 'sell'): void {
    if (mode !== 'replay') return
    if (atMarket) {
      if (side === 'buy') paperBuy()
      else paperSell()
      onClose()
      return
    }
    const marketSide = side === 'buy' ? 'long' : 'short'
    const mark = currentPrice ?? point.price
    const kind = pendingKindForEntry(marketSide, mark, point.price)
    if (!kind) return
    placeLimit(marketSide, point.price, kind)
    onClose()
  }

  const sessionDayOpen = point.time == null ? null : forexSessionDayOpen(point.time)

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
      {mode === 'replay' ? (
        <MenuItem
          label={t('context.replayToDate')}
          disabled={sessionDayOpen == null}
          onSelect={() => {
            if (sessionDayOpen == null) return
            void jumpToTime(sessionDayOpen, { source: 'replay-to' })
            onClose()
          }}
        />
      ) : null}
      {mode === 'replay' ? (
        <>
          <MenuItem label={orderLabel('buy')} onSelect={() => placeFromMenu('buy')} />
          <MenuItem label={orderLabel('sell')} onSelect={() => placeFromMenu('sell')} />
        </>
      ) : null}
      <Divider />
      <MenuItem
        label={t('context.resetChartView')}
        onSelect={() => {
          fitPrimaryChart()
          onClose()
        }}
      />
      <MenuItem
        label={t('context.moveToLastCandle')}
        onSelect={() => {
          focusPrimaryLatest()
          onClose()
        }}
      />
      <MenuItem
        label={t('context.copyPrice', { price: priceText })}
        onSelect={() => {
          void navigator.clipboard.writeText(String(point.price)).catch(() => {})
          onClose()
        }}
      />
      <MenuItem
        label={t('context.paste')}
        hint="Ctrl+V"
        disabled={!hasDrawingClipboard()}
        onSelect={() => {
          pasteDrawing()
          onClose()
        }}
      />
      <Divider />
      <MenuItem
        label={t('context.tableView')}
        onSelect={() => {
          setRightDock('objects')
          onClose()
        }}
      />
      <MenuItem
        label={t('context.hideObjectTree')}
        disabled={rightDock !== 'objects'}
        onSelect={() => {
          setRightDock(null)
          onClose()
        }}
      />
      <MenuItem
        label={tradeMarksVisible ? t('context.hideMarks') : t('context.showMarks')}
        onSelect={() => {
          setTradeMarksVisible(!tradeMarksVisible)
          onClose()
        }}
      />
      <MenuItem
        label={drawingsVisible ? t('context.hideAllDrawings') : t('context.showAllDrawings')}
        onSelect={() => {
          setDrawingsVisible(!drawingsVisible)
          onClose()
        }}
      />
      <MenuItem
        label={t('context.removeIndicators', {
          count: indicatorCount,
          suffix: indicatorCount === 1 ? '' : 's'
        })}
        disabled={indicatorCount === 0}
        onSelect={() => {
          useReplayStore.setState({ activeIndicators: [] })
          onClose()
        }}
      />
      <Divider />
      <MenuItem
        label={t('context.settings')}
        onSelect={() => {
          setChartSettingsDialogOpen(true)
          onClose()
        }}
      />
    </div>
  )
}
