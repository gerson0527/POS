import type { TenantRole } from '@/lib/auth/session-context'
import type { AssistantIntent } from './intents'

const SALE_ROLES: TenantRole[] = ['ADMIN', 'MANAGER', 'CASHIER']
const INVENTORY_ROLES: TenantRole[] = ['ADMIN', 'MANAGER']
const QUERY_ROLES: TenantRole[] = ['ADMIN', 'MANAGER', 'CASHIER', 'VIEWER', 'ACCOUNTANT']

/** ¿Puede este rol ejecutar/consultar esta intención? */
export function canHandleIntent(role: TenantRole, intent: AssistantIntent): boolean {
  switch (intent.type) {
    case 'CREATE_SALE':
      return SALE_ROLES.includes(role)
    case 'INVENTORY_IN':
    case 'INVENTORY_OUT':
    case 'INVENTORY_ADJUSTMENT':
      return INVENTORY_ROLES.includes(role)
    case 'STOCK_QUERY':
      return QUERY_ROLES.includes(role)
    case 'CLARIFY':
    case 'UNSUPPORTED':
      return true
    default:
      return false
  }
}

export function permissionDeniedMessage(intentType: string, role: TenantRole): string {
  return `Su rol (${role}) no puede ejecutar "${intentType}" por este canal.`
}
