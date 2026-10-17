import { cn } from '@/lib/utils'

const LABEL_BASE = 'block text-fg-muted mb-1 text-xs font-medium'

export function Label({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn(LABEL_BASE, className)} {...props}>
      {children}
    </label>
  )
}
