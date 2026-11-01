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
import DateCoveragePopover from '@/components/dashboard/DateCoveragePopover'
import Dropdown from '@/components/Dropdown'
import IconButton from '@/components/IconButton'
import Tooltip from '@/components/Tooltip'
import SoftConfirmDialog from '@/components/ui/SoftConfirmDialog'
import {
  defaultSessionParts,
  parseSessionParts,
  sessionTimezoneTitle,
  toSessionParts
} from '@/lib/chartTimezone'
import { REPLAY_SPEEDS, stepReplaySpeed } from '@/lib/replayEngine'
import { coverageDaysFromMetas, isDayCovered } from '@shared/dateCoverage'
import type { ForexGoToKind } from '@shared/forexSession'
import { TIMEFRAMES } from '@shared/timeframes'
import type { MessageKey } from '@/i18n/messages'
import { jumpToForexGoTo } from '@/lib/forexGoTo'
import { useChartSettingsStore } from '@/store/chartSettingsStore'
import { useReplayStore } from '@/store/replayStore'
import { useSessionStore } from '@/store/sessionStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { useT } from '@/i18n/useT'

function indexFromClientX(
  clientX: number,
  rect: DOMRect,
  bufferLength: number
): number {
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)))
  return Math.min(bufferLength - 1, Math.max(0, Math.round(ratio * (bufferLength - 1))))
}

const GO_TO_ITEMS: { kind: ForexGoToKind; label: MessageKey; shortcut: string }[] = [
  { kind: 'dayOpen', label: 'replay.goToNextDay', shortcut: 'Y' },
  { kind: 'nextSession', label: 'replay.goToNextSession', shortcut: 'Z' },
  { kind: 'newYork', label: 'replay.goToNewYork', shortcut: 'N' },
  { kind: 'asian', label: 'replay.goToAsian', shortcut: 'I' },
  { kind: 'london', label: 'replay.goToLondon', shortcut: 'L' }
]

