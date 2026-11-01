import { Clock3 } from 'lucide-react'
import { TIMEFRAME_IDS, TIMEFRAMES } from '@shared/timeframes'

type PaneChromeProps = {
  label: string
  timeframe: string
  timeframeEditable?: boolean
  timeframeDisabled?: boolean
  timeframeTitle?: string
  onTimeframeChange?: (timeframe: string) => void
  /** @deprecated Shared Timestep replaced pane drivers; ignored. */
  showDriver?: boolean
  isDriver?: boolean
  onSelectDriver?: () => void
  driverDisabled?: boolean
}

export default function PaneChrome({
  label,
  timeframe,
  timeframeEditable = false,
  timeframeDisabled = false,
  timeframeTitle,
  onTimeframeChange
}: PaneChromeProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 border-b border-b-zinc-800 z-[2] flex items-center justify-between gap-2 bg-gradient-to-b from-zinc-950/90 to-transparent px-2 py-1.5">
      <div className="pointer-events-auto flex min-w-0 items-center gap-1.5">
        <span className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
          {label}
        </span>
        {timeframeEditable && onTimeframeChange ? (
          <label className="flex h-6 items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900/90 px-1.5 text-[11px] text-zinc-400">
            <Clock3 className="h-3 w-3 shrink-0 text-zinc-500" aria-hidden />
            <span className="sr-only">{label} timeframe</span>
            <select
              className="rounded bg-zinc-900 text-zinc-100 outline-none disabled:opacity-60"
              value={timeframe}
              disabled={timeframeDisabled}
              title={timeframeTitle}
              aria-label={`${label} timeframe`}
              onChange={(event) => onTimeframeChange(event.target.value)}
            >
              {TIMEFRAME_IDS.map((id) => (
                <option key={id} value={id} className="bg-zinc-900 text-zinc-100">
                  {TIMEFRAMES[id].label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-1.5 py-0.5 text-[11px] text-zinc-400">
            {TIMEFRAMES[timeframe]?.label ?? timeframe}
          </span>
        )}
      </div>
    </div>
  )
}
