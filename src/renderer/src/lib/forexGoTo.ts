import { nextForexGoTo, type ForexGoToKind } from '@shared/forexSession'
import { useReplayStore, type SeekApplyResult } from '@/store/replayStore'

/** FX Replay go-to shortcuts. Plain letters only; Alt+I stays invert-scale. */
export const FOREX_GO_TO_SHORTCUTS: Record<string, ForexGoToKind> = {
  y: 'dayOpen',
  z: 'nextSession',
  n: 'newYork',
  i: 'asian',
  l: 'london'
}

/** Jump the playhead to the next FX Replay session clock (New York). */
export async function jumpToForexGoTo(kind: ForexGoToKind): Promise<SeekApplyResult> {
  const state = useReplayStore.getState()
  if (state.mode !== 'replay') return 'noop'
  if (state.replayLoading || state.secondaryLoading) return 'noop'
  const from = state.currentCandle?.time
  if (from == null || !Number.isFinite(from)) return 'noop'
  const target = nextForexGoTo(from, kind)
  if (target == null) return 'noop'
  return state.jumpToTime(target, { source: 'jump' })
}
