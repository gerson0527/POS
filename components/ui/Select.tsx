import { cn } from '@/lib/utils'

const SELECT_BASE =
  'w-full bg-input border border-line focus:border-accent p-2.5 rounded text-fg'

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(SELECT_BASE, className)} {...props}>
      {children}
    </select>
  )
}
