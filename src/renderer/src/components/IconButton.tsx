import { memo, type MouseEvent, type ReactNode } from 'react'
import Tooltip from '@/components/Tooltip'

type IconButtonProps = {
  tooltip?: string
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  active?: boolean
  tone?: 'default' | 'accent' | 'danger' | 'success'
  type?: 'button' | 'submit'
  children: ReactNode
  className?: string
  /** Keyboard shortcut(s) shown as <kbd> in the tooltip. */
  shortcut?: string[]
  /** Tooltip placement relative to the button. Defaults to 'bottom'. */
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right'
  /** ghost = borderless hover-fill, used by the drawing rail. */
  variant?: 'default' | 'ghost'
  /** When set, the button is a toggle and exposes aria-pressed. */
  pressed?: boolean
  /** Stable selector for the first-run app tour spotlight. */
  dataTour?: string
}

export default memo(function IconButton({
  tooltip,
  onClick,
  disabled = false,
  active = false,
  tone = 'default',
  type = 'button',
  children,
  className = '',
  shortcut,
  tooltipSide = 'bottom',
  variant = 'default',
  pressed,
  dataTour
}: IconButtonProps) {
  const ghost = variant === 'ghost'

  const toneClass = ghost
    ? tone === 'danger'
      ? 'enabled:hover:bg-red-950/70 enabled:hover:text-red-300'
      : 'enabled:hover:bg-zinc-800 enabled:hover:text-zinc-100'
    : tone === 'accent'
      ? 'enabled:hover:border-primary-400 enabled:hover:bg-primary-400 enabled:hover:text-white'
      : tone === 'danger'
        ? 'enabled:hover:border-red-500/60 enabled:hover:text-red-300'
        : tone === 'success'
          ? 'enabled:hover:border-emerald-500/60 enabled:hover:text-emerald-300'
          : 'enabled:hover:border-zinc-500 enabled:hover:text-zinc-100'

  let activeClass: string
  if (ghost) {
    if (active) {
      activeClass =
        tone === 'danger' ? 'bg-red-950/70 text-red-300' : 'bg-zinc-800 text-primary-300'
    } else {
      activeClass = 'bg-transparent text-zinc-400'
    }
  } else if (tone === 'accent') {
    // Primary blue chrome for play / primary actions (FX Replay accent).
    activeClass = active
      ? 'border-primary-500 bg-primary-500 text-white'
      : 'border-primary-500/80 bg-primary-500/90 text-white'
  } else if (active) {
    if (tone === 'success') {
      activeClass = 'border-emerald-500/70 bg-emerald-950/50 text-emerald-300'
    } else if (tone === 'danger') {
      activeClass = 'border-red-500/70 bg-red-950/50 text-red-300'
    } else {
      activeClass = 'border-primary-500/70 bg-primary-950/50 text-primary-300'
    }
  } else {
    activeClass = 'border-white/10 bg-zinc-900/80 text-zinc-300'
  }

  const chrome = ghost ? 'rounded-lg border-0' : 'rounded-lg border'

  const button = (
    <button
      type={type}
      aria-label={tooltip}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      data-tour={dataTour}
      className={`inline-flex shrink-0 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${ghost ? 'h-9 w-9' : 'h-8 w-8'} ${chrome} ${activeClass} ${toneClass} ${className}`}
    >
      {children}
    </button>
  )

  return tooltip ? (
    <Tooltip text={tooltip} kbds={shortcut} side={tooltipSide}>
      {button}
    </Tooltip>
  ) : (
    button
  )
})
