import type { ReactNode } from 'react'
import SoftButton from '@/components/ui/SoftButton'
import SoftDialog from '@/components/ui/SoftDialog'

type SoftConfirmDialogProps = {
  open: boolean
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  /** Destructive confirm styling (default true). */
  danger?: boolean
}

/** Soft SaaS confirm — Cancel + danger Delete, replaces window.confirm. */
export default function SoftConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  busy = false,
  danger = true
}: SoftConfirmDialogProps): ReactNode {
  return (
    <SoftDialog
      open={open}
      title={title}
      onClose={onCancel}
      closeDisabled={busy}
      labelledBy="soft-confirm-title"
      className="max-w-sm"
      footer={
        <>
          <SoftButton variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </SoftButton>
          <SoftButton
            variant={danger ? 'danger' : 'primary'}
            size="sm"
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </SoftButton>
        </>
      }
    >
      {description != null ? (
        <p className="text-caption leading-relaxed text-zinc-300">{description}</p>
      ) : (
        <p className="sr-only">Confirm this action.</p>
      )}
    </SoftDialog>
  )
}
