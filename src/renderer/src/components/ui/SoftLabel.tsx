import type { LabelHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/components/ui/cn'

type SoftLabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  children: ReactNode
  /** Caption above a field — muted, sentence case (not HUD uppercase). */
  caption?: ReactNode
}

/** Form label with soft caption hierarchy (tokenized). */
export default function SoftLabel({ children, caption, className, ...rest }: SoftLabelProps) {
  return (
    <label className={cn('block', className)} {...rest}>
      {caption != null ? (
        <span className="mb-1.5 block text-micro font-medium text-zinc-400">{caption}</span>
      ) : null}
      {children}
    </label>
  )
}

/** Standalone muted section / panel caption (sentence case). */
export function SoftCaption({
  children,
  className
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cn('text-micro font-medium text-zinc-400', className)}>{children}</span>
  )
}
