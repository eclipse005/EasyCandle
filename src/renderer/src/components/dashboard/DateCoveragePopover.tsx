import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { CalendarDays } from 'lucide-react'
import { coverageSpanLabel } from '@shared/dateCoverage'
import { cn } from '@/components/ui/cn'
import { softFieldClass } from '@/components/ui/SoftInput'
import { softType } from '@/components/ui/softTokens'
import DateCoverageCalendar from '@/components/dashboard/DateCoverageCalendar'

export type DateCoveragePopoverProps = {
  /** UTC day keys `YYYY-MM-DD` that have data. */
  coverageDays: Set<string> | ReadonlySet<string>
  /** Currently selected day (Create Session). */
  selectedDay?: string
  /** When set, clicking a lit day selects it. Read-only when omitted. */
  onSelectDay?: (dayKey: string) => void
  /** Initial visible month as `YYYY-MM` (UTC). */
  initialMonth?: string
  /**
   * `coverage` — manage dialog: show span `first → last` / `No coverage`.
   * `pick` — create session: show selected day or placeholder.
   */
  mode?: 'coverage' | 'pick'
  /** Override the derived trigger label. */
  triggerLabel?: string
  /** Placeholder when mode=pick and no day selected. */
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Optional caption above the trigger (e.g. “Date coverage”). */
  caption?: string
}

/**
 * Compact date-field trigger + floating coverage calendar.
 * Keeps DateCoverageCalendar grid logic; avoids always filling half the dialog.
 */
export default function DateCoveragePopover({
  coverageDays,
  selectedDay,
  onSelectDay,
  initialMonth,
  mode = onSelectDay ? 'pick' : 'coverage',
  triggerLabel,
  placeholder = 'Pick a day with data',
  disabled = false,
  className,
  caption
}: DateCoveragePopoverProps): ReactNode {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const derivedLabel = useMemo(() => {
    if (triggerLabel != null) return triggerLabel
    if (mode === 'pick') {
      return selectedDay || placeholder
    }
    const span = coverageSpanLabel(coverageDays)
    if (span === 'No coverage') return span
    const n = coverageDays.size
    return n > 0 ? `${span} · ${n} day${n === 1 ? '' : 's'}` : span
  }, [coverageDays, mode, placeholder, selectedDay, triggerLabel])

  const isPlaceholder = mode === 'pick' && !selectedDay && triggerLabel == null

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return undefined

    function onPointerDown(event: MouseEvent): void {
      const root = rootRef.current
      if (!root) return
      if (event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false)
      }
    }

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {caption ? (
        <p className={cn(softType.caption, 'mb-1.5 font-medium text-zinc-400')}>{caption}</p>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={mode === 'pick' ? 'Pick start date' : 'Show date coverage'}
        onClick={() => {
          if (!disabled) setOpen((v) => !v)
        }}
        className={cn(
          softFieldClass,
          'inline-flex items-center justify-start gap-2 text-left',
          isPlaceholder ? 'text-zinc-500' : 'text-zinc-100',
          open && 'border-primary-500/40 bg-zinc-900'
        )}
      >
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
        <span className="min-w-0 flex-1 truncate tabular-nums">{derivedLabel}</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Date coverage calendar"
          className="absolute left-0 top-[calc(100%+0.35rem)] z-[90] w-[min(100vw-2rem,18.5rem)] rounded-2xl border border-white/10 bg-zinc-950/98 p-3 shadow-2xl shadow-black/50"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <DateCoverageCalendar
            coverageDays={coverageDays}
            selectedDay={selectedDay}
            initialMonth={initialMonth}
            onSelectDay={
              onSelectDay
                ? (day) => {
                    onSelectDay(day)
                    close()
                  }
                : undefined
            }
          />
        </div>
      ) : null}
    </div>
  )
}
