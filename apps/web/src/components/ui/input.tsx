import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const inputClasses =
  'h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-ink placeholder:text-muted/70 transition-colors focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(inputClasses, className)} {...props} />
}
