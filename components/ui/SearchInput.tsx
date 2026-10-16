import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'className' | 'size'> {
  wrapperClassName?: string
  inputClassName?: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_STYLES = {
  sm: { input: 'pl-8 pr-3 py-1.5', icon: 'w-3.5 h-3.5 left-3' },
  md: { input: 'pl-9 pr-3 py-2', icon: 'w-3.5 h-3.5 left-3' },
  lg: { input: 'pl-10 pr-4 py-2', icon: 'w-4 h-4 left-3.5' },
} as const

export function SearchInput({ wrapperClassName, inputClassName, size = 'md', ...props }: SearchInputProps) {
  const s = SIZE_STYLES[size]
  return (
    <div className={cn('relative min-w-[240px]', wrapperClassName)}>
      <Search className={cn('text-fg-muted absolute top-1/2 -translate-y-1/2', s.icon)} aria-hidden />
      <input
        type="text"
        className={cn(
          'w-full bg-surface text-fg rounded border border-line text-xs outline-none focus:border-accent',
          s.input,
          inputClassName,
        )}
        {...props}
      />
    </div>
  )
}
