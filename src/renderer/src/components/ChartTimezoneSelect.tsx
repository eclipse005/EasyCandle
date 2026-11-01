/** Chart timezone control — display-only; does not affect analytics day cuts or stored data. */
import { useMemo, useState } from 'react'
import { ChevronDown, Globe2 } from 'lucide-react'
import Dropdown from '@/components/Dropdown'
import {
  CHART_TIMEZONES,
  sessionTimezoneTitle,
  sessionUtcOffsetLabel,
  type ChartTimezone
} from '@/lib/chartTimezone'
import { useChartSettingsStore } from '@/store/chartSettingsStore'
import { useT } from '@/i18n/useT'

function matchesQuery(zone: ChartTimezone, needle: string): boolean {
  return (
    zone.city.toLowerCase().includes(needle) ||
    zone.region.toLowerCase().includes(needle) ||
    zone.id.toLowerCase().includes(needle)
  )
}

function groupName(zone: ChartTimezone): string {
  return zone.region.split(' / ')[0] || 'UTC'
}

export default function ChartTimezoneSelect() {
  const { t } = useT()
  const timezone = useChartSettingsStore((s) => s.timezone)
  const setTimezone = useChartSettingsStore((s) => s.setTimezone)
  const [query, setQuery] = useState('')

  const triggerLabel = sessionUtcOffsetLabel(timezone)
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matches = needle
      ? CHART_TIMEZONES.filter((zone) => matchesQuery(zone, needle))
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
  }, [query])

  return (
    <div className="shrink-0">
      <Dropdown
        align="end"
        menuClassName="w-72 py-0"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-label={t('chart.timezone')}
            aria-expanded={open}
            title={sessionTimezoneTitle(timezone)}
            onPointerDown={(event) => event.stopPropagation()}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-2 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
          >
            <Globe2 className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
            <span className="tabular-nums text-zinc-100">{triggerLabel}</span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
        )}
      >
        {({ close }) => (
          <div className="flex flex-col">
            <div className="border-b border-zinc-800 p-1.5">
              <input
                type="search"
                value={query}
                placeholder={t('settings.timezoneSearch')}
                aria-label={t('settings.timezoneSearch')}
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                className="h-7 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-2 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-primary-500/50"
              />
            </div>
            <div className="max-h-80 overflow-y-auto py-1">
              {groups.length === 0 && (
                <div className="px-3 py-2 text-[11px] text-zinc-500">
                  {t('settings.timezoneEmpty')}
                </div>
              )}
              {groups.map((group) => (
                <div key={group.name}>
                  <div className="sticky top-0 bg-zinc-950 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                    {group.name}
                  </div>
                  {group.zones.map((zone) => {
                    const selected = zone.id === timezone
                    return (
                      <button
                        key={zone.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setTimezone(zone.id)
                          setQuery('')
                          close()
                        }}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors ${
                          selected
                            ? 'bg-amber-950/40 text-primary-300'
                            : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[11px]">{zone.city}</span>
                          {zone.region ? (
                            <span className="block truncate text-[10px] text-zinc-600">
                              {zone.region}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">
                          {sessionUtcOffsetLabel(zone.id)}
                        </span>
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
