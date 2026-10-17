export interface LogItem {
  id: string
  createdAt: string
  action: string
  entity: string
  entityId: string
}

interface ActivityLogProps {
  logs: LogItem[]
  maxHeight?: string
}

const ENTITY_LABELS: Record<string, string> = {
  SALE: 'Venta',
  INVOICE: 'Factura',
  CUSTOMER: 'Cliente',
  CASHIER_SESSION: 'Caja',
  PRODUCT: 'Producto',
  CATEGORY: 'Categoría',
  USER: 'Usuario',
  TENANT: 'Empresa',
  LOCATION: 'Sucursal',
  SUPPLIER: 'Proveedor',
  INVENTORY: 'Inventario',
}

const ACTION_STYLES: Record<string, { dot: string; verb: string }> = {
  CREATE: { dot: 'bg-ok', verb: 'registró' },
  UPDATE: { dot: 'bg-accent', verb: 'actualizó' },
  DELETE: { dot: 'bg-alert', verb: 'eliminó' },
}

function entityLabel(entity: string) {
  return ENTITY_LABELS[entity] ?? entity.charAt(0) + entity.slice(1).toLowerCase()
}

function shortRef(entityId: string) {
  const tail = entityId.includes('_') ? entityId.split('_').pop()! : entityId
  return tail.length > 6 ? tail.slice(-6) : tail
}

function formatLogTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const opts = { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: true } as const
  const time = d.toLocaleTimeString('es-CO', opts)
  const day = d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short' })
  const today = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short' })
  return day === today ? `Hoy ${time}` : `${day} · ${time}`
}

export function ActivityLog({
  logs,
  maxHeight = 'max-h-72',
}: ActivityLogProps) {
  return (
    <div className={`overflow-y-auto ${maxHeight} divide-y divide-ash`}>
      {logs.length === 0 ? (
        <div className="py-6 text-center text-xs text-fg-faint">
          Sin movimientos recientes
        </div>
      ) : (
        logs.map((log) => {
          const style = ACTION_STYLES[log.action.toUpperCase()] ?? {
            dot: 'bg-fg-muted',
            verb: log.action.toLowerCase(),
          }
          const label = entityLabel(log.entity)
          return (
            <div
              key={log.id}
              className="py-2.5 px-1 flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                <span className="text-fg truncate">
                  {label} <span className="text-fg-muted">#{shortRef(log.entityId)}</span>{' '}
                  <span className="text-fg-muted">{style.verb}</span>
                </span>
              </div>
              <span className="text-fg-faint text-[11px] shrink-0">
                {formatLogTime(log.createdAt)}
              </span>
            </div>
          )
        })
      )}
    </div>
  )
}
