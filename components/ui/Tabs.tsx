import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'

export interface TabItem<T extends string = string> {
  id: T
  label: React.ReactNode
  icon?: ComponentType<{ className?: string }>
  count?: React.ReactNode
}

interface TabsProps<T extends string> {
  items: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  variant?: 'pills' | 'underline'
  className?: string
}

export function Tabs<T extends string>({ items, value, onChange, variant = 'pills', className }: TabsProps<T>) {
  if (variant === 'underline') {
    return (
      <div className={cn('flex items-center gap-1 border-b border-line', className)}>
        {items.map((tab) => {
          const Icon = tab.icon
          const isActive = value === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer',
                isActive
                  ? 'border-accent text-accent'
                  : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded text-[10px]',
                    isActive ? 'bg-accent text-black' : 'bg-line-soft text-fg-muted',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className={cn('bg-panel border border-line rounded-[6px] p-2 flex flex-wrap gap-2', className)}>
      {items.map((tab) => {
        const Icon = tab.icon
        const isActive = value === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded font-mono text-xs font-bold tracking-wider transition-all cursor-pointer',
              isActive
                ? 'bg-accent text-black border border-accent'
                : 'bg-surface text-fg-muted border border-line hover:text-fg hover:border-line-strong',
            )}
          >
            {Icon && <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-black' : 'text-fg-muted')} />}
            <span>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}
