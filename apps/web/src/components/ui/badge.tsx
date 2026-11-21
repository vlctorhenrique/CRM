import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type BadgeTone = 'brand' | 'neutral' | 'sand' | 'danger' | 'success'

const tones: Record<BadgeTone, string> = {
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  neutral: 'bg-surface-muted text-muted ring-line',
  sand: 'bg-sand-100 text-sand-700 ring-sand-300',
  danger: 'bg-danger-50 text-danger-700 ring-danger-500/20',
  success: 'bg-success-50 text-success-700 ring-success-500/20',
}

interface BadgeProps extends ComponentProps<'span'> {
  tone?: BadgeTone
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}
