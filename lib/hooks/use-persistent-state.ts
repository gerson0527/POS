'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

interface PersistentState<T> {
  value: T
  hydrated: boolean
}

/**
 * `useState` que persiste el valor en `localStorage`.
 *
 * - Hidrata después del montaje (evita desajustes de hidratación SSR).
 * - Se sincroniza entre pestañas del mismo navegador vía el evento `storage`.
 * - Si el JSON guardado está corrupto o el storage no está disponible, ignora
 *   el error y sigue trabajando con el valor inicial.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [state, setState] = useState<PersistentState<T>>({
    value: initialValue,
    hydrated: false,
  })

  // Leer el valor guardado una sola vez al montar (o si cambia la clave).
  useEffect(() => {
    let next = initialValue
    try {
      const raw = window.localStorage.getItem(key)
      if (raw !== null) next = JSON.parse(raw) as T
    } catch {
      // JSON inválido o storage bloqueado: se usa el valor inicial.
    }
    setState({ value: next, hydrated: true })
    // `initialValue` se omite a propósito: solo debe usarse al hidratar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Guardar cambios posteriores a la hidratación.
  useEffect(() => {
    if (!state.hydrated) return
    try {
      window.localStorage.setItem(key, JSON.stringify(state.value))
    } catch {
      // Sin espacio o storage bloqueado: no interrumpir la venta.
    }
  }, [key, state])

  // Reflejar cambios hechos desde otra pestaña.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== key) return
      if (event.newValue === null) {
        setState({ value: initialValue, hydrated: true })
        return
      }
      try {
        setState({ value: JSON.parse(event.newValue) as T, hydrated: true })
      } catch {
        // Ignorar valores corruptos de otra pestaña.
      }
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const setValue = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    setState((prev) => ({
      value:
        typeof next === 'function'
          ? (next as (current: T) => T)(prev.value)
          : next,
      hydrated: prev.hydrated,
    }))
  }, [])

  return [state.value, setValue, state.hydrated]
}
