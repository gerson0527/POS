// Errores tipados de sesión/autorización (Fase 3.19 — §5.1 errors.ts).
// Refactorizado en la Fase 3.22 para extender el AppError unificado.
// El prefijo `${code}: ` se preserva en el mensaje porque los client components
// detectan sesiones caídas con `err.message.includes('UNAUTHORIZED')`.
import { AppError, type AppErrorCode } from '@/lib/errors'

export type SessionErrorCode = Extract<
  AppErrorCode,
  'UNAUTHORIZED' | 'TENANT_NOT_ASSIGNED' | 'TENANT_SUSPENDED' | 'FORBIDDEN'
>

export class SessionError extends AppError {
  constructor(code: SessionErrorCode, detail: string) {
    super(code, detail)
    this.name = 'SessionError'
  }
}

export function unauthorizedError(detail = 'Sesión de usuario no válida o expirada.') {
  return new SessionError('UNAUTHORIZED', detail)
}

export function tenantNotAssignedError(
  detail = 'El usuario no tiene un tenant asignado. Un administrador debe vincularlo desde el módulo de Usuarios.'
) {
  return new SessionError('TENANT_NOT_ASSIGNED', detail)
}

export function tenantSuspendedError(detail = 'La membresía del usuario no está activa.') {
  return new SessionError('TENANT_SUSPENDED', detail)
}

export function forbiddenError(detail: string) {
  return new SessionError('FORBIDDEN', detail)
}
