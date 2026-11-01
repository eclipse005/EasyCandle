import { describe, expect, it } from 'vitest'
import {
  alignTimeToInterval,
  coarserTouchedCover,
  defaultSecondaryTimeframe,
  followerPlayheadCover,
  playheadCoverEnd,
  resolveTimestepAfterChartTfChange,
  resolveTimestepOnSyncEnable,
  timestepStepCoverEnd,
  TIMEFRAMES
} from './timeframes'

describe('playheadCoverEnd', () => {
  it('covers five 1m opens inside one 5m candle', () => {
    const open = alignTimeToInterval(1_700_000_000, TIMEFRAMES['5m'].seconds)
    const cover = playheadCoverEnd(open, TIMEFRAMES['5m'].seconds)
    const first = alignTimeToInterval(open, 60)
    const last = alignTimeToInterval(cover, 60)
    expect((last - first) / 60 + 1).toBe(5)
  })

  it('keeps a coarser follower on the same bar while finer TF steps inside it', () => {
    const fiveOpen = alignTimeToInterval(1_700_000_000, TIMEFRAMES['5m'].seconds)
    const oneOpen = fiveOpen + 60 * 2
    const cover = playheadCoverEnd(oneOpen, TIMEFRAMES['1m'].seconds)
    expect(alignTimeToInterval(cover, TIMEFRAMES['5m'].seconds)).toBe(fiveOpen)
  })
})

describe('followerPlayheadCover', () => {
  it('reveals every finer follower bar covered by a coarser driver', () => {
    const fiveOpen = alignTimeToInterval(1_700_000_000, TIMEFRAMES['5m'].seconds)
    expect(
      followerPlayheadCover(fiveOpen, TIMEFRAMES['5m'].seconds, TIMEFRAMES['1m'].seconds)
    ).toBe(playheadCoverEnd(fiveOpen, TIMEFRAMES['5m'].seconds))
  })

  it('reveals a coarser follower as soon as any finer bar of that period plays', () => {
    const hourOpen = alignTimeToInterval(1_700_000_000, TIMEFRAMES['1h'].seconds)
    const firstFive = hourOpen
    const midFive = hourOpen + TIMEFRAMES['5m'].seconds * 6
    const lastFive = hourOpen + TIMEFRAMES['5m'].seconds * 11
    const hourEnd = playheadCoverEnd(hourOpen, TIMEFRAMES['1h'].seconds)

    expect(
      followerPlayheadCover(firstFive, TIMEFRAMES['5m'].seconds, TIMEFRAMES['1h'].seconds)
    ).toBe(hourEnd)
    expect(
      followerPlayheadCover(midFive, TIMEFRAMES['5m'].seconds, TIMEFRAMES['1h'].seconds)
    ).toBe(hourEnd)
    expect(
      followerPlayheadCover(lastFive, TIMEFRAMES['5m'].seconds, TIMEFRAMES['1h'].seconds)
    ).toBe(hourEnd)
  })

  it('reveals the coarser bar that contains a mid-period touch', () => {
    const hourOpen = alignTimeToInterval(1_700_000_000, TIMEFRAMES['1h'].seconds)
    const midFive = hourOpen + TIMEFRAMES['5m'].seconds * 4
    expect(coarserTouchedCover(midFive, TIMEFRAMES['1h'].seconds)).toBe(
      playheadCoverEnd(hourOpen, TIMEFRAMES['1h'].seconds)
    )
  })

  it('reveals a 15m follower on the first 5m bar of that period', () => {
    const fifteenOpen = alignTimeToInterval(1_700_000_000, TIMEFRAMES['15m'].seconds)
    const firstFive = fifteenOpen
    const lastFive = fifteenOpen + TIMEFRAMES['5m'].seconds * 2
    const fifteenEnd = playheadCoverEnd(fifteenOpen, TIMEFRAMES['15m'].seconds)

    expect(
      followerPlayheadCover(firstFive, TIMEFRAMES['5m'].seconds, TIMEFRAMES['15m'].seconds)
    ).toBe(fifteenEnd)
    expect(
      followerPlayheadCover(lastFive, TIMEFRAMES['5m'].seconds, TIMEFRAMES['15m'].seconds)
    ).toBe(fifteenEnd)
  })
})

describe('defaultSecondaryTimeframe', () => {
  it('pairs 1m with 5m and other TFs with 1m', () => {
    expect(defaultSecondaryTimeframe('1m')).toBe('5m')
    expect(defaultSecondaryTimeframe('15m')).toBe('1m')
  })
})

describe('timestepStepCoverEnd', () => {
  it('advances one chart bar when Timestep matches chart TF', () => {
    const open = alignTimeToInterval(1_700_000_000, TIMEFRAMES['15m'].seconds)
    const next = timestepStepCoverEnd(
      open,
      TIMEFRAMES['15m'].seconds,
      TIMEFRAMES['15m'].seconds,
      1
    )
    expect(next).toBe(playheadCoverEnd(open + TIMEFRAMES['15m'].seconds, TIMEFRAMES['15m'].seconds))
  })

  it('jumps a 15m chart to the end of the current 1h Timestep', () => {
    const hourOpen = alignTimeToInterval(1_700_000_000, TIMEFRAMES['1h'].seconds)
    const mid = hourOpen + TIMEFRAMES['15m'].seconds
    const cover = timestepStepCoverEnd(
      mid,
      TIMEFRAMES['15m'].seconds,
      TIMEFRAMES['1h'].seconds,
      1
    )
    expect(cover).toBe(playheadCoverEnd(hourOpen, TIMEFRAMES['1h'].seconds))
  })

  it('after completing a 1h Timestep on 15m, advances to the next hour', () => {
    const hourOpen = alignTimeToInterval(1_700_000_000, TIMEFRAMES['1h'].seconds)
    const lastFifteen = hourOpen + TIMEFRAMES['15m'].seconds * 3
    const cover = timestepStepCoverEnd(
      lastFifteen,
      TIMEFRAMES['15m'].seconds,
      TIMEFRAMES['1h'].seconds,
      1
    )
    expect(cover).toBe(playheadCoverEnd(hourOpen + TIMEFRAMES['1h'].seconds, TIMEFRAMES['1h'].seconds))
  })

  it('steps backward one Timestep from an equal TF bar', () => {
    const open = alignTimeToInterval(1_700_000_000, TIMEFRAMES['1h'].seconds)
    const nextOpen = open + TIMEFRAMES['1h'].seconds
    const back = timestepStepCoverEnd(
      nextOpen,
      TIMEFRAMES['1h'].seconds,
      TIMEFRAMES['1h'].seconds,
      -1
    )
    expect(back).toBe(playheadCoverEnd(open, TIMEFRAMES['1h'].seconds))
  })
})

describe('resolveTimestepAfterChartTfChange', () => {
  it('mirrors chart TF when Sync is on', () => {
    expect(
      resolveTimestepAfterChartTfChange({
        syncTimestepWithChart: true,
        chartTimeframe: '15m',
        replayTimestep: '1h'
      })
    ).toBe('15m')
  })

  it('keeps Timestep when Sync is off', () => {
    expect(
      resolveTimestepAfterChartTfChange({
        syncTimestepWithChart: false,
        chartTimeframe: '15m',
        replayTimestep: '1h'
      })
    ).toBe('1h')
  })
})

describe('resolveTimestepOnSyncEnable', () => {
  it('snaps Timestep to the chart TF', () => {
    expect(resolveTimestepOnSyncEnable('4h')).toBe('4h')
  })
})
