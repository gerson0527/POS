import { cn } from '@/lib/utils'

const TEXTAREA_BASE = 'w-full bg-input border border-line focus:border-accent p-2.5 rounded text-fg'

export function TextArea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(TEXTAREA_BASE, className)} {...props} />
}
