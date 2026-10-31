// Contexto explícito de quién ejecuta una operación de dominio.
// Las Server Actions lo construyen desde la cookie de sesión; los canales
// externos (bot) lo construyen desde el vínculo canal-usuario. Los servicios
// de dominio NUNCA leen cookies ni headers.
import type { TenantRole } from './session-context'
import { forbiddenError } from './errors'

export interface ActorContext {
  userId: string
  tenantId: string
  role: TenantRole
}

export function assertActorRole(actor: ActorContext, allowed: TenantRole[]): void {
  if (!actor.userId || !actor.tenantId) {
    throw forbiddenError('Contexto de usuario incompleto.')
  }
  if (!allowed.includes(actor.role)) {
    throw forbiddenError(
      `Se requiere uno de los roles: ${allowed.join(', ')}. Rol actual: ${actor.role}.`
    )
  }
}
