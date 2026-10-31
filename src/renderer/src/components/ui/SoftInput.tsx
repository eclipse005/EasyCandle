import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/components/ui/cn'

/** Field chrome — radius / border / type from Soft tokens. */
const FIELD_BASE =
  'h-9 min-w-0 rounded-xl border border-white/10 bg-zinc-900/70 px-2.5 text-caption font-medium text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-primary-500/40 focus:bg-zinc-900 disabled:opacity-40'

/** Default full width; dropped when className already sets w-* (cn has no tailwind-merge). */
const FIELD_FULL = `${FIELD_BASE} w-full`

function fieldClass(className?: string): string {
  // Match Tailwind width utilities the caller may pass (w-16, w-[8rem], !w-full, etc.).
  if (className && /(^|\s)!?w-/.test(className)) return FIELD_BASE
  return FIELD_FULL
}

type SoftInputProps = InputHTMLAttributes<HTMLInputElement>
type SoftSelectProps = SelectHTMLAttributes<HTMLSelectElement>
type SoftTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

/** Hide number steppers — they steal ~15–20px and clip 6-digit contract sizes. */
const NUMBER_NO_SPINNER =
  'soft-input [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0'

export const SoftInput = forwardRef<HTMLInputElement, SoftInputProps>(function SoftInput(
  { className, type, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(fieldClass(className), type === 'number' && NUMBER_NO_SPINNER, className)}
      {...rest}
    />
  )
})

export function SoftSelect({ className, ...rest }: SoftSelectProps) {
  return <select className={cn(fieldClass(className), className)} {...rest} />
}

export function SoftTextarea({ className, ...rest }: SoftTextareaProps) {
  return (
    <textarea
      className={cn(fieldClass(className), 'h-auto min-h-[4.5rem] py-2', className)}
      {...rest}
    />
  )
}

export const softFieldClass = FIELD_FULL
