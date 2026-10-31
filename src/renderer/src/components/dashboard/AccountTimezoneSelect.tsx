/** Settings Account timezone — full IANA list with UTC offset, searchable Soft dropdown. */
import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import Dropdown from '@/components/Dropdown'
import {
  CHART_TIMEZONES,
  chartTimezoneById,
  sessionUtcOffsetLabel,
  type ChartTimezone
} from '@/lib/chartTimezone'
import { useAccountPrefsStore } from '@/store/accountPrefsStore'
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

function groupName(zone: ChartTimezone): string {
  return zone.region.split(' / ')[0] || 'UTC'
}

/** Option label: `Shanghai (UTC+8)` — offset for “now” at open/render. */
export function accountTimezoneOptionLabel(
  zoneId: string,
  atSeconds: number = Math.floor(Date.now() / 1000)
): string {
  const zone = chartTimezoneById(zoneId)
  const offset = sessionUtcOffsetLabel(zone.id, atSeconds)
  if (zone.id === 'UTC') return offset === 'UTC' ? 'UTC' : `UTC (${offset})`
  return `${zone.city} (${offset})`
}

export default function AccountTimezoneSelect(): ReactNode {
  const { t } = useT()
  const accountTimezone = useAccountPrefsStore((s) => s.accountTimezone)
  const setAccountTimezone = useAccountPrefsStore((s) => s.setAccountTimezone)
  const [query, setQuery] = useState('')
  // Offset snapshot at mount — DST-correct for “now”; documented as load-time offset.
  const [atSeconds] = useState(() => Math.floor(Date.now() / 1000))

  const triggerLabel = accountTimezoneOptionLabel(accountTimezone, atSeconds)
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matches = needle
      ? CHART_TIMEZONES.filter((zone) => matchesQuery(zone, needle, atSeconds))
      : CHART_TIMEZONES
    const out: { name: string; zones: ChartTimezone[] }[] = []
    let current: { name: string; zones: ChartTimezone[] } | null = null
    for (const zone of matches) {
      const name = groupName(zone)
      if (!current || current.name !== name) {
        current = { name, zones: [] }
        out.push(current)
      }
      current.zones.push(zone)
    }
    return out
  }, [query, atSeconds])

  return (
    <div className="w-full max-w-sm">
    <Dropdown
      align="start"
      placement="bottom"
      menuClassName="w-[min(100%,24rem)] min-w-full py-0"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label="Account timezone"
          aria-expanded={open}
          aria-haspopup="listbox"
          title={chartTimezoneById(accountTimezone).id}
          className={cn(
            'flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-zinc-900/70 px-3 text-left text-body font-medium text-zinc-100 outline-none transition-colors',
            'hover:bg-zinc-900 focus:border-primary-500/40 focus:bg-zinc-900',
            open && 'border-primary-500/40 bg-zinc-900'
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
              aria-label="Search timezone"
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 w-full rounded-xl border border-white/10 bg-zinc-900/70 px-2.5 text-caption text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-primary-500/40"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1" role="listbox">
            {groups.length === 0 && (
              <div className="px-3 py-2 text-caption text-zinc-500">{t('settings.timezoneEmpty')}</div>
            )}
            {groups.map((group) => (
              <div key={group.name}>
                <div className="sticky top-0 bg-zinc-950/95 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500 backdrop-blur-sm">
                  {group.name}
                </div>
                {group.zones.map((zone) => {
                  const selected = zone.id === accountTimezone
                  const label = accountTimezoneOptionLabel(zone.id, atSeconds)
                  return (
                    <button
                      key={zone.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        setAccountTimezone(zone.id)
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
                      {zone.region ? (
                        <span className="shrink-0 text-[10px] text-zinc-600">{zone.id}</span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </Dropdown>
    </div>
  )
}
