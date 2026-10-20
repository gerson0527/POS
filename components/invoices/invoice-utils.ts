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

export function fiscalUiStatus(inv: any) {
  const status = String(
    inv?.fiscalDocument?.status || inv?.dianStatus || inv?.status || ''
  ).toUpperCase()
  const cufe = inv?.cufe || inv?.fiscalDocument?.uniqueCode || null
  const isAccepted = status === 'ACCEPTED'
  const isRejected = status === 'REJECTED' || status === 'TECHNICAL_FAILURE'
  const isTransmitted = Boolean(cufe) && !isRejected
  const canTransmit = !cufe && !isRejected && status !== 'QUEUED' && status !== 'SUBMITTED'
  return {
    status,
    label: FISCAL_STATUS_LABELS[status] || (cufe ? 'TRANSMITIDA' : 'PENDIENTE'),
    cufe,
    isAccepted,
    isRejected,
    isTransmitted,
    canTransmit,
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
