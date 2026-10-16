import { cn } from '@/lib/utils'

const TEXTAREA_BASE = ''

export function TextArea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(TEXTAREA_BASE, className)} {...props} />
}
