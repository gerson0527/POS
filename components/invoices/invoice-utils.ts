// Vocabulario de pago del ticket: catálogo único en lib/catalogs/payment-methods.ts
// (Fase 4.25); se re-exporta con sus nombres históricos para no romper consumidores.
export {
  DIAN_TICKET_PAYMENTS as DIAN_PAYMENTS,
  dianTicketPayment as dianPayment,
} from '@/lib/catalogs/payment-methods'

/** El CUFE (96 hex) se imprime en líneas cortas para que no se corte en papel térmico. */
export function cufeLines(cufe?: string | null): string[] {
  if (!cufe) return []
  return cufe.toUpperCase().match(/.{1,32}/g) || [cufe.toUpperCase()]
}

const FISCAL_STATUS_LABELS: Record<string, string> = {
  PENDING_GENERATION: 'PENDIENTE',
  NUMBER_RESERVED: 'NUMERACIÓN RESERVADA',
  GENERATED: 'GENERADA',
  SIGNED: 'FIRMADA',
  QUEUED: 'EN COLA',
  SUBMITTED: 'TRANSMITIDA',
  ACCEPTED: 'ACEPTADA',
  REJECTED: 'RECHAZADA',
  RETRY_SCHEDULED: 'REINTENTO PROGRAMADO',
  CONTINGENCY_ISSUED: 'CONTINGENCIA',
  TECHNICAL_FAILURE: 'FALLA TÉCNICA',
}

/** Errores de "sin proveedor FE" no son fallos DIAN: no mostrar REINTENTAR. */
export function isNoElectronicProviderError(message?: string | null): boolean {
  const m = String(message || '')
  return (
    /no hay proveedor de facturaci[oó]n electr[oó]nica/i.test(m) ||
    /facturaci[oó]n electr[oó]nica no configurada/i.test(m) ||
    /config[uú]relo en \/dashboard\/settings/i.test(m)
  )
}

export function fiscalUiStatus(inv: any) {
  const status = String(
    inv?.fiscalDocument?.status || inv?.dianStatus || inv?.status || ''
  ).toUpperCase()
  const cufe = inv?.cufe || inv?.fiscalDocument?.uniqueCode || null
  const outboxStatus = String(inv?.outboxStatus || '').toUpperCase()
  const requiresManualApproval = Boolean(inv?.requiresManualApproval)
  const needsReconciliation = Boolean(inv?.needsReconciliation)
  const isRejected = status === 'REJECTED' || status === 'TECHNICAL_FAILURE'
  // Si hay CUFE y no está rechazada, ya no se muestra TRANSMITIR/REINTENTAR.
  // "ACEPTADA" solo cuando el estado fiscal lo confirma; si no, "TRANSMITIDA".
  const isAccepted = Boolean(cufe) && !isRejected && status === 'ACCEPTED'
  const isTransmitted = Boolean(cufe) && !isRejected

  const rawOutboxError = String(inv?.outboxLastError || '').trim() || null
  const noProviderConfigured =
    !cufe &&
    (inv?.electronicInvoicingEnabled === false ||
      isNoElectronicProviderError(rawOutboxError))

  const isManualPending =
    !cufe &&
    !isRejected &&
    !noProviderConfigured &&
    requiresManualApproval &&
    outboxStatus !== 'DONE'
  const isQueued =
    !cufe &&
    !isRejected &&
    !noProviderConfigured &&
    !requiresManualApproval &&
    (outboxStatus === 'PENDING' || outboxStatus === 'PROCESSING')
  const needsReconciliationUi =
    !cufe && !noProviderConfigured && needsReconciliation && !isRejected
  const isOutboxFailed =
    !cufe &&
    !noProviderConfigured &&
    outboxStatus === 'FAILED' &&
    !isRejected

  let label = FISCAL_STATUS_LABELS[status] || (cufe ? 'TRANSMITIDA' : 'PENDIENTE')
  if (!cufe && !isRejected) {
    if (noProviderConfigured) label = ''
    else if (needsReconciliationUi) label = 'RECONCILIAR'
    else if (isManualPending) label = 'PENDIENTE MANUAL'
    else if (isOutboxFailed) label = 'ERROR (REINTENTAR)'
    else if (isQueued) label = 'EN COLA'
  }

  // Sin cron local las ventas EN COLA se quedan eternamente: el usuario debe
  // poder reintentar desde /dashboard/invoices. Un rechazo DIAN no se reintenta
  // con el mismo payload (requiere corrección / nota crédito).
  const canTransmit = !cufe && !isRejected && !noProviderConfigured
  // No mostrar errores viejos del outbox si la factura ya tiene CUFE o el
  // evento quedó DONE (p. ej. cliente se completó después del primer fallo).
  const outboxLastError =
    !cufe && outboxStatus !== 'DONE' && !noProviderConfigured
      ? rawOutboxError
      : null

  return {
    status,
    label,
    cufe,
    isAccepted,
    isRejected,
    isTransmitted,
    isManualPending,
    isQueued,
    isOutboxFailed,
    noProviderConfigured,
    needsReconciliation: needsReconciliationUi,
    canTransmit,
    outboxLastError,
  }
}

export function invoiceFlags(inv: any) {
  const ticketFormatted = inv.ticketNumber
    ? `FACT-#${String(inv.ticketNumber).padStart(4, '0')}`
    : `REC-${inv.id.substring(0, 8).toUpperCase()}`
  const totalItemsCount = inv.items
    ? inv.items.reduce((acc: number, item: any) => acc + Number(item.quantity || 1), 0)
    : 0
  const isMixedPayment = inv.paymentMethod?.includes('MIXTO') || (inv.payments && inv.payments.length > 1)
  const isWithoutStock = inv.notes?.includes('SIN STOCK') || inv.notes?.includes('WITHOUT_STOCK')
  const fiscal = fiscalUiStatus(inv)
  return {
    ticketFormatted,
    totalItemsCount,
    isMixedPayment,
    isWithoutStock,
    isSent: fiscal.isTransmitted || fiscal.isAccepted,
    fiscal,
  }
}
