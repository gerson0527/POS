// payment-methods.ts — Catálogo unificado de métodos de pago (Fase 4.25, §7.1).
//
// El POS usaba 3 vocabularios de pago en distintos archivos:
//   1. POS_TO_FACTUS_PAYMENT_METHOD (lib/invoicing/factus.ts)  → códigos enviados a Factus/DIAN
//   2. DIAN_PAYMENTS (components/invoices/invoice-utils.ts)    → códigos impresos en el ticket
//   3. mapMethodName (app/actions/invoices.ts)                 → etiquetas cortas para la UI
// OJO: los códigos NO son intercambiables (Factus usa 48/49 para tarjetas; el ticket
// imprime 20/30). Se conservan los valores originales de cada vocabulario; aquí solo
// se unifica la ubicación y se les da nombre explícito.

/** Vocabulario 1: método de pago POS → código DIAN para Factus (/v2/bills). */
export const FACTUS_PAYMENT_CODES: Record<string, string> = {
  CASH: '10',
  EFECTIVO: '10',
  CARD: '48',
  CREDIT_CARD: '48',
  DEBIT_CARD: '49',
  TRANSFER: '42',
  TRANSFERENCIA: '42',
  NEQUI: '47',
  QR: '47',
  BONOS: '71',
  STORE_CREDIT: '10',
}

/** Vocabulario 2: forma de pago con código oficial DIAN para el ticket de venta. */
export const DIAN_TICKET_PAYMENTS: Record<string, { code: string; label: string }> = {
  CASH: { code: '10', label: 'Efectivo' },
  EFECTIVO: { code: '10', label: 'Efectivo' },
  DEBIT_CARD: { code: '20', label: 'Tarjeta débito' },
  TARJETA_DEBITO: { code: '20', label: 'Tarjeta débito' },
  CREDIT_CARD: { code: '30', label: 'Tarjeta crédito' },
  TARJETA_CREDITO: { code: '30', label: 'Tarjeta crédito' },
  CARD: { code: '30', label: 'Tarjeta' },
  TRANSFER: { code: '42', label: 'Transferencia electrónica' },
  TRANSFERENCIA: { code: '42', label: 'Transferencia electrónica' },
  NEQUI: { code: '42', label: 'Nequi (transferencia)' },
  DAVIPLATA: { code: '42', label: 'Daviplata (transferencia)' },
  STORE_CREDIT: { code: '99', label: 'Crédito cuenta corriente' },
}

/** Vocabulario 3: etiquetas cortas para la tabla de facturas en la UI. */
export const POS_PAYMENT_LABELS: Record<string, string> = {
  CASH: 'EFECTIVO',
  EFECTIVO: 'EFECTIVO',
  NEQUI: 'NEQUI',
  TRANSFER: 'TRANSFERENCIA',
  TRANSFERENCIA: 'TRANSFERENCIA',
  CREDIT_CARD: 'T. CRÉDITO',
  TARJETA_CREDITO: 'T. CRÉDITO',
  DEBIT_CARD: 'T. DÉBITO',
  TARJETA_DEBITO: 'T. DÉBITO',
  STORE_CREDIT: 'CRÉDITO',
}

/** Método de pago POS → código DIAN/Factus (default '10' = efectivo). */
export function factusPaymentCode(posMethod: string): string {
  if (!posMethod) return '10'
  return FACTUS_PAYMENT_CODES[posMethod.toUpperCase().trim()] || '10'
}

/** Forma de pago → código+etiqueta para el ticket (fallback 'ZZ' = otra forma de pago). */
export function dianTicketPayment(method?: string, reference?: string) {
  const m = DIAN_TICKET_PAYMENTS[(method || '').toUpperCase()] || {
    code: 'ZZ',
    label: method || 'Otra forma de pago',
  }
  return { code: m.code, label: m.label, reference }
}

/** Método de pago POS → etiqueta corta para la UI (default: el valor crudo). */
export function posPaymentLabel(m: string): string {
  if (!m || m === 'CASH' || m === 'EFECTIVO') return 'EFECTIVO'
  return POS_PAYMENT_LABELS[m] || m
}
