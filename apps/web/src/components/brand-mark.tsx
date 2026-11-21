import { cn } from '@/lib/utils'

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-10 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm',
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" fill="none" className="size-5">
        <title>CRM Clínicas</title>
        <path
          d="M9.5 22.5V13a3.5 3.5 0 0 1 3.5-3.5h6A3.5 3.5 0 0 1 22.5 13v9.5"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path d="M7 22.5h18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M13 17h6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </span>
  )
}
