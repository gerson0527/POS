import React from 'react'

interface SectionPanelProps {
  title?: string
  subtitle?: string
  action?: React.ReactNode
  statusSlot?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
  noPadding?: boolean
}

export function SectionPanel({
  title,
  subtitle,
  action,
  statusSlot,
  children,
  className = '',
  contentClassName = '',
  noPadding = false,
}: SectionPanelProps) {
  return (
    <div
      className={`bg-panel border border-line rounded-[6px] overflow-hidden ${className}`}
    >
      {(title || subtitle || action || statusSlot) && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-line bg-surface min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-1.5 h-3.5 bg-accent rounded-sm shrink-0" />
            <div className="min-w-0 flex-1">
              {title && (
                <h3 className="text-sm font-semibold text-fg truncate" title={title}>
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-[11px] text-fg-muted mt-0.5 truncate" title={subtitle}>{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {statusSlot}
            {action}
          </div>
        </div>
      )}

      <div className={noPadding ? contentClassName : `p-5 ${contentClassName}`}>
        {children}
      </div>
    </div>
  )
}
