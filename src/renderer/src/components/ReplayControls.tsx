import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronsLeft,
  ChevronsRight,
  CirclePause,
  Gauge,
  Link2,
  LogOut,
  Pause,
  Play,
  SkipForward
} from 'lucide-react'
import DateCoverageCalendar from '@/components/dashboard/DateCoverageCalendar'
import Dropdown from '@/components/Dropdown'
import IconButton from '@/components/IconButton'
import Tooltip from '@/components/Tooltip'
import SoftConfirmDialog from '@/components/ui/SoftConfirmDialog'
import {
  defaultSessionParts,
  parseSessionParts,
  sessionTimezoneTitle,
  sessionUtcOffsetLabel,
  toSessionParts
} from '@/lib/chartTimezone'
import { REPLAY_SPEEDS, stepReplaySpeed } from '@/lib/replayEngine'
import { coverageDaysFromMetas, isDayCovered } from '@shared/dateCoverage'
import { TIMEFRAMES } from '@shared/timeframes'
import { useChartSettingsStore } from '@/store/chartSettingsStore'
import { useReplayStore } from '@/store/replayStore'
import { useSessionStore } from '@/store/sessionStore'
import { useT } from '@/i18n/useT'

function indexFromClientX(
  clientX: number,
  rect: DOMRect,
  bufferLength: number
): number {
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)))
  return Math.min(bufferLength - 1, Math.max(0, Math.round(ratio * (bufferLength - 1))))
}

function sortedCoverageDays(days: Set<string> | ReadonlySet<string>): string[] {
  return [...days].sort()
}

function nextCoverageDay(
  days: Set<string> | ReadonlySet<string>,
  fromDay: string | null | undefined
): string | null {
  const sorted = sortedCoverageDays(days)
  if (sorted.length === 0) return null
  if (!fromDay) return sorted[0] ?? null
  for (const day of sorted) {
    if (day > fromDay) return day
  }
  return null
}

