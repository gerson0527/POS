import type { RefundMethod } from '@/lib/types'

export const REFUND_METHODS: RefundMethod[] = [
  'NONE',
  'CASH',
  'CARD',
  'TRANSFER',
  'CREDIT_BALANCE',
]

export const REFUND_METHOD_LABELS: Record<RefundMethod, string> = {
  NONE: 'Sin reembolso (solo producto)',
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  CREDIT_BALANCE: 'Abono a cartera',
}

export const RETURN_REASON_OTHER = 'OTHER'

export const RETURN_REASONS: Array<{ value: string; label: string }> = [
  { value: 'Producto defectuoso', label: 'Producto defectuoso' },
  { value: 'Producto dañado o en mal estado', label: 'Producto dañado o en mal estado' },
  { value: 'Talla o medida incorrecta', label: 'Talla o medida incorrecta' },
  { value: 'Color o referencia incorrecta', label: 'Color o referencia incorrecta' },
  { value: 'Error de facturación', label: 'Error de facturación' },
  { value: 'Producto vencido', label: 'Producto vencido' },
  { value: 'Cambio por otro producto', label: 'Cambio por otro producto' },
  { value: 'No corresponde a lo solicitado', label: 'No corresponde a lo solicitado' },
  { value: 'Garantía', label: 'Garantía' },
  { value: RETURN_REASON_OTHER, label: 'Otro' },
]
