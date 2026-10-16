import { StatusBadge, StatusType } from './StatusBadge'

export interface LogItem {
  id: string
  timestamp: string
  action: string
  user?: string
  details?: string
  status?: StatusType
}

interface ActivityLogProps {
  logs: LogItem[]
  title?: string
  maxHeight?: string
}

export function ActivityLog({
  logs,
  title = 'Actividad reciente',
  maxHeight = 'max-h-72',
}: ActivityLogProps) {
  return (
    <div className="bg-surface border border-line rounded-[6px] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-raised border-b border-line">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="text-[11px] font-semibold text-fg-muted">
            {title}
          </span>
        </div>
        <span className="text-[10px] text-fg-faint">{logs.length} eventos</span>
      </div>

      <div className={`overflow-y-auto ${maxHeight} divide-y divide-ash p-2 space-y-1`}>
        {logs.length === 0 ? (
          <div className="py-6 text-center text-xs text-fg-faint">
            Sin eventos registrados
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="p-2 hover:bg-charcoal rounded transition-colors text-xs flex flex-col md:flex-row md:items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-fg-faint text-[11px] font-semibold">
                  [{log.timestamp}]
                </span>
                <span className="text-accent font-bold">{log.action}</span>
                {log.user && (
                  <span className="text-fg-muted text-[11px]">@{log.user}</span>
                )}
                {log.details && (
                  <span className="text-fg font-sans text-xs">{log.details}</span>
                )}
              </div>

              {log.status && (
                <div className="shrink-0">
                  <StatusBadge status={log.status} size="sm" />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
