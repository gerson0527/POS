import { isAppError } from '@/lib/errors'

export interface ActionFailure {
  success: false
  message: string
}

/**
 * En producción Next.js oculta el mensaje de cualquier error lanzado desde una
 * Server Action ("An error occurred in the Server Components render...").
 * Las acciones de negocio deben devolver un resultado estructurado para que el
 * usuario reciba el motivo real (caja cerrada, stock insuficiente, etc.).
 */
export function isUnauthorizedActionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const digest = (error as { digest?: string } | null)?.digest
  return (
    (isAppError(error) && error.code === 'UNAUTHORIZED') ||
    message.includes('UNAUTHORIZED') ||
    digest === 'NEXT_REDIRECT' ||
    String(digest || '').includes('NEXT_REDIRECT')
  )
}

function isPlainBusinessError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false
  if (isAppError(error)) return error.code !== 'INTERNAL'
  // Errores de infraestructura (Drizzle/pg/red) son subtipos o traen `cause`/`code`:
  // no se expone su mensaje al cliente porque puede incluir SQL o parámetros.
  return error.constructor === Error && !(error as { cause?: unknown }).cause && !(error as { code?: unknown }).code
}

export function toActionFailure(error: unknown, fallback: string): ActionFailure {
  if (isPlainBusinessError(error)) {
    const message = error.message.replace(/^[A-Z_]+:\s*/, '').trim()
    if (message && !/Server Components render/i.test(message)) {
      return { success: false, message }
    }
  }
  return { success: false, message: fallback }
}

export async function safeAction<T>(
  fn: () => Promise<T>,
  fallback = 'No se pudo completar la operación. Intenta de nuevo.'
): Promise<T | ActionFailure> {
  try {
    return await fn()
  } catch (error) {
    if (isUnauthorizedActionError(error)) throw error
    console.error('[server-action]', error)
    return toActionFailure(error, fallback)
  }
}
