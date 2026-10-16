import React from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

type AccentColor =
  | 'orange'
  | 'green'
  | 'red'
  | 'blue'
  | 'neutral'
  | 'cyan'
  | 'purple'
  | 'pink'
  | 'amber'

const ACCENTS: Record<AccentColor, { border: string; text: string }> = {
  orange: { border: 'border-l-accent', text: 'text-accent' },
  green: { border: 'border-l-ok', text: 'text-ok' },
  red: { border: 'border-l-danger', text: 'text-danger' },
  blue: { border: 'border-l-blue', text: 'text-blue' },
  neutral: { border: 'border-l-line-strong', text: 'text-fg' },
  cyan: { border: 'border-l-cyan', text: 'text-cyan' },
  purple: { border: 'border-l-purple', text: 'text-purple' },
  pink: { border: 'border-l-pink', text: 'text-pink' },
  amber: { border: 'border-l-amber', text: 'text-amber' },
}

interface MetricCardProps {
  title: string
  value: string | number
  subtext?: string
  trend?: string
  trendType?: 'positive' | 'negative' | 'neutral' | 'warning'
  trendDirection?: 'up' | 'down'
  accentColor?: AccentColor
  accentValue?: boolean
  icon?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function MetricCard({
  title,
  value,
  subtext,
  trend,
  trendType = 'neutral',
  trendDirection,
  accentColor = 'orange',
  accentValue = false,
  icon,
  action,
  className = '',
}: MetricCardProps) {
  const accent = ACCENTS[accentColor]

  let trendColor = 'text-fg-muted'
  if (trendType === 'positive') trendColor = 'text-success'
  if (trendType === 'negative') trendColor = 'text-danger'
  if (trendType === 'warning') trendColor = 'text-warning'

  return (
    <div
      className={cn(
        'bg-panel border border-line border-l-2 rounded-[6px] p-4 md:p-5 flex flex-col justify-between transition-colors hover:border-line-strong',
        accent.border,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-fg-muted">
          {title}
        </span>
        {icon && <div className="text-fg-muted shrink-0">{icon}</div>}
      </div>

      <div className="space-y-1">
        <div
          className={cn(
            'font-mono text-2xl md:text-3xl font-bold tracking-tight text-fg',
            accentValue && accent.text,
          )}
        >
          {value}
        </div>
        {(subtext || trend) && (
          <div className="flex items-center gap-2 text-xs font-mono">
            {trend && (
              <span className={`font-semibold inline-flex items-center gap-1 ${trendColor}`}>
                {trendDirection === 'up' && <TrendingUp className="w-3 h-3" />}
                {trendDirection === 'down' && <TrendingDown className="w-3 h-3" />}
                {trend}
              </span>
            )}
            {subtext && <span className="text-fg-muted truncate">{subtext}</span>}
          </div>
        )}
      </div>

      {action && <div className="pt-2">{action}</div>}
    </div>
  )
}
