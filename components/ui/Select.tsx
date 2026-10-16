import { cn } from '@/lib/utils'

const SELECT_BASE =
  'w-full bg-input border border-line focus:border-accent p-2.5 rounded text-white font-bold'

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(SELECT_BASE, className)} {...props}>
      {children}
    </select>
  )
}