export default function ReplayControls() {
  const { t } = useT()

  const replayStatus = useReplayStore((s) => s.replayStatus)
  const isPlaying = useReplayStore((s) => s.isPlaying)
  const speed = useReplayStore((s) => s.speed)
  const replayIndex = useReplayStore((s) => s.replayIndex)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const secondaryLoading = useReplayStore((s) => s.secondaryLoading)
  const currentCandle = useReplayStore((s) => s.currentCandle)
  const play = useReplayStore((s) => s.play)
  const pause = useReplayStore((s) => s.pause)
  const stepForward = useReplayStore((s) => s.stepForward)
  const stepBackward = useReplayStore((s) => s.stepBackward)
  const setSpeed = useReplayStore((s) => s.setSpeed)
  const replayTimestep = useReplayStore((s) => s.replayTimestep)
  const syncTimestepWithChart = useReplayStore((s) => s.syncTimestepWithChart)
  const setReplayTimestep = useReplayStore((s) => s.setReplayTimestep)
  const setSyncTimestepWithChart = useReplayStore((s) => s.setSyncTimestepWithChart)
  const jumpToTime = useReplayStore((s) => s.jumpToTime)
  const seekToIndex = useReplayStore((s) => s.seekToIndex)
  const confirmPendingSeek = useReplayStore((s) => s.confirmPendingSeek)
  const cancelPendingSeek = useReplayStore((s) => s.cancelPendingSeek)
  const pendingSeekConfirm = useReplayStore((s) => s.pendingSeekConfirm)
  const bufferLength = useReplayStore((s) => s.bufferLength)
  const closeActiveSession = useSessionStore((s) => s.closeActiveSession)
  const jumpMenuRequestId = useUiLayoutStore((s) => s.jumpMenuRequestId)
  const pauseOnTpSl = useReplayStore((s) => s.pauseOnTpSl)
  const setPauseOnTpSl = useReplayStore((s) => s.setPauseOnTpSl)
  const timezone = useChartSettingsStore((s) => s.timezone)
  const timezoneTitle = sessionTimezoneTitle(timezone)
  const importMeta = useReplayStore((s) => s.importMeta)

  const coverageDays = useMemo(
    () => (importMeta ? coverageDaysFromMetas([importMeta]) : new Set<string>()),
    [importMeta]
  )

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
  const driverIndex = replayIndex
  const displayIndex = scrubIndex ?? driverIndex
  const timestepLocked = syncTimestepWithChart || busy
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

  async function onJump(event: FormEvent, close: () => void): Promise<void> {
    event.preventDefault()
    setJumpError(null)

    if (!jumpDate || !jumpTime) {
      setJumpError(t('replay.jumpPickDayTime'))
      return
    }
    if (coverageDays.size > 0 && !isDayCovered(coverageDays, jumpDate)) {
      setJumpError(t('replay.jumpNoData'))
      return
    }

    const seconds = parseSessionParts(jumpDate, jumpTime, timezone)
    if (seconds == null) {
      setJumpError(t('replay.jumpInvalid'))
      return
    }

    const result = await jumpToTime(seconds, { source: 'jump' })
    if (result === 'applied' || result === 'needs-confirm') close()
    else if (result === 'noop') setJumpError(t('replay.jumpOutside'))
  }

  async function goToSession(kind: ForexGoToKind, close: () => void): Promise<void> {
    setJumpError(null)
    const result = await jumpToForexGoTo(kind)
    if (result === 'applied' || result === 'needs-confirm') close()
    else setJumpError(t('replay.noNextSession'))
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

      <div className="flex items-center gap-1">
        <Tooltip text={t('replay.timestepSingleTip')} side="top">
          <label
            className={`inline-flex h-8 items-center gap-1.5 rounded-xl border bg-zinc-900/80 px-2 text-xs text-zinc-300 ${
              timestepLocked ? 'border-zinc-800/80 opacity-80' : 'border-zinc-800'
            }`}
            title={t('replay.timestepTip')}
          >
            <span className="text-zinc-500">{t('replay.next')}</span>
            <select
              disabled={timestepLocked}
              aria-label={t('replay.timestepTip')}
              value={replayTimestep}
              onChange={(event) => {
                setReplayTimestep(event.target.value)
                event.currentTarget.blur()
              }}
              className="max-w-[4.5rem] rounded bg-transparent font-medium text-primary-300 outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {Object.keys(TIMEFRAMES).map((id) => (
                <option key={id} value={id} className="bg-zinc-900 text-zinc-100">
                  {TIMEFRAMES[id]?.label ?? id}
                </option>
              ))}
            </select>
          </label>
        </Tooltip>
        <Tooltip text={syncTimestepWithChart ? t('replay.syncTip') : t('replay.syncOffTip')} side="top">
          <button
            type="button"
            disabled={busy}
            onClick={(event) => {
              setSyncTimestepWithChart(!syncTimestepWithChart)
              event.currentTarget.blur()
            }}
            aria-label={t('replay.syncWithChart')}
            aria-pressed={syncTimestepWithChart}
            className={`inline-flex h-8 items-center gap-1 rounded-xl border px-2 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              syncTimestepWithChart
                ? 'border-emerald-900/60 bg-emerald-950/40 text-emerald-300'
                : 'border-zinc-800 bg-zinc-900/80 text-zinc-400 enabled:hover:border-emerald-800 enabled:hover:text-emerald-300'
            }`}
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            {syncTimestepWithChart ? t('replay.syncOn') : t('replay.sync')}
          </button>
        </Tooltip>
      </div>

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
        openSignal={jumpMenuRequestId}
        trigger={({ open, toggle }) => (
          <IconButton
            tooltip={open ? undefined : t('replay.jumpTooltip')}
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
        {({ close }) => (
          <div
            className="flex w-[min(22rem,calc(100vw-2rem))] flex-col py-0.5"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="px-3 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
              {t('replay.goToMenu')}
            </span>
            {GO_TO_ITEMS.map((item) => (
              <button
                key={item.kind}
                type="button"
                role="menuitem"
                disabled={busy || currentCandle == null}
                onClick={() => void goToSession(item.kind, close)}
                className="flex w-full items-center gap-3 px-3 py-1.5 text-left text-xs text-zinc-200 transition-colors enabled:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="flex-1">{t(item.label)}</span>
                <span className="text-[10px] text-zinc-500">{item.shortcut}</span>
              </button>
            ))}
            <div className="my-1 h-px bg-zinc-800" />
            <form
              onSubmit={(event) => void onJump(event, close)}
              className="flex flex-col gap-1.5 px-2 pb-1"
            >
              <span className="px-1 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                {t('replay.goToCustom')} · {timezoneTitle}
              </span>
              {coverageDays.size > 0 ? (
                <div className="flex items-center gap-1.5">
                  <DateCoveragePopover
                    mode="pick"
                    coverageDays={coverageDays}
                    selectedDay={jumpDate}
                    initialMonth={jumpDate ? jumpDate.slice(0, 7) : undefined}
                    placeholder={t('replay.jumpPickDate')}
                    ariaLabel={t('replay.jumpPickDate')}
                    disabled={busy}
                    className="min-w-0 flex-1"
                    onSelectDay={(day) => {
                      setJumpError(null)
                      setJumpDate(day)
                    }}
                  />
                  <input
                    type="time"
                    value={jumpTime}
                    disabled={busy}
                    aria-label={t('replay.goToCustom')}
                    onChange={(e) => setJumpTime(e.target.value)}
                    className="h-9 w-[5.75rem] shrink-0 rounded-xl border border-zinc-800 bg-zinc-900 px-1.5 text-xs text-zinc-300 disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-primary-500 px-2.5 text-xs font-medium text-white transition-colors enabled:hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t('replay.jumpAction')}
                  </button>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-zinc-800 px-2 py-3 text-center text-[11px] text-zinc-500">
                  {t('replay.jumpNoCoverage')}
                </p>
              )}
              {jumpError && <span className="px-1 text-xs text-red-400">{jumpError}</span>}
            </form>
          </div>
        )}
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
        description={
          pendingSeekConfirm?.source === 'replay-to'
            ? t('replay.seekDiscardBodyReplayTo')
            : pendingSeekConfirm?.source === 'scrub'
              ? t('replay.seekDiscardBodyScrub')
              : t('replay.seekDiscardBodyJump')
        }
        confirmLabel={t('replay.seekDiscardConfirm')}
        cancelLabel={t('common.cancel')}
        danger
        onConfirm={confirmPendingSeek}
        onCancel={cancelPendingSeek}
      />
    </div>
  )
}
