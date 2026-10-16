import { cn } from '@/lib/utils'

interface PageHeaderProps {
  icon?: React.ReactNode
  kicker: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  tone?: 'default' | 'muted'
  breakpoint?: 'sm' | 'lg'
  actionsClassName?: string
  className?: string
}

export function PageHeader({
  icon,
  kicker,
  title,
  description,
  actions,
  tone = 'default',
  breakpoint = 'sm',
  actionsClassName,
  className,
}: PageHeaderProps) {
  const kickerColor = tone === 'muted' ? 'text-fg-faint' : 'text-accent'
  const titleColor = tone === 'muted' ? 'text-fg-faint' : 'text-fg'

  return (
    <div
      className={cn(
        'flex flex-col justify-between gap-4 bg-panel border border-line rounded-[6px] p-6',
        breakpoint === 'lg' ? 'lg:flex-row lg:items-center' : 'sm:flex-row sm:items-center',
        className,
      )}
    >
      <div>
        <div className={cn('flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider', kickerColor)}>
          {icon}
          <span>{kicker}</span>
        </div>
        <h1 className={cn('font-mono text-2xl font-bold tracking-tight uppercase mt-1', titleColor)}>{title}</h1>
        {description && <p className="text-xs text-fg-muted font-mono mt-1">{description}</p>}
      </div>

      {actions && <div className={cn('flex items-center gap-2', actionsClassName)}>{actions}</div>}
    </div>
  )
}
