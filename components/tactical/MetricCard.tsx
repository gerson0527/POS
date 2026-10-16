import React from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'

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
  orange: { border: '#FF6A00', text: '#FF6A00' },
  green: { border: '#D8FFDE', text: '#10B981' },
  red: { border: '#FF3B4D', text: '#EF4444' },
  blue: { border: '#3B82F6', text: '#3B82F6' },
  neutral: { border: '#444444', text: '#EEEEEE' },
  cyan: { border: '#06B6D4', text: '#06B6D4' },
  purple: { border: '#A855F7', text: '#A855F7' },
  pink: { border: '#EC4899', text: '#EC4899' },
  amber: { border: '#F59E0B', text: '#F59E0B' },
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
      className={`bg-panel border border-line rounded-[6px] p-4 md:p-5 flex flex-col justify-between transition-colors hover:border-line-strong border-l-2 ${className}`}
      style={{ borderLeftColor: accent.border }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-fg-muted">
          {title}
        </span>
        {icon && <div className="text-fg-muted shrink-0">{icon}</div>}
      </div>

      <div className="space-y-1">
        <div
          className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-fg"
          style={accentValue ? { color: accent.text } : undefined}
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
