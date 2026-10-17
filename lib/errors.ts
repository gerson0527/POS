// Error de aplicación unificado (Fase 3.22 — §22 AppError unificado).
// Reemplaza los `throw new Error('string')` para errores de negocio/HTTP:
// código tipado + status HTTP asociado + respuesta JSON consistente.

export type AppErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'TENANT_NOT_ASSIGNED'
  | 'TENANT_SUSPENDED'
  | 'INTERNAL'

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  TENANT_NOT_ASSIGNED: 403,
  TENANT_SUSPENDED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
}

export interface AppErrorDetail {
  field?: string
  issue?: string
}

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly status: number
  readonly details?: AppErrorDetail[]

  constructor(
    code: AppErrorCode,
    detail: string,
    options?: { message?: string; details?: AppErrorDetail[] }
  ) {
    super(options?.message ?? `${code}: ${detail}`)
    this.name = 'AppError'
    this.code = code
    this.status = STATUS_BY_CODE[code]
    this.details = options?.details
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      ...(this.details?.length ? { details: this.details } : {}),
    }
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

export function badRequest(detail: string) {
  return new AppError('BAD_REQUEST', detail)
}

export function notFound(detail: string) {
  return new AppError('NOT_FOUND', detail)
}

export function conflictError(detail: string) {
  return new AppError('CONFLICT', detail)
}

export function rateLimitedError(detail = 'Demasiadas peticiones. Intenta de nuevo más tarde.') {
  return new AppError('RATE_LIMITED', detail)
}

export function internalError(detail: string) {
  return new AppError('INTERNAL', detail)
}

export interface ErrorResponse {
  status: number
  body: { error: string; code: string; details?: AppErrorDetail[] }
}

/** Mapea cualquier error a una respuesta HTTP JSON consistente. */
export function toErrorResponse(error: unknown): ErrorResponse {
  if (isAppError(error)) {
    return {
      status: error.status,
      body: error.toJSON() as ErrorResponse['body'],
    }
  }
  console.error('[toErrorResponse] error no tipado:', error)
  return {
    status: 500,
    body: { error: 'Internal server error', code: 'INTERNAL' },
  }
}
