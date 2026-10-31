import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@/components/ui/cn'

const FIELD =
  'h-9 w-full rounded-xl border border-white/10 bg-zinc-900/70 px-2.5 text-xs font-medium text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-primary-500/40 focus:bg-zinc-900 disabled:opacity-40'

type SoftInputProps = InputHTMLAttributes<HTMLInputElement>
type SoftSelectProps = SelectHTMLAttributes<HTMLSelectElement>
type SoftTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export function SoftInput({ className, ...rest }: SoftInputProps) {
  return <input className={cn(FIELD, className)} {...rest} />
}

export function SoftSelect({ className, ...rest }: SoftSelectProps) {
  return <select className={cn(FIELD, className)} {...rest} />
}

export function SoftTextarea({ className, ...rest }: SoftTextareaProps) {
  return (
    <textarea
      className={cn(FIELD, 'h-auto min-h-[4.5rem] py-2', className)}
      {...rest}
    />
  )
}

export const softFieldClass = FIELD
