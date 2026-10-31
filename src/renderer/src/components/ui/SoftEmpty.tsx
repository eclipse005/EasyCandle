import type { ReactNode } from 'react'
import SoftCard from '@/components/ui/SoftCard'
import { cn } from '@/components/ui/cn'
import { softType } from '@/components/ui/softTokens'

/** Soft empty-state placeholder for dashboard lists. */
export default function SoftEmpty({
  children,
  className
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <SoftCard
      className={cn('px-5 py-12 text-center leading-relaxed', softType.caption, className)}
    >
      {children}
    </SoftCard>
  )
}
