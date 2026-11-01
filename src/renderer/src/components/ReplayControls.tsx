import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement
} from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  Pause,
  Play,
  SkipBack,
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

import { coverageDaysFromMetas, isDayCovered } from '@shared/dateCoverage'
import type { ForexGoToKind } from '@shared/forexSession'
import { TIMEFRAMES } from '@shared/timeframes'
import type { MessageKey } from '@/i18n/messages'
import { jumpToForexGoTo } from '@/lib/forexGoTo'
import { MAX_REPLAY_SPEED, MIN_REPLAY_SPEED, replayCandlesPerSecond } from '@/lib/replayEngine'
import { useChartSettingsStore } from '@/store/chartSettingsStore'
import { useDrawingUiStore } from '@/store/drawingUiStore'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { useT } from '@/i18n/useT'

function TimestepMenu({
  busy,
  value,
  synced,
  onSync,
  onChange,
  syncTip
}: {
  busy: boolean
  value: string
  synced: boolean
  onSync: (on: boolean) => void
  onChange: (id: string) => void
  syncTip: string
}): ReactElement {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [above, setAbove] = useState(true)
  const rootRef = useRef<HTMLDivElement>(null)
  const label = TIMEFRAMES[value]?.label ?? value

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event: PointerEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return
    setAbove(rect.top > 280)
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={busy}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('replay.timestepTip')}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-sm font-medium text-zinc-100 hover:bg-white/[0.06] disabled:opacity-40"
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
      </button>
      {open ? (
        <div
          className={`absolute left-1/2 z-[70] w-64 -translate-x-1/2 rounded-xl border border-white/10 bg-zinc-950 py-2 shadow-xl shadow-black/50 ${
            above ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          <div className="flex items-center gap-2 px-3 py-1.5">
            <span className="min-w-0 flex-1 text-sm text-zinc-100">{t('replay.syncWithChart')}</span>
            <Tooltip text={syncTip} side="top">
              <Info className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
            </Tooltip>
            <Switch
              checked={synced}
              label={t('replay.syncWithChart')}
              onChange={() => onSync(!synced)}
            />
          </div>
          <div className="my-1 h-px bg-white/10" />
          <div className="max-h-52 overflow-y-auto py-1">
            {Object.keys(TIMEFRAMES).map((id) => {
              const selected = id === value
              return (
                <button
                  key={id}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    onChange(id)
                    setOpen(false)
                  }}
                  className={`flex w-full px-3 py-1.5 text-left text-sm disabled:opacity-40 ${
                    selected ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  {TIMEFRAMES[id]?.label ?? id}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Switch({
  checked,
  label,
  onChange
}: {
  checked: boolean
  label: string
  onChange: () => void
}): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-emerald-500' : 'bg-zinc-600'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? 'left-4' : 'left-0.5'
        }`}
      />
    </button>
  )
}

function SpeedSlider({
  value,
  onChange
}: {
  value: number
  onChange: (speed: number) => void
}): ReactElement {
  const { t } = useT()
  const trackRef = useRef<HTMLDivElement>(null)
  const recentTimer = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [recent, setRecent] = useState(false)

  const clamped = Math.min(MAX_REPLAY_SPEED, Math.max(MIN_REPLAY_SPEED, Math.round(value)))
  const pct = ((clamped - MIN_REPLAY_SPEED) / (MAX_REPLAY_SPEED - MIN_REPLAY_SPEED)) * 100
  const showTip = hovered || dragging || focused || recent
  const tip = t('replay.speedPerSec', { n: replayCandlesPerSecond(clamped) })

  useEffect(
    () => () => {
      if (recentTimer.current != null) window.clearTimeout(recentTimer.current)
    },
    []
  )

  function commit(next: number): void {
    const speed = Math.min(MAX_REPLAY_SPEED, Math.max(MIN_REPLAY_SPEED, Math.round(next)))
    if (speed !== clamped) onChange(speed)
    setRecent(true)
    if (recentTimer.current != null) window.clearTimeout(recentTimer.current)
    recentTimer.current = window.setTimeout(() => setRecent(false), 1200)
  }

  function speedFromClientX(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return clamped
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)))
    return MIN_REPLAY_SPEED + Math.round(ratio * (MAX_REPLAY_SPEED - MIN_REPLAY_SPEED))
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDragging(true)
    commit(speedFromClientX(event.clientX))
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragging) return
    commit(speedFromClientX(event.clientX))
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragging) return
    setDragging(false)
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    let next = clamped
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = clamped - 1
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = clamped + 1
    else if (event.key === 'Home') next = MIN_REPLAY_SPEED
    else if (event.key === 'End') next = MAX_REPLAY_SPEED
    else return
    event.preventDefault()
    commit(next)
  }

  return (
    <div
      className="relative flex h-8 w-28 shrink-0 items-center px-1.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-valuemin={MIN_REPLAY_SPEED}
        aria-valuemax={MAX_REPLAY_SPEED}
        aria-valuenow={clamped}
        aria-label={t('replay.speedAria')}
        aria-valuetext={tip}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="relative h-5 w-full cursor-ew-resize touch-none select-none rounded-full outline-none focus-visible:ring-1 focus-visible:ring-primary-400"
      >
        {showTip ? (
          <span
            className="pointer-events-none absolute -top-6 z-[2] -translate-x-1/2 whitespace-nowrap rounded-full bg-primary-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-lg shadow-black/40"
            style={{ left: `${pct}%` }}
          >
            {tip}
          </span>
        ) : null}
        <span className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-zinc-700" />
        <span
          className="pointer-events-none absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary-400"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
        <span
          className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-400 shadow shadow-black/40"
          style={{ left: `${pct}%` }}
          aria-hidden
        />
      </div>
    </div>
  )
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
  const setSpeed = useReplayStore((s) => s.setSpeed)
  const rewindPick = useReplayStore((s) => s.rewindPick)
  const setRewindPick = useReplayStore((s) => s.setRewindPick)
  const armedTool = useDrawingUiStore((s) => s.armedTool)
  const replayIndex = useReplayStore((s) => s.replayIndex)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const secondaryLoading = useReplayStore((s) => s.secondaryLoading)
  const currentCandle = useReplayStore((s) => s.currentCandle)
  const play = useReplayStore((s) => s.play)
  const pause = useReplayStore((s) => s.pause)
  const stepForward = useReplayStore((s) => s.stepForward)
  const stepBackward = useReplayStore((s) => s.stepBackward)
  const replayTimestep = useReplayStore((s) => s.replayTimestep)
  const syncTimestepWithChart = useReplayStore((s) => s.syncTimestepWithChart)
  const setReplayTimestep = useReplayStore((s) => s.setReplayTimestep)
  const setSyncTimestepWithChart = useReplayStore((s) => s.setSyncTimestepWithChart)
  const jumpToTime = useReplayStore((s) => s.jumpToTime)
  const confirmPendingSeek = useReplayStore((s) => s.confirmPendingSeek)
  const cancelPendingSeek = useReplayStore((s) => s.cancelPendingSeek)
  const pendingSeekConfirm = useReplayStore((s) => s.pendingSeekConfirm)
  const jumpMenuRequestId = useUiLayoutStore((s) => s.jumpMenuRequestId)
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

  const busy = replayLoading || secondaryLoading
  const ended = replayStatus === 'ended'
  const driverIndex = replayIndex

  useEffect(() => {
    if (armedTool && useReplayStore.getState().rewindPick) {
      useReplayStore.getState().setRewindPick(false)
    }
  }, [armedTool])

  useEffect(
    () => () => {
      useReplayStore.getState().setRewindPick(false)
    },
    []
  )

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
    <div className="flex items-center gap-1">
      <IconButton
        tooltip={t('replay.rewindPickTip')}
        active={rewindPick}
        pressed={rewindPick}
        disabled={busy}
        tooltipSide="top"
        onClick={() => {
          const next = !rewindPick
          if (next) {
            useDrawingUiStore.getState().setArmedTool(null)
            if (isPlaying) pause()
          }
          setRewindPick(next)
        }}
      >
        <SkipBack className="h-4 w-4" />
      </IconButton>
      <SpeedSlider value={speed} onChange={setSpeed} />
      <div className="flex items-center gap-1">
        {!isPlaying ? (
          <IconButton
            tooltip={t('replay.play')}
            disabled={busy || ended}
            onClick={play}
            tooltipSide="top"
            shortcut={['Space']}
          >
            <Play className="h-4 w-4 fill-current" />
          </IconButton>
        ) : (
          <IconButton
            tooltip={t('replay.pause')}
            shortcut={['Space']}
            disabled={busy}
            onClick={pause}
            tooltipSide="top"
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
          <ChevronLeft className="h-4 w-4" />
        </IconButton>

        <IconButton
          tooltip={t('replay.stepForward')}
          shortcut={['ArrowRight']}
          disabled={busy || ended}
          onClick={stepForward}
          tooltipSide="top"
        >
          <ChevronRight className="h-4 w-4" />
        </IconButton>
      </div>

      <TimestepMenu
        busy={busy}
        value={replayTimestep}
        synced={syncTimestepWithChart}
        onSync={setSyncTimestepWithChart}
        onChange={(id) => {
          setSyncTimestepWithChart(false)
          setReplayTimestep(id)
        }}
        syncTip={syncTimestepWithChart ? t('replay.syncTip') : t('replay.syncOffTip')}
      />

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