export default function ReplayControls() {
  const { t } = useT()

  const replayStatus = useReplayStore((s) => s.replayStatus)
  const isPlaying = useReplayStore((s) => s.isPlaying)
  const speed = useReplayStore((s) => s.speed)
  const replayIndex = useReplayStore((s) => s.replayIndex)
  const secondaryReplayIndex = useReplayStore((s) => s.secondaryReplayIndex)
  const chartSplit = useReplayStore((s) => s.chartSplit)
  const driverPane = useReplayStore((s) => s.driverPane)
  const timeframe = useReplayStore((s) => s.timeframe)
  const secondaryTimeframe = useReplayStore((s) => s.secondaryTimeframe)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const secondaryLoading = useReplayStore((s) => s.secondaryLoading)
  const currentCandle = useReplayStore((s) => s.currentCandle)
  const play = useReplayStore((s) => s.play)
  const pause = useReplayStore((s) => s.pause)
  const stepForward = useReplayStore((s) => s.stepForward)
  const stepBackward = useReplayStore((s) => s.stepBackward)
  const setSpeed = useReplayStore((s) => s.setSpeed)
  const setDriverPane = useReplayStore((s) => s.setDriverPane)
  const jumpToTime = useReplayStore((s) => s.jumpToTime)
  const seekToIndex = useReplayStore((s) => s.seekToIndex)
  const confirmPendingSeek = useReplayStore((s) => s.confirmPendingSeek)
  const cancelPendingSeek = useReplayStore((s) => s.cancelPendingSeek)
  const pendingSeekConfirm = useReplayStore((s) => s.pendingSeekConfirm)
  const bufferLength = useReplayStore((s) => s.bufferLength)
  const closeActiveSession = useSessionStore((s) => s.closeActiveSession)
  const pauseOnTpSl = useReplayStore((s) => s.pauseOnTpSl)
  const setPauseOnTpSl = useReplayStore((s) => s.setPauseOnTpSl)
  const timezone = useChartSettingsStore((s) => s.timezone)
  const offsetLabel = sessionUtcOffsetLabel(timezone)
  const timezoneTitle = sessionTimezoneTitle(timezone)
  const importMeta = useReplayStore((s) => s.importMeta)

  const coverageDays = useMemo(
    () => (importMeta ? coverageDaysFromMetas([importMeta]) : new Set<string>()),
    [importMeta]
  )
  const currentDay = currentCandle
    ? toSessionParts(currentCandle.time, timezone).date
    : null
  const upcomingDays = useMemo(() => {
    const sorted = sortedCoverageDays(coverageDays)
    if (!currentDay) return sorted.slice(0, 8)
    return sorted.filter((day) => day >= currentDay).slice(0, 8)
  }, [coverageDays, currentDay])

  const seed = currentCandle
    ? toSessionParts(currentCandle.time, timezone)
    : defaultSessionParts(7, timezone)
  const [jumpDate, setJumpDate] = useState(seed.date)
  const [jumpTime, setJumpTime] = useState(seed.time)
  const [jumpError, setJumpError] = useState<string | null>(null)

  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const scrubOriginRef = useRef(0)
  const scrubRafRef = useRef(0)
  const scrubPendingRef = useRef<number | null>(null)
  const [scrubIndex, setScrubIndex] = useState<number | null>(null)
  const setChartScrubbing = useReplayStore((s) => s.setChartScrubbing)

  const busy = replayLoading || secondaryLoading
  const ended = replayStatus === 'ended'
  const driverIndex = chartSplit && driverPane === 'secondary' ? secondaryReplayIndex : replayIndex
  const displayIndex = scrubIndex ?? driverIndex
  const progressPct =
    bufferLength > 0 ? Math.min(100, ((displayIndex + 1) / bufferLength) * 100) : 0

  useEffect(() => {
    if (!draggingRef.current) setScrubIndex(null)
  }, [driverIndex])

  useEffect(() => {
    function flushScrubPreview(): void {
      scrubRafRef.current = 0
      const idx = scrubPendingRef.current
      if (idx == null) return
      scrubPendingRef.current = null
      setScrubIndex(idx)
      seekToIndex(idx, { preview: true })
    }

    function scheduleScrubPreview(idx: number): void {
      scrubPendingRef.current = idx
      if (scrubRafRef.current) return
      scrubRafRef.current = requestAnimationFrame(flushScrubPreview)
    }

    function onMove(event: PointerEvent): void {
      if (!draggingRef.current || !trackRef.current || bufferLength <= 0) return
      const idx = indexFromClientX(event.clientX, trackRef.current.getBoundingClientRect(), bufferLength)
      // Coalesce pointermove storms to one seek/publish per frame (M1 scrub).
      scheduleScrubPreview(idx)
    }

    function onUp(event: PointerEvent): void {
      if (!draggingRef.current) return
      draggingRef.current = false
      setChartScrubbing(false)
      if (scrubRafRef.current) {
        cancelAnimationFrame(scrubRafRef.current)
        scrubRafRef.current = 0
      }
      scrubPendingRef.current = null
      const track = trackRef.current
      const idx =
        track && bufferLength > 0
          ? indexFromClientX(event.clientX, track.getBoundingClientRect(), bufferLength)
          : (scrubIndex ?? driverIndex)
      setScrubIndex(null)
      // Commit from the index before the scrub so SoftConfirm can restore it.
      // Preview already moved the playhead; force=false still gates discard.
      const origin = scrubOriginRef.current
      if (idx === origin) {
        seekToIndex(idx, { force: true })
        return
      }
      // Restore origin first so requestSeek sees a real backward/forward delta
      // against the pre-scrub trade state (preview never rewound trades).
      seekToIndex(origin, { preview: true })
      seekToIndex(idx)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (scrubRafRef.current) cancelAnimationFrame(scrubRafRef.current)
    }
  }, [bufferLength, driverIndex, scrubIndex, seekToIndex, setChartScrubbing])

  async function onJump(event: FormEvent): Promise<void> {
    event.preventDefault()
    setJumpError(null)

    if (!jumpDate || !jumpTime) {
      setJumpError('Pick a covered day and time.')
      return
    }
    if (coverageDays.size > 0 && !isDayCovered(coverageDays, jumpDate)) {
      setJumpError('That day has no K-line data in this dataset.')
      return
    }

    const seconds = parseSessionParts(jumpDate, jumpTime, timezone)
    if (seconds == null) {
      setJumpError('Enter a valid date and time.')
      return
    }

    await jumpToTime(seconds)
  }

  async function goToDayOpen(day: string): Promise<void> {
    setJumpError(null)
    if (coverageDays.size > 0 && !isDayCovered(coverageDays, day)) {
      setJumpError('That day has no K-line data in this dataset.')
      return
    }
    const seconds = parseSessionParts(day, '00:00', timezone)
    if (seconds == null) {
      setJumpError('Enter a valid date.')
      return
    }
    setJumpDate(day)
    setJumpTime('00:00')
    await jumpToTime(seconds)
  }

  async function goToNextDayOpen(): Promise<void> {
    const next = nextCoverageDay(coverageDays, currentDay)
    if (!next) {
      setJumpError(t('replay.noNextDay'))
      return
    }
    await goToDayOpen(next)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex items-center gap-1">
        {!isPlaying ? (
          <IconButton
            tooltip={t('replay.play')}
            disabled={busy || ended}
            onClick={play}
            tone="accent"
            tooltipSide="top"
            shortcut={['Space']}
            className="!rounded-full"
          >
            <Play className="h-4 w-4 fill-current" />
          </IconButton>
        ) : (
          <IconButton
            tooltip={t('replay.pause')}
            shortcut={['Space']}
            disabled={busy}
            onClick={pause}
            tone="accent"
            tooltipSide="top"
            className="!rounded-full"
          >
            <Pause className="h-4 w-4 fill-current" />
          </IconButton>
        )}

        <IconButton
          tooltip={t('replay.stepBack')}
          shortcut={['ArrowLeft']}
          disabled={busy || driverIndex <= 0}
          onClick={stepBackward}
          tooltipSide="top"
        >
          <ChevronsLeft className="h-4 w-4" />
        </IconButton>

        <IconButton
          tooltip={t('replay.stepForward')}
          shortcut={['ArrowRight']}
          disabled={busy || ended}
          onClick={stepForward}
          tooltipSide="top"
        >
          <ChevronsRight className="h-4 w-4" />
        </IconButton>
      </div>

      {chartSplit && (
        <div className="flex items-center gap-1">
          <Tooltip text={t('replay.toggleNext')} kbds={['Tab']} side="top">
            <button
              type="button"
              disabled={busy}
              onClick={(event) => {
                setDriverPane(driverPane === 'primary' ? 'secondary' : 'primary')
                event.currentTarget.blur()
              }}
              aria-label={t('replay.toggleNext')}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-2 text-xs text-zinc-300 transition-colors enabled:hover:border-zinc-500 enabled:hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="text-zinc-500">{t('replay.next')}</span>
              <span className="font-medium text-primary-300">
                {driverPane === 'secondary'
                  ? `${TIMEFRAMES[secondaryTimeframe]?.label ?? secondaryTimeframe} · right`
                  : `${TIMEFRAMES[timeframe]?.label ?? timeframe} · left`}
              </span>
            </button>
          </Tooltip>
          <Tooltip text={t('replay.syncTip')} side="top">
            <span
              className="inline-flex h-8 items-center gap-1 rounded-xl border border-emerald-900/60 bg-emerald-950/40 px-2 text-[11px] font-medium text-emerald-300"
              aria-label={t('replay.syncOn')}
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden />
              {t('replay.syncOn')}
            </span>
          </Tooltip>
        </div>
      )}

      <div className="flex h-8 items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900/80 px-1.5 text-xs text-zinc-400">
        <Gauge className="ml-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
        <span className="sr-only">{t('replay.speed')}</span>
        <button
          type="button"
          disabled={busy || speed <= REPLAY_SPEEDS[0]!}
          aria-label="Slower"
          title="Slower (−)"
          onClick={(event) => {
            setSpeed(stepReplaySpeed(speed, -1))
            event.currentTarget.blur()
          }}
          className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-zinc-300 transition-colors enabled:hover:bg-zinc-800 enabled:hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          −
        </button>
        <label className="flex min-w-[6.5rem] flex-1 items-center gap-1.5 px-0.5">
          <input
            type="range"
            min={0}
            max={REPLAY_SPEEDS.length - 1}
            step={1}
            value={Math.max(
              0,
              (REPLAY_SPEEDS as readonly number[]).indexOf(speed) >= 0
                ? (REPLAY_SPEEDS as readonly number[]).indexOf(speed)
                : 1
            )}
            disabled={busy}
            aria-label={t('replay.speedAria')}
            aria-valuetext={`${speed}x`}
            onChange={(e) => {
              const idx = Number(e.target.value)
              const next = REPLAY_SPEEDS[idx]
              if (next != null) setSpeed(next)
            }}
            className="h-1.5 w-full cursor-pointer accent-primary-400 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <span className="w-8 shrink-0 text-right text-[11px] font-semibold tabular-nums text-zinc-100">
            {speed}x
          </span>
        </label>
        <button
          type="button"
          disabled={busy || speed >= REPLAY_SPEEDS[REPLAY_SPEEDS.length - 1]!}
          aria-label="Faster"
          title="Faster (+)"
          onClick={(event) => {
            setSpeed(stepReplaySpeed(speed, 1))
            event.currentTarget.blur()
          }}
          className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-zinc-300 transition-colors enabled:hover:bg-zinc-800 enabled:hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
      </div>

      <IconButton
        tooltip={t('replay.pauseOnTpSl')}
        active={pauseOnTpSl}
        pressed={pauseOnTpSl}
        tooltipSide="top"
        onClick={(event) => {
          setPauseOnTpSl(!pauseOnTpSl)
          event.currentTarget.blur()
        }}
      >
        <CirclePause className="h-4 w-4" />
      </IconButton>

      <Dropdown
        align="end"
        placement="top"
        menuClassName="!overflow-visible"
        trigger={({ open, toggle }) => (
          <IconButton
            tooltip={`Jump to ${offsetLabel} time`}
            active={open}
            tooltipSide="top"
            disabled={busy}
            onClick={(event) => {
              toggle()
              event.currentTarget.blur()
            }}
          >
            <SkipForward className="h-4 w-4" />
          </IconButton>
        )}
      >
        <form
          onSubmit={onJump}
          className="flex w-[min(18.5rem,calc(100vw-2rem))] flex-col gap-2 p-2"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <span className="px-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
            Jump · {timezoneTitle}
          </span>
          {coverageDays.size > 0 ? (
            <DateCoverageCalendar
              coverageDays={coverageDays}
              selectedDay={jumpDate}
              initialMonth={jumpDate ? jumpDate.slice(0, 7) : undefined}
              onSelectDay={(day) => {
                setJumpError(null)
                setJumpDate(day)
              }}
              className="rounded-xl border border-white/[0.06] bg-zinc-950/80 p-2"
            />
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-800 px-2 py-3 text-center text-[11px] text-zinc-500">
              No coverage calendar for this session.
            </p>
          )}
          <div className="flex items-center gap-1.5">
            <input
              type="time"
              value={jumpTime}
              disabled={busy}
              aria-label={`Jump time ${timezoneTitle}`}
              onChange={(e) => setJumpTime(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-1.5 text-xs text-zinc-300 disabled:opacity-60"
            />
            <IconButton type="submit" disabled={busy} tooltip={`Jump to ${timezoneTitle}`}>
              <SkipForward className="h-4 w-4" />
            </IconButton>
          </div>
          {jumpDate ? (
            <span className="px-0.5 text-[10px] tabular-nums text-zinc-500">
              Day {jumpDate}
              {coverageDays.size > 0 && !isDayCovered(coverageDays, jumpDate)
                ? ' · no data'
                : ''}
            </span>
          ) : null}
          <div className="flex flex-col gap-1 border-t border-zinc-800 pt-2">
            <button
              type="button"
              disabled={busy || nextCoverageDay(coverageDays, currentDay) == null}
              onClick={() => void goToNextDayOpen()}
              className="inline-flex h-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-200 transition-colors enabled:hover:border-primary-500/40 enabled:hover:text-primary-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('replay.goToNextDay')}
            </button>
            {upcomingDays.length > 0 ? (
              <div className="max-h-36 overflow-auto rounded-xl border border-zinc-800">
                <table className="w-full text-left text-[11px] text-zinc-300">
                  <thead className="sticky top-0 bg-zinc-950 text-[10px] uppercase tracking-[0.08em] text-zinc-500">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">{t('replay.sessionDays')}</th>
                      <th className="px-2 py-1.5 text-right font-medium">{t('replay.goToDayOpen')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingDays.map((day) => (
                      <tr key={day} className="border-t border-zinc-900">
                        <td className="px-2 py-1 tabular-nums">
                          {day}
                          {day === currentDay ? (
                            <span className="ml-1 text-[10px] text-primary-400">now</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1 text-right">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void goToDayOpen(day)}
                            className="rounded-lg px-1.5 py-0.5 text-primary-300 hover:bg-zinc-800 disabled:opacity-40"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
          {jumpError && <span className="text-xs text-red-400">{jumpError}</span>}
        </form>
      </Dropdown>

      {bufferLength > 0 ? (
        <div className="ml-0.5 flex min-w-[8.5rem] max-w-[14rem] flex-1 items-center gap-1.5">
          <div
            ref={trackRef}
            role="slider"
            tabIndex={busy ? -1 : 0}
            aria-valuemin={1}
            aria-valuemax={bufferLength}
            aria-valuenow={displayIndex + 1}
            aria-label={t('replay.progressAria')}
            title={t('replay.progressTip')}
            aria-disabled={busy}
            className="group relative h-8 min-w-0 flex-1 cursor-ew-resize touch-none rounded-xl border border-zinc-800 bg-zinc-900/80 px-2 disabled:cursor-not-allowed select-none"
            onPointerDown={(event) => {
              if (busy || bufferLength <= 0) return
              event.preventDefault()
              draggingRef.current = true
              scrubOriginRef.current = driverIndex
              setChartScrubbing(true)
              const idx = indexFromClientX(
                event.clientX,
                event.currentTarget.getBoundingClientRect(),
                bufferLength
              )
              setScrubIndex(idx)
              seekToIndex(idx, { preview: true })
              event.currentTarget.setPointerCapture?.(event.pointerId)
            }}
            onKeyDown={(event) => {
              if (busy || bufferLength <= 0) return
              if (event.key === 'ArrowLeft') {
                event.preventDefault()
                seekToIndex(Math.max(0, driverIndex - 1))
              } else if (event.key === 'ArrowRight') {
                event.preventDefault()
                seekToIndex(Math.min(bufferLength - 1, driverIndex + 1))
              } else if (event.key === 'Home') {
                event.preventDefault()
                seekToIndex(0)
              } else if (event.key === 'End') {
                event.preventDefault()
                seekToIndex(bufferLength - 1)
              }
            }}
          >
            <span
              className="pointer-events-none absolute inset-y-1 left-1 rounded-lg bg-primary-500/35"
              style={{ width: `calc(${progressPct}% - 0.25rem)` }}
              aria-hidden
            />
            <span
              className="pointer-events-none absolute top-1/2 z-[2] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary-300 bg-zinc-950 shadow shadow-black/40"
              style={{ left: `${Math.min(100, Math.max(0, progressPct))}%` }}
              aria-hidden
            />
            <span className="relative z-[1] text-[10px] font-medium tabular-nums text-zinc-400 group-hover:text-zinc-200">
              {displayIndex + 1}/{bufferLength}
            </span>
          </div>
        </div>
      ) : null}

      <IconButton
        tooltip={t('replay.saveClose')}
        onClick={() => void closeActiveSession()}
        tooltipSide="top"
        className="ml-0.5"
      >
        <LogOut className="h-4 w-4" />
      </IconButton>

      <SoftConfirmDialog
        open={pendingSeekConfirm != null}
        title={t('replay.seekDiscardTitle')}
        description={t('replay.seekDiscardBody')}
        confirmLabel={t('replay.seekDiscardConfirm')}
        cancelLabel={t('common.cancel')}
        danger
        onConfirm={confirmPendingSeek}
        onCancel={cancelPendingSeek}
      />
    </div>
  )
}
