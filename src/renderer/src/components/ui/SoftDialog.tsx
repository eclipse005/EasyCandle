import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import SoftButton from '@/components/ui/SoftButton'

type SoftDialogProps = {
  open: boolean
  title: ReactNode
  description?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Disable close (e.g. while busy). */
  closeDisabled?: boolean
  className?: string
  labelledBy?: string
}

/** Shared modal shell — soft overlay, rounded-2xl card, quiet borders. */
export default function SoftDialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  closeDisabled = false,
  className,
  labelledBy = 'soft-dialog-title'
}: SoftDialogProps) {
  useEffect(() => {
    if (!open) return undefined
    function onKey(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      if (closeDisabled) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    // Capture so Esc never falls through to session-level handlers.
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, closeDisabled, onClose])

  if (!open) return null

  // cn() is plain join (no tailwind-merge); skip defaults when caller already sets max-w/max-h.
  const hasMaxW = Boolean(className && /\bmax-w-/.test(className))
  const hasMaxH = Boolean(className && /\bmax-h-/.test(className))

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      role="presentation"
      onClick={() => {
        if (!closeDisabled) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          'flex w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl shadow-black/50',
          !hasMaxH && 'max-h-[min(90vh,40rem)]',
          !hasMaxW && 'max-w-md',
          className
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="min-w-0">
            <h2 id={labelledBy} className="text-section tracking-tight text-zinc-100">
              {title}
            </h2>
            {description != null ? (
              <p className="mt-1 text-caption leading-relaxed text-zinc-400">{description}</p>
            ) : null}
          </div>
          <SoftButton
            variant="ghost"
            size="sm"
            aria-label="Close"
            disabled={closeDisabled}
            onClick={onClose}
            className="!h-8 !w-8 !px-0"
          >
            <X className="h-4 w-4" />
          </SoftButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer != null ? (
          <div
            data-soft-dialog-footer
            className="relative z-[1] flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] bg-zinc-950/95 px-5 py-3.5"
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}
