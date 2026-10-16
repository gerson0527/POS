'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Redirect canónico de sesión caída (Fase 3.20): todos los puntos usan /login
 * con el parámetro redirect para volver tras autenticarse (mismo formato que middleware).
 */
export function redirectToLogin() {
  if (typeof window === 'undefined') return
  const current = window.location.pathname + window.location.search
  window.location.href = '/login?redirect=' + encodeURIComponent(current)
}

export function isSessionError(error: unknown): boolean {
  if (!error) return false
  const message = error instanceof Error ? error.message : String(error)
  const digest = (error as { digest?: string })?.digest
  return (
    message.includes('UNAUTHORIZED') ||
    digest === 'NEXT_REDIRECT' ||
    String(digest || '').includes('NEXT_REDIRECT')
  )
}

export interface ProtectedQueryResult<T> {
  data: T | null
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * Ejecuta una server action de lectura con manejo estándar de sesión caída:
 * UNAUTHORIZED / NEXT_REDIRECT -> /login; el resto queda en `error`.
 *
 * Uso:
 *   const { data, loading, error } = useProtectedQuery(() => getSalesReports(), [])
 */
export function useProtectedQuery<T>(
  action: () => Promise<T>,
  deps: ReadonlyArray<unknown> = []
): ProtectedQueryResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const actionRef = useRef(action)
  actionRef.current = action

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await actionRef.current()
      setData(result)
    } catch (e) {
      if (isSessionError(e)) {
        redirectToLogin()
        return
      }
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, ...deps])

  return { data, loading, error, refetch: run }
}
