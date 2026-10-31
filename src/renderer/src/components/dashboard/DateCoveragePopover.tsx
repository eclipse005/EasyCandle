import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
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

type PanelPos = { top: number; left: number; width: number }

/**
 * Compact date-field trigger + floating coverage calendar (portaled so dialog
 * overflow does not clip it).
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
  const [pos, setPos] = useState<PanelPos | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

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

  const placePanel = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const width = Math.min(window.innerWidth - 16, 296)
    let left = rect.left
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - 8 - width)
    }
    const panelHeight = panelRef.current?.offsetHeight ?? 320
    const below = rect.bottom + 6
    const above = rect.top - 6 - panelHeight
    const top =
      below + panelHeight <= window.innerHeight - 8
        ? below
        : Math.max(8, above)
    setPos({ top, left, width })
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    placePanel()
  }, [open, placePanel])

  useEffect(() => {
    if (!open) return undefined

    function onPointerDown(event: MouseEvent): void {
      const t = event.target
      if (!(t instanceof Node)) return
      if (rootRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
    }

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }

    function onReposition(): void {
      placePanel()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open, placePanel])

  const panel =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Date coverage calendar"
            className="fixed z-[120] rounded-2xl border border-white/10 bg-zinc-950 p-3 shadow-2xl shadow-black/50"
            style={
              pos
                ? { top: pos.top, left: pos.left, width: pos.width }
                : { visibility: 'hidden', top: 0, left: 0, width: 296 }
            }
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
          </div>,
          document.body
        )
      : null

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {caption ? (
        <p className={cn(softType.caption, 'mb-1.5 font-medium text-zinc-400')}>{caption}</p>
      ) : null}
      <button
        ref={triggerRef}
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
      {panel}
    </div>
  )
}
