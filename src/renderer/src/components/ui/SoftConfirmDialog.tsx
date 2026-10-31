import type { ReactNode } from 'react'
import SoftButton from '@/components/ui/SoftButton'
import SoftDialog from '@/components/ui/SoftDialog'
import { useT } from '@/i18n/useT'

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
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy = false,
  danger = true
}: SoftConfirmDialogProps): ReactNode {
  const { t } = useT()
  const confirmText = confirmLabel ?? t('common.delete')
  const cancelText = cancelLabel ?? t('common.cancel')
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
            {cancelText}
          </SoftButton>
          <SoftButton
            variant={danger ? 'danger' : 'primary'}
            size="sm"
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmText}
          </SoftButton>
        </>
      }
    >
      {description != null ? (
        <div className="text-caption leading-relaxed text-zinc-300">{description}</div>
      ) : (
        <p className="sr-only">{t('common.confirmAction')}</p>
      )}
    </SoftDialog>
  )
}
