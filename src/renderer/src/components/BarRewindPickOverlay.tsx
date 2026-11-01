import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react'
import type { IChartApi, Time } from 'lightweight-charts'
import type { Candle } from '@shared/candleUtils'
import { formatAccountDateTime } from '@/lib/displayTime'
import { useChartSettingsStore } from '@/store/chartSettingsStore'

const SCISSORS_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='#3b82f6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='6' cy='6' r='3'/><circle cx='6' cy='18' r='3'/><path d='M20 4 8.12 15.88'/><path d='M14.47 14.48 20 20'/><path d='M8.12 8.12 12 12'/></svg>"
)}") 12 12, crosshair`

type Pick = { x: number; labelX: number; time: number }

/**
 * Full-chart pick surface for replay rewind. Shows a TradingView-style vertical
 * guide and date label; a click hands the bar time back to the caller.
 */
export default function BarRewindPickOverlay({
  chart,
  candles,
  onPick
}: {
  chart: IChartApi
  candles: Candle[]
  onPick: (time: number) => void
}): ReactElement {
  const timezone = useChartSettingsStore((s) => s.timezone)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [hover, setHover] = useState<Pick | null>(null)

  function resolve(clientX: number): Pick | null {
    const el = rootRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const leftScale = chart.priceScale('left').width()
    const paneWidth = chart.timeScale().width()
    const localX = clientX - rect.left
    const paneX = localX - leftScale
    if (paneX < 0 || paneX > paneWidth) return null

    const raw = chart.timeScale().coordinateToTime(paneX)
    let time: number | null = null
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      time = raw
    } else {
      const logical = chart.timeScale().coordinateToLogical(paneX)
      if (logical != null && candles.length > 0) {
        const idx = Math.min(candles.length - 1, Math.max(0, Math.round(Number(logical))))
        const candleTime = candles[idx]?.time
        if (typeof candleTime === 'number' && Number.isFinite(candleTime)) time = candleTime
      }
    }
    if (time == null) return null

    const snapped = chart.timeScale().timeToCoordinate(time as Time)
    const x = leftScale + (snapped ?? paneX)
    const maxLabelX = Math.max(48, rect.width - 48)
    return {
      x,
      labelX: Math.min(Math.max(x, 48), maxLabelX),
      time
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    event.stopPropagation()
    setHover(resolve(event.clientX))
  }

  return (
    <div
      ref={rootRef}
      role="presentation"
      className="absolute inset-0 z-[30] touch-none select-none"
      style={{ cursor: SCISSORS_CURSOR }}
      onPointerMove={onPointerMove}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onPointerLeave={() => setHover(null)}
      onMouseMove={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onClick={(event) => {
        event.stopPropagation()
        const target = resolve(event.clientX)
        if (target) onPick(target.time)
      }}
    >
      {hover ? (
        <>
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-primary-400/90"
            style={{ left: hover.x }}
          />
          <div
            className="pointer-events-none absolute bottom-1 z-[2] -translate-x-1/2 whitespace-nowrap rounded bg-primary-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-lg shadow-black/40"
            style={{ left: hover.labelX }}
          >
            {formatAccountDateTime(hover.time, timezone, { seconds: false })}
          </div>
        </>
      ) : null}
    </div>
  )
}
