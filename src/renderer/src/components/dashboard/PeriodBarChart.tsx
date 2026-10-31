import { useState, type ReactNode } from 'react'
import { cn } from '@/components/ui/cn'
import { softType } from '@/components/ui/softTokens'
import { formatPnl } from '@/lib/paperTrade'
import type { PeriodBucket } from '@/lib/sessionAnalytics'
import { useT } from '@/i18n/useT'
import type { MessageKey } from '@/i18n/messages'

export type PeriodBarChartProps = {
  buckets: PeriodBucket[]
  positiveClass: string
  /** Weekday buckets: use short localized dow labels from key 0–6. */
  mode?: 'month' | 'weekday'
  emptyKey?: MessageKey
  /** Bar track height class (Analytics taller, Sessions shorter). */
  trackClassName?: string
  barMaxClassName?: string
  gapClassName?: string
}

function monthAxisLabel(
  key: string,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m) return key
  const year = m[1]
  const monthIndex = Number(m[2]) - 1
  if (monthIndex < 0 || monthIndex > 11) return key
  const month = t(`cal.month.${monthIndex}` as MessageKey)
  return `${month} ${year.slice(2)}`
}

function weekdayAxisLabel(
  key: string,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
): string {
  const i = Number(key)
  if (!Number.isInteger(i) || i < 0 || i > 6) return key
  return t(`cal.weekdayShort.${i}` as MessageKey)
}

/**
 * Localized monthly / weekday PnL bars with float value on hover
 * (no native title tooltip) and a light selected hover state.
 */
export default function PeriodBarChart({
  buckets,
  positiveClass,
  mode = 'month',
  emptyKey = 'charts.barsEmpty',
  trackClassName = 'h-36',
  barMaxClassName = 'max-w-[2.75rem]',
  gapClassName = 'gap-2'
}: PeriodBarChartProps): ReactNode {
  const { t } = useT()
  const [hovered, setHovered] = useState<string | null>(null)
  const maxAbs = Math.max(1, ...buckets.map((b) => Math.abs(b.pnl)))
  const hasData = buckets.some((b) => b.pnl !== 0 || (b.tradeCount ?? 0) > 0)
  if (!hasData) {
    return (
      <p className={cn('flex flex-1 items-center justify-center text-center', softType.caption)}>
        {t(emptyKey)}
      </p>
    )
  }

  return (
    <div className={cn('flex min-h-[8rem] flex-1 items-end px-1 pb-1 pt-2', gapClassName)}>
      {buckets.map((b) => {
        const height = Math.max(b.pnl === 0 ? 0 : 6, Math.round((Math.abs(b.pnl) / maxAbs) * 100))
        const label =
          mode === 'weekday' ? weekdayAxisLabel(b.key, t) : monthAxisLabel(b.key, t)
        const up = b.pnl >= 0
        const active = hovered === b.key
        const pnlText = formatPnl(b.pnl)
        return (
          <div
            key={b.key}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
            onMouseEnter={() => setHovered(b.key)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(b.key)}
            onBlur={() => setHovered(null)}
          >
            <div className={cn('flex w-full items-end justify-center', trackClassName)}>
              <div
                className={cn('relative w-[70%]', barMaxClassName)}
                style={{ height: `${height}%` }}
              >
                {active ? (
                  <span
                    className={cn(
                      'pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2',
                      'whitespace-nowrap rounded-md bg-zinc-950/90 px-1.5 py-0.5',
                      'text-[10px] font-semibold tabular-nums text-zinc-100 shadow-lg shadow-black/40',
                      'opacity-100 transition-opacity duration-150'
                    )}
                  >
                    {pnlText}
                  </span>
                ) : null}
                <div
                  className={cn(
                    'h-full w-full origin-bottom rounded-t-lg bg-gradient-to-t transition duration-150 ease-out',
                    up ? positiveClass : 'from-red-700 via-red-500 to-red-300',
                    active && 'scale-x-110 scale-y-105 brightness-125 ring-1 ring-white/25'
                  )}
                  role="img"
                  aria-label={`${label}: ${pnlText}`}
                />
              </div>
            </div>
            <span
              className={cn(
                'truncate transition-colors',
                softType.micro,
                active ? 'text-zinc-100' : 'text-zinc-500'
              )}
            >
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
