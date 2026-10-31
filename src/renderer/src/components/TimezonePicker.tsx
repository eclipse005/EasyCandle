/** Shared searchable timezone picker — Settings Account TZ + CSV Import Confirm. */
import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import Dropdown from '@/components/Dropdown'
import {
  chartTimezoneById,
  listAccountTimezones,
  sessionUtcOffsetLabel,
  type ChartTimezone
} from '@/lib/chartTimezone'
import { cn } from '@/components/ui/cn'
import { useT } from '@/i18n/useT'

function matchesQuery(zone: ChartTimezone, needle: string, atSeconds: number): boolean {
  const offset = sessionUtcOffsetLabel(zone.id, atSeconds).toLowerCase()
  return (
    zone.city.toLowerCase().includes(needle) ||
    zone.region.toLowerCase().includes(needle) ||
    zone.id.toLowerCase().includes(needle) ||
    offset.includes(needle) ||
    offset.replace('utc', '').includes(needle)
  )
}

/** Option label: `Shanghai (UTC+8)` — offset for “now” at open/render. */
export function timezoneOptionLabel(
  zoneId: string,
  atSeconds: number = Math.floor(Date.now() / 1000)
): string {
  const zone = chartTimezoneById(zoneId)
  const offset = sessionUtcOffsetLabel(zone.id, atSeconds)
  if (zone.id === 'UTC') return offset === 'UTC' ? 'UTC' : `UTC (${offset})`
  return `${zone.city} (${offset})`
}

/** @deprecated Prefer timezoneOptionLabel — kept for Settings call sites. */
export const accountTimezoneOptionLabel = timezoneOptionLabel

export type TimezonePickerProps = {
  value: string
  onChange: (zoneId: string) => void
  disabled?: boolean
  /** Accessible name for the trigger button. */
  ariaLabel: string
  /** Shown when value is empty (Import Confirm requires an explicit pick). */
  placeholder?: string
  className?: string
  triggerClassName?: string
}

export default function TimezonePicker({
  value,
  onChange,
  disabled = false,
  ariaLabel,
  placeholder,
  className,
  triggerClassName
}: TimezonePickerProps): ReactNode {
  const { t } = useT()
  const [query, setQuery] = useState('')
  const [atSeconds] = useState(() => Math.floor(Date.now() / 1000))

  const triggerLabel = value
    ? timezoneOptionLabel(value, atSeconds)
    : (placeholder ?? t('settings.timezoneSearch'))

  const zones = useMemo(() => {
    const curated = listAccountTimezones(atSeconds)
    const ids = new Set(curated.map((z) => z.id))
    const list =
      !value || ids.has(value) || value === 'Etc/UTC'
        ? curated
        : [chartTimezoneById(value), ...curated]
    const needle = query.trim().toLowerCase()
    return needle ? list.filter((zone) => matchesQuery(zone, needle, atSeconds)) : list
  }, [query, atSeconds, value])

  return (
    <div className={cn('w-full', className)}>
      <Dropdown
        align="start"
        placement="bottom"
        menuClassName="w-[min(100%,24rem)] min-w-full py-0"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            disabled={disabled}
            onClick={toggle}
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-required={!value}
            title={value ? chartTimezoneById(value).id : undefined}
            className={cn(
              'flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-zinc-900/70 px-3 text-left text-body font-medium text-zinc-100 outline-none transition-colors',
              'hover:bg-zinc-900 focus:border-primary-500/40 focus:bg-zinc-900',
              open && 'border-primary-500/40 bg-zinc-900',
              disabled && 'cursor-not-allowed opacity-40',
              !value && 'text-zinc-500',
              triggerClassName
            )}
          >
            <span className="min-w-0 truncate tabular-nums">{triggerLabel}</span>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-zinc-500 transition-transform',
                open && 'rotate-180'
              )}
              aria-hidden
            />
          </button>
        )}
      >
        {({ close }) => (
          <div className="flex flex-col">
            <div className="border-b border-white/10 p-2">
              <input
                type="search"
                value={query}
                placeholder={t('settings.timezoneSearch')}
                aria-label={t('settings.timezoneSearch')}
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                className="h-9 w-full rounded-xl border border-white/10 bg-zinc-900/70 px-2.5 text-caption text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-primary-500/40"
              />
            </div>
            <div className="max-h-72 overflow-y-auto py-1" role="listbox">
              {zones.length === 0 && (
                <div className="px-3 py-2 text-caption text-zinc-500">
                  {t('settings.timezoneEmpty')}
                </div>
              )}
              {zones.map((zone) => {
                const selected = zone.id === value
                const label = timezoneOptionLabel(zone.id, atSeconds)
                return (
                  <button
                    key={zone.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(zone.id)
                      setQuery('')
                      close()
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors',
                      selected
                        ? 'bg-primary-500/15 text-primary-200'
                        : 'text-zinc-300 hover:bg-white/5 hover:text-zinc-100'
                    )}
                  >
                    <span className="min-w-0 truncate text-caption font-medium">{label}</span>
                    <span className="shrink-0 text-[10px] text-zinc-600">{zone.id}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </Dropdown>
    </div>
  )
}
