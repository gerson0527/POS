import { cn } from '@/lib/utils'

const INPUT_BASE =
  'w-full bg-input border border-line focus:border-accent p-2.5 rounded text-fg'

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(INPUT_BASE, className)} {...props} />
}
