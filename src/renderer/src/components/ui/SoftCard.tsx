import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/components/ui/cn'
import { softMotion, softSurface } from '@/components/ui/softTokens'

type SoftCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  /** Slightly stronger fill for action rows (session / dataset cards). */
  elevated?: boolean
}

/** Muted SaaS card surface — tokens from softSurface (radius / border / shadow). */
export default function SoftCard({
  children,
  elevated = false,
  className,
  ...rest
}: SoftCardProps) {
  return (
    <div
      className={cn(
        elevated ? softSurface.cardElevated : softSurface.card,
        softMotion.colorsFast,
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
