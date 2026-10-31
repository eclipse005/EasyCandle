import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/components/ui/cn'
import { softMotion } from '@/components/ui/softTokens'

export type SoftButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

type SoftButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  variant?: SoftButtonVariant
  size?: 'sm' | 'md'
}

const VARIANT: Record<SoftButtonVariant, string> = {
  primary:
    'bg-primary-500/90 text-white hover:bg-primary-400 border border-transparent shadow-sm shadow-primary-950/40',
  secondary:
    'border border-white/10 bg-zinc-900/60 text-zinc-300 hover:border-white/15 hover:bg-zinc-800/80 hover:text-zinc-100',
  ghost: 'border border-transparent text-zinc-500 hover:bg-white/5 hover:text-zinc-300',
  danger:
    'border border-transparent text-zinc-500 hover:bg-red-950/50 hover:text-red-300'
}

const SIZE = {
  sm: 'h-9 gap-1.5 rounded-xl px-3.5 text-caption font-medium',
  md: 'h-11 gap-2 rounded-xl px-4 text-body font-medium'
} as const

/** Soft fill / ghost hover buttons — type/radius from Soft tokens. */
export default function SoftButton({
  children,
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: SoftButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-40',
        softMotion.press,
        'active:scale-[0.98]',
        SIZE[size],
        VARIANT[variant],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
