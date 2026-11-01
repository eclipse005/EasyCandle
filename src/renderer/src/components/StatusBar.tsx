import type { ReactNode } from 'react'
import { BadgeInfo, Circle, LoaderCircle } from 'lucide-react'
import { formatSessionCandleTime } from '@/lib/chartTimezone'
import type { MessageKey } from '@/i18n/messages'
import type { ReplayStatus } from '@/lib/replayEngine'
import { useChartSettingsStore } from '@/store/chartSettingsStore'
import { useReplayStore } from '@/store/replayStore'
import { useT } from '@/i18n/useT'
import { isMetatraderImport } from '@shared/importTypes'
import Tooltip from '@/components/Tooltip'

const SEPARATOR = ' · '

const REPLAY_LABELS: Record<ReplayStatus, MessageKey> = {
  idle: 'status.idle',
  ready: 'status.ready',
  playing: 'status.playing',
  paused: 'status.paused',
  ended: 'status.ended'
}

function splitMessage(message: string | null): { mode: string | undefined; text: string } {
  if (!message) return { mode: undefined, text: '' }
  const [mode, ...rest] = message.split(SEPARATOR)
  return { mode, text: rest.join(SEPARATOR) }
}

function compact(parts: Array<string | null>): string[] {
  return parts.filter((part): part is string => Boolean(part))
}

function StatusPill({ tone, children }: { tone: 'default' | 'warn'; children: ReactNode }) {
  const toneClass = tone === 'warn' ? 'text-amber-400/90' : 'text-zinc-400'
  return (
    <span className={`inline-flex items-center gap-1.5 bg-zinc-950 p-1.5 font-medium tabular-nums ${toneClass}`}>
      {children}
    </span>
  )
}

function StatusDot({ isPlaying, ended }: { isPlaying: boolean; ended: boolean }) {
  const dotClass = isPlaying ? 'text-emerald-400' : ended ? 'text-amber-400' : 'text-zinc-600'
  return <Circle className={`h-2 w-2 fill-current ${dotClass}`} aria-hidden />
}

function ReplayStatus() {
  const { t } = useT()
  const replayStatus = useReplayStore((s) => s.replayStatus)
  const isPlaying = useReplayStore((s) => s.isPlaying)
  const speed = useReplayStore((s) => s.speed)
  const replayIndex = useReplayStore((s) => s.replayIndex)
  const bufferLength = useReplayStore((s) => s.bufferLength)
  const currentCandle = useReplayStore((s) => s.currentCandle)
  const isPrefetching = useReplayStore((s) => s.isPrefetching)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const replayMessage = useReplayStore((s) => s.replayMessage)
  const dataSource = useReplayStore((s) => s.dataSource)
  const importMeta = useReplayStore((s) => s.importMeta)
  const timezone = useChartSettingsStore((s) => s.timezone)
  const imported = dataSource === 'imported'
  const mtFeed = isMetatraderImport(importMeta)

  const ended = replayStatus === 'ended'
  const busy = replayLoading || isPrefetching
  const speedLabel = isPlaying ? `(${speed}x)` : null
  const details = compact([
    imported ? (mtFeed ? t('status.metaTrader') : t('status.imported')) : null,
    isPlaying ? `${speed}x` : null,
    formatSessionCandleTime(currentCandle?.time, timezone),
    bufferLength > 0 ? `${replayIndex + 1}/${bufferLength}` : '0/0'
  ])
  const { mode, text } = splitMessage(replayMessage)

  return (
    <div className="ml-auto flex min-w-0 items-center gap-1 text-[11px] text-zinc-500">
      <Tooltip text={details.join(SEPARATOR)} side="bottom">
        <StatusPill tone={ended ? 'warn' : 'default'}>
          <StatusDot isPlaying={isPlaying} ended={ended} />
          {t(REPLAY_LABELS[replayStatus])} {speedLabel}
          {busy && <LoaderCircle className="h-3 w-3 animate-spin text-zinc-500" aria-hidden />}
        </StatusPill>
      </Tooltip>

      {ended && !replayMessage && (
        <span className="text-amber-400/80">
          {imported ? t('status.endImported') : t('status.endBuffer')}
        </span>
      )}

      {replayMessage && (
        <Tooltip text={text} side="bottom">
          <StatusPill tone="warn">
            <span className="max-w-full truncate capitalize">{mode}</span>
            <BadgeInfo className="h-3 w-3" strokeWidth={3} />
          </StatusPill>
        </Tooltip>
      )}
    </div>
  )
}

export default function StatusBar() {
  return <ReplayStatus />
}
