import { Minus, Plus } from 'lucide-react'
import IconButton from '@/components/IconButton'
import { clampRiskReward, formatRiskReward } from '@/lib/paperTrade'
import { useT } from '@/i18n/useT'
import { useReplayStore } from '@/store/replayStore'

const RR_PRESETS = [1, 1.5, 2, 3] as const
const RR_STEP = 0.5

export default function RiskRewardControl({
  displayRr,
  manualLevels
}: {
  displayRr?: number | null
  manualLevels?: boolean
}) {
  const { t } = useT()
  const riskReward = useReplayStore((s) => s.riskReward)
  const setRiskReward = useReplayStore((s) => s.setRiskReward)
  const shownRr = manualLevels && displayRr != null ? displayRr : riskReward
  const rrLabel = formatRiskReward(shownRr)
  const atMin = riskReward <= 0.5
  const atMax = riskReward >= 20

  return (
    <div
      className="flex flex-col gap-1 rounded-xl border border-white/10 bg-zinc-900/60 px-1.5 py-1"
      title={t('ticket.rrGuide')}
    >
      <div className="flex items-center gap-1">
        <span className="px-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
          R:R
        </span>
        <IconButton
          tooltip={t('ticket.decreaseRr')}
          disabled={atMin}
          onClick={() => setRiskReward(riskReward - RR_STEP)}
          className="!h-6 !w-6"
        >
          <Minus className="h-3 w-3" />
        </IconButton>
        <span className="min-w-0 flex-1 text-center text-xs font-semibold tabular-nums text-zinc-200">
          {rrLabel}
        </span>
        <IconButton
          tooltip={t('ticket.increaseRr')}
          disabled={atMax}
          onClick={() => setRiskReward(riskReward + RR_STEP)}
          className="!h-6 !w-6"
        >
          <Plus className="h-3 w-3" />
        </IconButton>
      </div>
      <div className="flex gap-0.5">
        {RR_PRESETS.map((preset) => {
          const active = Math.abs(shownRr - preset) < 0.001
          return (
            <button
              key={preset}
              type="button"
              title={t('ticket.setRr', { rr: formatRiskReward(preset) })}
              aria-label={t('ticket.setRr', { rr: formatRiskReward(preset) })}
              aria-pressed={active}
              onClick={() => setRiskReward(clampRiskReward(preset))}
              className={`h-6 min-w-0 flex-1 rounded text-[10px] font-semibold tabular-nums transition-colors ${
                active
                  ? 'bg-primary-950/50 text-primary-300 ring-1 ring-inset ring-primary-500/60'
                  : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              {preset}
            </button>
          )
        })}
      </div>
    </div>
  )
}
