import { useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import SoftButton from '@/components/ui/SoftButton'
import { softType } from '@/components/ui/softTokens'
import { useT } from '@/i18n/useT'
import { coveragePeriodIndex } from '@shared/dateCoverage'

type CalendarView = 'days' | 'months' | 'years'

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function monthName(monthIndex: number, locale: string): string {
  return new Date(Date.UTC(2000, monthIndex, 1)).toLocaleString(locale, {
    month: 'long',
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
 * Header: « year ‹ month · Month YYYY · month › year ».
 * Click year → year grid; click month name → month grid.
 * Used in SymbolDatasetsDialog (read-only) and CreateSessionDialog (selectable).
 */
export default function DateCoverageCalendar({
  coverageDays,
  selectedDay,
  onSelectDay,
  initialMonth,
  className
}: DateCoverageCalendarProps): ReactNode {
  const { t, locale } = useT()
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
  const [view, setView] = useState<CalendarView>('days')
  /** Decade start for the year-picker grid (12 years: decadeStart … decadeStart+11). */
  const [yearGridStart, setYearGridStart] = useState(() => Math.floor(seed.year / 12) * 12)

  const periods = useMemo(() => coveragePeriodIndex(coverageDays), [coverageDays])

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
    while (out.length < 42) out.push(null)
    return out
  }, [year, month])

  function shiftMonth(delta: number): void {
    const date = new Date(Date.UTC(year, month + delta, 1))
    setYear(date.getUTCFullYear())
    setMonth(date.getUTCMonth())
    setView('days')
  }

  function shiftYear(delta: number): void {
    setYear((y) => y + delta)
    setView('days')
  }

  function openYearPicker(): void {
    setYearGridStart(Math.floor(year / 12) * 12)
    setView((v) => (v === 'years' ? 'days' : 'years'))
  }

  function openMonthPicker(): void {
    setView((v) => (v === 'months' ? 'days' : 'months'))
  }

  function pickYear(nextYear: number): void {
    setYear(nextYear)
    setView('days')
  }

  function pickMonth(monthIndex: number): void {
    setMonth(monthIndex)
    setView('days')
  }

  const headerLabel =
    view === 'years'
      ? `${yearGridStart} – ${yearGridStart + 11}`
      : view === 'months'
        ? String(year)
        : null

  return (
    <div className={cn('select-none', className)}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <div className="flex items-center gap-0.5">
          <SoftButton
            size="sm"
            variant="ghost"
            aria-label="Previous year"
            onClick={() => {
              if (view === 'years') {
                setYearGridStart((s) => s - 12)
              } else if (view === 'months') {
                setYear((y) => y - 1)
              } else {
                shiftYear(-1)
              }
            }}
            className="!h-7 !w-7 !px-0"
          >
            <ChevronsLeft className="h-3.5 w-3.5" aria-hidden />
          </SoftButton>
          {view === 'days' ? (
            <SoftButton
              size="sm"
              variant="ghost"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
              className="!h-7 !w-7 !px-0"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            </SoftButton>
          ) : null}
        </div>

        <div className="flex min-w-0 items-center justify-center gap-1">
          {view === 'days' ? (
            <>
              <button
                type="button"
                onClick={openMonthPicker}
                className={cn(
                  softType.caption,
                  'rounded-lg px-1.5 py-0.5 font-medium text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100'
                )}
                aria-label="Choose month"
              >
                {monthName(month, locale === 'zh' ? 'zh-CN' : 'en-US')}
              </button>
              <button
                type="button"
                onClick={openYearPicker}
                className={cn(
                  softType.caption,
                  'rounded-lg px-1.5 py-0.5 font-medium tabular-nums text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100'
                )}
                aria-label="Choose year"
              >
                {year}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setView('days')}
              className={cn(
                softType.caption,
                'rounded-lg px-1.5 py-0.5 font-medium tabular-nums text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100'
              )}
              aria-label="Back to month view"
            >
              {headerLabel}
            </button>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {view === 'days' ? (
            <SoftButton
              size="sm"
              variant="ghost"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
              className="!h-7 !w-7 !px-0"
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </SoftButton>
          ) : null}
          <SoftButton
            size="sm"
            variant="ghost"
            aria-label="Next year"
            onClick={() => {
              if (view === 'years') {
                setYearGridStart((s) => s + 12)
              } else if (view === 'months') {
                setYear((y) => y + 1)
              } else {
                shiftYear(1)
              }
            }}
            className="!h-7 !w-7 !px-0"
          >
            <ChevronsRight className="h-3.5 w-3.5" aria-hidden />
          </SoftButton>
        </div>
      </div>

      {view === 'years' ? (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 12 }, (_, i) => yearGridStart + i).map((y) => {
            const selected = y === year
            const lit = periods.years.has(y)
            return (
              <button
                key={y}
                type="button"
                onClick={() => pickYear(y)}
                aria-pressed={selected}
                aria-label={`${y} — ${lit ? t('cal.hasData') : t('cal.noData')}`}
                className={cn(
                  'flex h-9 flex-col items-center justify-center rounded-xl text-[12px] tabular-nums transition-colors',
                  periodClass(selected, lit)
                )}
              >
                <span className="leading-none">{y}</span>
                <CoverageDot lit={lit} />
              </button>
            )
          })}
        </div>
      ) : view === 'months' ? (
        <div className="grid grid-cols-3 gap-1.5">
          {([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const).map((idx) => {
            const label = t(`cal.month.${idx}` as 'cal.month.0')
            const selected = idx === month
            const lit = periods.months.has(`${year}-${pad2(idx + 1)}`)
            return (
              <button
                key={idx}
                type="button"
                onClick={() => pickMonth(idx)}
                aria-pressed={selected}
                aria-label={`${year}-${pad2(idx + 1)} ${label} — ${lit ? t('cal.hasData') : t('cal.noData')}`}
                className={cn(
                  'flex h-9 flex-col items-center justify-center rounded-xl text-[12px] transition-colors',
                  periodClass(selected, lit)
                )}
              >
                <span className="leading-none">{label}</span>
                <CoverageDot lit={lit} />
              </button>
            )
          })}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {([0, 1, 2, 3, 4, 5, 6] as const).map((di) => (
              <div key={di} className={cn(softType.micro, 'py-1 text-zinc-600')}>
                {t(`cal.dow.${di}` as 'cal.dow.0')}
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
                      ? `${cell.key}${selected ? ' selected' : ''} — ${t('cal.hasData')}`
                      : `${cell.key} — ${t('cal.noData')}`
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

        </>
      )}

      <CoverageLegend />
    </div>
  )
}

/** Same lit / empty language as the day grid. Selection stays blue. */
function periodClass(selected: boolean, lit: boolean): string {
  if (selected) return 'bg-primary-500/90 font-semibold text-white'
  if (lit) return 'bg-emerald-500/20 font-medium text-emerald-200 hover:bg-emerald-500/35'
  return 'text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300'
}

/** Stays visible on the blue selected cell, where the fill can no longer say "has data". */
function CoverageDot({ lit }: { lit: boolean }): ReactNode {
  return (
    <span
      className={cn('mt-1 h-1 w-1 rounded-full', lit ? 'bg-emerald-300' : 'bg-zinc-700')}
      aria-hidden
    />
  )
}

function CoverageLegend(): ReactNode {
  const { t } = useT()
  return (
    <p className={cn('mt-2', softType.micro)}>
      <span className="mr-3 inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500/50" aria-hidden />
        {t('cal.hasData')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-sm bg-zinc-700" aria-hidden />
        {t('cal.noData')}
      </span>
    </p>
  )
}
