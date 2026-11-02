// Claves del borrador de venta del POS en localStorage.
// Se mantienen juntas para poder limpiarlas en bloque (p. ej. al cerrar sesión).

export const POS_CART_STORAGE_KEY = 'pos:cart:v1'
export const POS_DISCOUNT_STORAGE_KEY = 'pos:discount:v1'
export const POS_CUSTOMER_STORAGE_KEY = 'pos:customer:v1'
export const POS_CUSTOMER_CREDIT_STORAGE_KEY = 'pos:customer-credit:v1'

export const POS_DRAFT_STORAGE_KEYS = [
  POS_CART_STORAGE_KEY,
  POS_DISCOUNT_STORAGE_KEY,
  POS_CUSTOMER_STORAGE_KEY,
  POS_CUSTOMER_CREDIT_STORAGE_KEY,
] as const

/**
 * Elimina el borrador del POS del navegador. Se usa al cerrar sesión para que
 * el siguiente usuario no vea el carrito o el cliente del anterior.
 */
export function clearPosDraftStorage() {
  try {
    for (const key of POS_DRAFT_STORAGE_KEYS) {
      window.localStorage.removeItem(key)
    }
  } catch {
    // Storage bloqueado: nada que limpiar.
  }
}
