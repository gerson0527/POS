// dian-status.ts — Estados DIAN/fiscales centralizados (Fase 4.25, §7.1).
//
// Antes vivían en app/actions/_shared.ts (FISCAL_DOCUMENT_STATUSES + mapFiscalStatus),
// con estados equivalentes repartidos en lib/types (InvoiceStatus), factus-service
// (dianStatus crudo de Factus) y getAllInvoices (chequeos de 'ISSUED'/'ACCEPTED').
// Fuente única: la tabla fiscal_document sigue siendo la autoridad del enum.

/** Estados soportados por la tabla fiscal_document (FiscalDocumentStatus). */
export const FISCAL_DOCUMENT_STATUSES = [
  'PENDING_GENERATION',
  'NUMBER_RESERVED',
  'GENERATED',
  'SIGNED',
  'QUEUED',
  'SUBMITTED',
  'ACCEPTED',
  'REJECTED',
  'RETRY_SCHEDULED',
  'CONTINGENCY_ISSUED',
  'TECHNICAL_FAILURE',
] as const

export type FiscalDocumentStatus = (typeof FISCAL_DOCUMENT_STATUSES)[number]

/**
 * Mapea el estado devuelto por Factus/DIAN al enum real de la tabla fiscal_document
 * (FiscalDocumentStatus). Valores fuera del enum se normalizan a ACCEPTED.
 */
export function mapFiscalStatus(dianStatus?: string): string {
  const raw = (dianStatus || '').trim().toUpperCase()
  if ((FISCAL_DOCUMENT_STATUSES as readonly string[]).includes(raw)) return raw
  if (raw.includes('REJECT') || raw.includes('RECHAZ')) return 'REJECTED'
  if (raw.includes('PEND')) return 'SUBMITTED'
  if (raw.includes('QUEUE') || raw.includes('COLA')) return 'QUEUED'
  return 'ACCEPTED'
}
