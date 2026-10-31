import type { InputHTMLAttributes, ReactNode } from 'react'
import { SoftInput } from '@/components/ui/SoftInput'
import { cn } from '@/components/ui/cn'
import { useT } from '@/i18n/useT'

type SoftDateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  value: string
}

/**
 * Date field with locale placeholder when empty.
 * Native `type=date` ignores `placeholder`; overlay shows EN `yyyy/mm/dd` / ZH `年/月/日`.
 * Value remains ISO `YYYY-MM-DD` for filter state.
 */
export default function SoftDateInput({
  value,
  className,
  disabled,
  ...rest
}: SoftDateInputProps): ReactNode {
  const { t, locale } = useT()
  const empty = !value
  return (
    <div className="relative min-w-0">
      {empty ? (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 z-[1] flex items-center px-2.5',
            'text-caption font-medium text-zinc-600',
            disabled && 'opacity-40'
          )}
        >
          {t('common.datePlaceholder')}
        </span>
      ) : null}
      <SoftInput
        {...rest}
        type="date"
        value={value}
        disabled={disabled}
        lang={locale === 'zh' ? 'zh-CN' : 'en'}
        className={cn(
          empty &&
            'text-transparent [&::-webkit-datetime-edit]:text-transparent [&::-webkit-datetime-edit-fields-wrapper]:opacity-0',
          className
        )}
      />
    </div>
  )
}
