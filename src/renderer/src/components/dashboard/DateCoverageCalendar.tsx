import { useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import SoftButton from '@/components/ui/SoftButton'
import { softType } from '@/components/ui/softTokens'

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function monthLabel(year: number, monthIndex: number): string {
  return new Date(Date.UTC(year, monthIndex, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

/** Monday=0 … Sunday=6 for UTC calendar layout. */
function mondayOffset(year: number, monthIndex: number): number {
  const dow = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() // Sun=0
  return (dow + 6) % 7
}

export type DateCoverageCalendarProps = {
  /** UTC day keys `YYYY-MM-DD` that have data. */
  coverageDays: Set<string> | ReadonlySet<string>
  /** Currently selected day (Create Session). */
  selectedDay?: string
  /** When set, clicking a lit day selects it. Read-only when omitted. */
  onSelectDay?: (dayKey: string) => void
  /** Initial visible month as `YYYY-MM` (UTC). Defaults to selected or earliest coverage. */
  initialMonth?: string
  className?: string
}

/**
 * Month grid: lit days = coverage (union of dataset spans), grey = no data.
 * Used in SymbolDatasetsDialog (read-only) and CreateSessionDialog (selectable).
 */
export default function DateCoverageCalendar({
  coverageDays,
  selectedDay,
  onSelectDay,
  initialMonth,
  className
}: DateCoverageCalendarProps): ReactNode {
  const selectable = typeof onSelectDay === 'function'

  const seed = useMemo(() => {
    if (initialMonth && /^\d{4}-\d{2}$/.test(initialMonth)) {
      const [y, m] = initialMonth.split('-').map(Number)
      return { year: y, month: m - 1 }
    }
    if (selectedDay && /^\d{4}-\d{2}-\d{2}$/.test(selectedDay)) {
      const [y, m] = selectedDay.split('-').map(Number)
      return { year: y, month: m - 1 }
    }
    let earliest = ''
    for (const day of coverageDays) {
      if (!earliest || day < earliest) earliest = day
    }
    if (earliest) {
      const [y, m] = earliest.split('-').map(Number)
      return { year: y, month: m - 1 }
    }
    const now = new Date()
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() }
  }, [coverageDays, initialMonth, selectedDay])

  const [year, setYear] = useState(seed.year)
  const [month, setMonth] = useState(seed.month)

  const cells = useMemo(() => {
    const total = daysInMonth(year, month)
    const offset = mondayOffset(year, month)
    const out: ({ day: number; key: string } | null)[] = []
    for (let i = 0; i < offset; i += 1) out.push(null)
    for (let d = 1; d <= total; d += 1) {
      const key = `${year}-${pad2(month + 1)}-${pad2(d)}`
      out.push({ day: d, key })
    }
    while (out.length % 7 !== 0) out.push(null)
    return out
  }, [year, month])

  function shiftMonth(delta: number): void {
    const date = new Date(Date.UTC(year, month + delta, 1))
    setYear(date.getUTCFullYear())
    setMonth(date.getUTCMonth())
  }

  return (
    <div className={cn('select-none', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <SoftButton
          size="sm"
          variant="ghost"
          aria-label="Previous month"
          onClick={() => shiftMonth(-1)}
          className="!h-7 !w-7 !px-0"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        </SoftButton>
        <span className={cn(softType.caption, 'font-medium text-zinc-300')}>
          {monthLabel(year, month)}
        </span>
        <SoftButton
          size="sm"
          variant="ghost"
          aria-label="Next month"
          onClick={() => shiftMonth(1)}
          className="!h-7 !w-7 !px-0"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </SoftButton>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((label) => (
          <div key={label} className={cn(softType.micro, 'py-1 text-zinc-600')}>
            {label}
          </div>
        ))}
        {cells.map((cell, idx) => {
          if (!cell) {
            return <div key={`e-${idx}`} className="h-8" />
          }
          const lit = coverageDays.has(cell.key)
          const selected = selectedDay === cell.key
          const canClick = selectable && lit
          return (
            <button
              key={cell.key}
              type="button"
              disabled={!canClick}
              aria-label={
                lit
                  ? `${cell.key}${selected ? ' selected' : ''} — has data`
                  : `${cell.key} — no data`
              }
              aria-pressed={selected}
              onClick={() => {
                if (canClick) onSelectDay?.(cell.key)
              }}
              className={cn(
                'h-8 rounded-lg text-[12px] tabular-nums transition-colors',
                lit
                  ? selected
                    ? 'bg-primary-500/90 font-semibold text-white'
                    : selectable
                      ? 'bg-emerald-500/20 font-medium text-emerald-200 hover:bg-emerald-500/35'
                      : 'bg-emerald-500/15 font-medium text-emerald-300/90'
                  : 'cursor-default text-zinc-700 opacity-50'
              )}
            >
              {cell.day}
            </button>
          )
        })}
      </div>

      <p className={cn('mt-2', softType.micro)}>
        <span className="mr-3 inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500/50" aria-hidden />
          Has data
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-zinc-700" aria-hidden />
          No data
        </span>
      </p>
    </div>
  )
}
