export type BackupDateFilter = 'range' | 'none'

export type BackupTenantScope =
  | { kind: 'column'; column: 'tenantId' }
  | { kind: 'id' }
  | { kind: 'parent'; parent: string; parentKey: 'id'; childKey: string }
  | { kind: 'users' }
  | { kind: 'accounts' }

export interface BackupTable {
  name: string
  label: string
  group: string
  dateColumn: string | null
  dateFilter: BackupDateFilter
  tenant: BackupTenantScope
}

export const BACKUP_TABLES: BackupTable[] = [
  { name: 'tenant', label: 'Empresa', group: 'Empresa', dateColumn: 'createdAt', dateFilter: 'none', tenant: { kind: 'id' } },
  { name: 'location', label: 'Sedes', group: 'Empresa', dateColumn: 'createdAt', dateFilter: 'none', tenant: { kind: 'column', column: 'tenantId' } },
  { name: 'user_tenant', label: 'Usuarios de la empresa', group: 'Empresa', dateColumn: 'createdAt', dateFilter: 'none', tenant: { kind: 'column', column: 'tenantId' } },
  { name: 'user', label: 'Usuarios', group: 'Empresa', dateColumn: 'createdAt', dateFilter: 'none', tenant: { kind: 'users' } },
  { name: 'account', label: 'Cuentas de acceso', group: 'Empresa', dateColumn: 'createdAt', dateFilter: 'none', tenant: { kind: 'accounts' } },

  { name: 'customer', label: 'Clientes', group: 'Clientes', dateColumn: 'createdAt', dateFilter: 'none', tenant: { kind: 'column', column: 'tenantId' } },
  { name: 'customer_credit_transaction', label: 'Cartera', group: 'Clientes', dateColumn: 'createdAt', dateFilter: 'range', tenant: { kind: 'column', column: 'tenantId' } },

  { name: 'product_category', label: 'Categorías', group: 'Inventario', dateColumn: 'createdAt', dateFilter: 'none', tenant: { kind: 'column', column: 'tenantId' } },
  { name: 'product', label: 'Productos', group: 'Inventario', dateColumn: 'createdAt', dateFilter: 'none', tenant: { kind: 'column', column: 'tenantId' } },
  { name: 'inventory', label: 'Existencias', group: 'Inventario', dateColumn: 'updatedAt', dateFilter: 'none', tenant: { kind: 'column', column: 'tenantId' } },
  { name: 'inventory_movement', label: 'Movimientos de inventario', group: 'Inventario', dateColumn: 'createdAt', dateFilter: 'range', tenant: { kind: 'column', column: 'tenantId' } },
  { name: 'supplier', label: 'Proveedores', group: 'Inventario', dateColumn: 'createdAt', dateFilter: 'none', tenant: { kind: 'column', column: 'tenantId' } },
  { name: 'purchase_order', label: 'Órdenes de compra', group: 'Inventario', dateColumn: 'createdAt', dateFilter: 'range', tenant: { kind: 'column', column: 'tenantId' } },

  { name: 'cashier_session', label: 'Sesiones de caja', group: 'Ventas', dateColumn: 'createdAt', dateFilter: 'range', tenant: { kind: 'column', column: 'tenantId' } },
  { name: 'cash_movement', label: 'Movimientos de caja', group: 'Ventas', dateColumn: 'createdAt', dateFilter: 'range', tenant: { kind: 'column', column: 'tenantId' } },
  { name: 'sale', label: 'Ventas', group: 'Ventas', dateColumn: 'createdAt', dateFilter: 'range', tenant: { kind: 'column', column: 'tenantId' } },
  { name: 'sale_item', label: 'Ítems de venta', group: 'Ventas', dateColumn: 'createdAt', dateFilter: 'range', tenant: { kind: 'parent', parent: 'sale', parentKey: 'id', childKey: 'saleId' } },
  { name: 'payment', label: 'Pagos', group: 'Ventas', dateColumn: 'createdAt', dateFilter: 'range', tenant: { kind: 'parent', parent: 'sale', parentKey: 'id', childKey: 'saleId' } },

  { name: 'customer_return', label: 'Devoluciones', group: 'Devoluciones', dateColumn: 'createdAt', dateFilter: 'range', tenant: { kind: 'column', column: 'tenantId' } },
  { name: 'customer_return_item', label: 'Ítems de devolución', group: 'Devoluciones', dateColumn: 'createdAt', dateFilter: 'range', tenant: { kind: 'parent', parent: 'customer_return', parentKey: 'id', childKey: 'returnId' } },

  { name: 'numeration', label: 'Numeraciones', group: 'Fiscal', dateColumn: 'createdAt', dateFilter: 'none', tenant: { kind: 'column', column: 'tenantId' } },
  { name: 'fiscal_document', label: 'Documentos fiscales', group: 'Fiscal', dateColumn: 'createdAt', dateFilter: 'range', tenant: { kind: 'column', column: 'tenantId' } },
  { name: 'fiscal_outbox', label: 'Cola de envío DIAN', group: 'Fiscal', dateColumn: 'createdAt', dateFilter: 'range', tenant: { kind: 'column', column: 'tenantId' } },

  { name: 'audit_log', label: 'Auditoría', group: 'Auditoría', dateColumn: 'createdAt', dateFilter: 'range', tenant: { kind: 'column', column: 'tenantId' } },
  { name: 'event', label: 'Eventos', group: 'Auditoría', dateColumn: 'createdAt', dateFilter: 'range', tenant: { kind: 'column', column: 'tenantId' } },

  { name: 'channel_link', label: 'Canales del asistente', group: 'Asistente', dateColumn: 'createdAt', dateFilter: 'none', tenant: { kind: 'column', column: 'tenantId' } },
  { name: 'channel_message', label: 'Mensajes', group: 'Asistente', dateColumn: 'createdAt', dateFilter: 'range', tenant: { kind: 'column', column: 'tenantId' } },
  { name: 'assistant_draft', label: 'Borradores', group: 'Asistente', dateColumn: 'createdAt', dateFilter: 'range', tenant: { kind: 'column', column: 'tenantId' } },
  { name: 'product_alias', label: 'Alias de productos', group: 'Asistente', dateColumn: 'createdAt', dateFilter: 'none', tenant: { kind: 'column', column: 'tenantId' } },

  { name: 'api_key', label: 'Claves de API', group: 'Seguridad', dateColumn: 'createdAt', dateFilter: 'none', tenant: { kind: 'column', column: 'tenantId' } },
]

const BY_NAME = new Map(BACKUP_TABLES.map((table) => [table.name, table]))

export function backupGroups(): Array<{ group: string; tables: BackupTable[] }> {
  const groups: Array<{ group: string; tables: BackupTable[] }> = []
  for (const table of BACKUP_TABLES) {
    const current = groups.find((group) => group.group === table.group)
    if (current) current.tables.push(table)
    else groups.push({ group: table.group, tables: [table] })
  }
  return groups
}

export function resolveBackupTables(scope: 'all' | 'tables', names: string[]): BackupTable[] {
  if (scope === 'all') return BACKUP_TABLES
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))]
  if (!unique.length) {
    throw new Error('Seleccione al menos una tabla.')
  }
  return unique.map((name) => {
    const table = BY_NAME.get(name)
    if (!table) throw new Error(`La tabla "${name}" no se puede incluir en la copia.`)
    return table
  })
}
