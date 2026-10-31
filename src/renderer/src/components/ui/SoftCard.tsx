import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/components/ui/cn'

type SoftCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  /** Slightly stronger fill for action rows (session / dataset cards). */
  elevated?: boolean
}

/** Muted SaaS card surface — rounded-2xl, soft border, quiet shadow. */
export default function SoftCard({
  children,
  elevated = false,
  className,
  ...rest
}: SoftCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/[0.06] shadow-lg shadow-black/15',
        elevated ? 'bg-zinc-900/70' : 'bg-zinc-900/45',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
