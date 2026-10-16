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
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-line bg-surface">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-3.5 bg-accent rounded-sm" />
            <div>
              {title && (
                <h3 className="text-sm font-semibold text-fg">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-[11px] text-fg-muted mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
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
