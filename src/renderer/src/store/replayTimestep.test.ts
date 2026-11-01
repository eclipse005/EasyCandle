import { describe, expect, it } from 'vitest'
import { DEFAULT_TIMEFRAME } from '@shared/timeframes'
import { useReplayStore } from '@/store/replayStore'

function resetTimestepState(): void {
  useReplayStore.setState({
    timeframe: '15m',
    replayTimestep: '15m',
    syncTimestepWithChart: true,
    mode: 'live'
  })
}

describe('replayTimestep sync setters', () => {
  it('defaults Sync on with Timestep matching default chart TF', () => {
    const s = useReplayStore.getState()
    expect(s.syncTimestepWithChart).toBe(true)
    expect(typeof s.replayTimestep).toBe('string')
    expect(s.replayTimestep).toBe(s.timeframe || DEFAULT_TIMEFRAME)
  })

  it('ignores setReplayTimestep while Sync is on', () => {
    resetTimestepState()
    useReplayStore.getState().setReplayTimestep('1h')
    expect(useReplayStore.getState().replayTimestep).toBe('15m')
  })

  it('allows independent Timestep when Sync is off', () => {
    resetTimestepState()
    useReplayStore.getState().setSyncTimestepWithChart(false)
    useReplayStore.getState().setReplayTimestep('1h')
    expect(useReplayStore.getState().syncTimestepWithChart).toBe(false)
    expect(useReplayStore.getState().replayTimestep).toBe('1h')
  })

  it('snaps Timestep to chart TF when Sync turns on', () => {
    resetTimestepState()
    useReplayStore.setState({ syncTimestepWithChart: false, replayTimestep: '1h', timeframe: '4h' })
    useReplayStore.getState().setSyncTimestepWithChart(true)
    expect(useReplayStore.getState().syncTimestepWithChart).toBe(true)
    expect(useReplayStore.getState().replayTimestep).toBe('4h')
  })

  it('leaves Timestep alone when chart TF state changes while Sync is off', () => {
    resetTimestepState()
    useReplayStore.getState().setSyncTimestepWithChart(false)
    useReplayStore.getState().setReplayTimestep('1h')
    // Simulate chart TF change without going through async loaders.
    useReplayStore.setState({ timeframe: '15m' })
    expect(useReplayStore.getState().replayTimestep).toBe('1h')
  })
})

describe('replayTimestep hydrate / session restore', () => {
  it('snaps Timestep to chart TF when Sync is on and fields disagree', () => {
    resetTimestepState()
    // Simulate persisted/restored mismatch: chart 1h, Timestep still 15m, Sync ON.
    useReplayStore.setState({
      timeframe: '1h',
      replayTimestep: '15m',
      syncTimestepWithChart: true
    })
    useReplayStore.getState().ensureReplayTimestepAligned()
    expect(useReplayStore.getState().replayTimestep).toBe('1h')
    expect(useReplayStore.getState().syncTimestepWithChart).toBe(true)
  })

  it('leaves Timestep alone on hydrate when Sync is off', () => {
    resetTimestepState()
    useReplayStore.setState({
      timeframe: '1h',
      replayTimestep: '15m',
      syncTimestepWithChart: false
    })
    useReplayStore.getState().ensureReplayTimestepAligned()
    expect(useReplayStore.getState().replayTimestep).toBe('15m')
  })
})
