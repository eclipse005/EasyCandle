import { useEffect } from 'react'
import { FOREX_GO_TO_SHORTCUTS, jumpToForexGoTo } from '@/lib/forexGoTo'
import { stepReplaySpeed } from '@/lib/replayEngine'
import { useReplayStore } from '@/store/replayStore'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
}

/**
 * Replay keyboard shortcuts:
 * - Space → play/pause
 * - ArrowRight → step forward by shared Timestep
 * - ArrowLeft → step backward by shared Timestep
 * - + / = → faster playback
 * - - / _ → slower playback
 * - Y / Z / N / I / L → FX Replay go-to (day open, next session, New York, Asian, London)
 */
export function useReplayHotkeys(): void {
  const mode = useReplayStore((s) => s.mode)
  const play = useReplayStore((s) => s.play)
  const pause = useReplayStore((s) => s.pause)
  const stepForward = useReplayStore((s) => s.stepForward)
  const stepBackward = useReplayStore((s) => s.stepBackward)
  const setSpeed = useReplayStore((s) => s.setSpeed)

  useEffect(() => {
    if (mode !== 'replay') return undefined

    let pendingDir: 0 | 1 | -1 = 0
    let raf = 0

    function flushStep(): void {
      raf = 0
      const dir = pendingDir
      pendingDir = 0
      if (dir === 1) stepForward()
      else if (dir === -1) stepBackward()
    }

    function scheduleStep(dir: 1 | -1): void {
      pendingDir = dir
      if (raf) return
      raf = requestAnimationFrame(flushStep)
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (isEditableTarget(event.target)) return

      const state = useReplayStore.getState()
      if (state.mode !== 'replay') return

      if (event.key === 'ArrowLeft') {
        if (state.replayLoading || state.secondaryLoading) return
        if (state.replayIndex <= 0) return

        event.preventDefault()
        scheduleStep(-1)
        return
      }

      if (event.key === 'ArrowRight') {
        if (state.replayLoading || state.secondaryLoading) return
        if (state.replayStatus === 'ended') return

        event.preventDefault()
        scheduleStep(1)
        return
      }

      if (event.key === '+' || event.key === '=') {
        if (event.repeat) return
        event.preventDefault()
        setSpeed(stepReplaySpeed(state.speed, 1))
        return
      }

      if (event.key === '-' || event.key === '_') {
        if (event.repeat) return
        event.preventDefault()
        setSpeed(stepReplaySpeed(state.speed, -1))
        return
      }

      if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
        const goTo = FOREX_GO_TO_SHORTCUTS[event.key.toLowerCase()]
        if (goTo) {
          if (document.querySelector('[role="dialog"]')) return
          if (state.replayLoading || state.secondaryLoading) return
          event.preventDefault()
          void jumpToForexGoTo(goTo)
          return
        }
      }

      if (event.code !== 'Space' && event.key !== ' ') return
      if (event.repeat) return
      if (state.replayLoading || state.secondaryLoading) return

      event.preventDefault()

      if (state.isPlaying) {
        pause()
        return
      }

      if (state.replayStatus === 'ended') return
      play()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [mode, play, pause, stepForward, stepBackward, setSpeed])
}
