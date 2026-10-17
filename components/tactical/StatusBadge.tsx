
export type StatusType =
  | 'online'
  | 'active'
  | 'completed'
  | 'accepted'
  | 'success'
  | 'warning'
  | 'delayed'
  | 'pending'
  | 'critical'
  | 'error'
  | 'failed'
  | 'rejected'
  | 'offline'
  | 'inactive'
  | 'draft'

interface StatusBadgeProps {
  status: StatusType | string
  label?: string
  size?: 'sm' | 'md'
  showPulse?: boolean
  className?: string
}

export function StatusBadge({
  status,
  label,
  size = 'sm',
  showPulse = false,
  className = '',
}: StatusBadgeProps) {
  const normalized = status.toLowerCase()

  let dotColor = 'bg-fg-muted'
  let textColor = 'text-fg-muted'
  let bgColor = 'bg-ash'
  let borderColor = 'border-line'

  if (['online', 'active', 'completed', 'accepted', 'success'].includes(normalized)) {
    dotColor = 'bg-success'
    textColor = 'text-success'
    bgColor = 'bg-ok-dim'
    borderColor = 'border-ok-line'
  } else if (['warning', 'delayed', 'pending'].includes(normalized)) {
    dotColor = 'bg-warning'
    textColor = 'text-warning'
    bgColor = 'bg-warn-bg-3'
    borderColor = 'border-warn-bg-5'
  } else if (['critical', 'error', 'failed', 'rejected'].includes(normalized)) {
    dotColor = 'bg-danger'
    textColor = 'text-danger'
    bgColor = 'bg-alert-dim'
    borderColor = 'border-alert-line'
  } else if (['draft', 'offline', 'inactive'].includes(normalized)) {
    dotColor = 'bg-fg-muted'
    textColor = 'text-fg-muted'
    bgColor = 'bg-charcoal'
    borderColor = 'border-line'
  }

  const displayLabel = label || status.toUpperCase()

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded border ${bgColor} ${borderColor} ${
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      } ${className}`}
    >
      <span className="relative flex h-2 w-2 items-center justify-center">
        {showPulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dotColor}`}
          />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dotColor}`} />
      </span>
      <span className={`font-semibold ${textColor}`}>{displayLabel}</span>
    </span>
  )
}
