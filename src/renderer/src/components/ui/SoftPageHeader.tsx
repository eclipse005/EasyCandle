import type { ReactNode } from 'react'
import { cn } from '@/components/ui/cn'

/** Dashboard page title block — FXR hierarchy (page title / muted caption). */
export default function SoftPageHeader({
  title,
  description,
  action,
  className
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-5 flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-section tracking-tight text-zinc-100">{title}</h2>
        {description != null ? (
          <p className="mt-1 text-caption leading-relaxed text-zinc-500">{description}</p>
        ) : null}
      </div>
      {action != null ? <div className="shrink-0 pt-0.5">{action}</div> : null}
    </div>
  )
}
