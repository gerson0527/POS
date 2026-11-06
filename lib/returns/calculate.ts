// Cálculo puro de devoluciones a cliente. No toca base de datos para poder
// reutilizarse en el servidor (validación/totales definitivos) y en el cliente
// (previsualización en vivo del reembolso).

export const RETURN_EPSILON = 0.005

export interface ReturnSaleItemInput {
  id: string
  productId?: string | null
  productName?: string | null
  quantity: number
  unitPrice: number
  ivaRate: number
  ivaAmount: number
  lineTotal: number
}

export interface RequestedReturnItem {
  saleItemId: string
  quantity: number
}

export interface ReturnedQuantity {
  saleItemId: string
  quantity: number
}

export interface ReturnCalculationInput {
  saleTotal: number
  saleItems: ReturnSaleItemInput[]
  requestedItems: RequestedReturnItem[]
  alreadyReturned?: ReturnedQuantity[]
  /** Suma de devoluciones anteriores ya registradas para esta venta. */
  previousReturnTotal?: number
}

export interface ReturnCalculationLine {
  saleItemId: string
  productId: string | null
  productName: string | null
  quantity: number
  unitPrice: number
  ivaRate: number
  ivaAmount: number
  lineSubtotal: number
  lineTotal: number
  alreadyReturnedQuantity: number
  remainingQuantity: number
}

export interface ReturnCalculationResult {
  lines: ReturnCalculationLine[]
  subtotal: number
  taxAmount: number
  total: number
  /** true cuando esta devolución deja la venta completamente devuelta. */
  fullyReturnsSale: boolean
}

export function roundReturnMoney(value: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

function normalizeQuantity(value: number): number {
  return roundReturnMoney(value)
}

/**
 * Calcula las líneas y totales de una devolución.
 *
 * Los ítems de venta guardan su valor bruto (sin el descuento global de la
 * venta). Para devolver exactamente lo cobrado se aplica el mismo factor
 * `saleTotal / suma(lineTotal)` de la venta original. En devoluciones
 * parciales se respeta la proporción y nunca se supera el saldo pendiente de
 * la venta.
 */
export function calculateReturn(input: ReturnCalculationInput): ReturnCalculationResult {
  const saleTotal = roundReturnMoney(input.saleTotal)
  if (!Number.isFinite(saleTotal) || saleTotal <= 0) {
    throw new Error('La venta no tiene un valor válido para devolver.')
  }
  if (!input.saleItems.length) {
    throw new Error('La venta no tiene productos para devolver.')
  }
  if (!input.requestedItems.length) {
    throw new Error('Seleccione al menos un producto para devolver.')
  }

  const saleItemsById = new Map(input.saleItems.map((item) => [item.id, item]))
  const returnedByItem = new Map<string, number>()
  for (const row of input.alreadyReturned ?? []) {
    returnedByItem.set(
      row.saleItemId,
      roundReturnMoney((returnedByItem.get(row.saleItemId) ?? 0) + Number(row.quantity || 0))
    )
  }

  // Consolidar duplicados: el cliente puede enviar dos veces el mismo ítem.
  const requestedByItem = new Map<string, number>()
  for (const row of input.requestedItems) {
    if (!row?.saleItemId) throw new Error('Ítem de venta inválido en la devolución.')
    const quantity = normalizeQuantity(Number(row.quantity))
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Todas las cantidades a devolver deben ser mayores que cero.')
    }
    requestedByItem.set(
      row.saleItemId,
      roundReturnMoney((requestedByItem.get(row.saleItemId) ?? 0) + quantity)
    )
  }

  const grossTotal = input.saleItems.reduce(
    (sum, item) => sum + Number(item.lineTotal || 0),
    0
  )
  const factor = grossTotal > 0 ? saleTotal / grossTotal : 1

  const lines: ReturnCalculationLine[] = []
  for (const [saleItemId, quantity] of requestedByItem) {
    const item = saleItemsById.get(saleItemId)
    if (!item) throw new Error('El producto no pertenece a la venta seleccionada.')

    const soldQuantity = roundReturnMoney(Number(item.quantity))
    if (soldQuantity <= 0) {
      throw new Error('La venta tiene una cantidad inválida en uno de sus productos.')
    }

    const alreadyReturnedQuantity = Math.min(
      soldQuantity,
      returnedByItem.get(saleItemId) ?? 0
    )
    const remainingQuantity = roundReturnMoney(soldQuantity - alreadyReturnedQuantity)

    if (quantity > remainingQuantity + RETURN_EPSILON) {
      throw new Error(
        `La cantidad a devolver (${quantity}) supera lo disponible (${remainingQuantity}) para ${
          item.productName || item.productId || 'el producto'
        }.`
      )
    }

    const fraction = quantity / soldQuantity
    const effectiveLineTotal = roundReturnMoney(
      Number(item.lineTotal || 0) * factor * fraction
    )
    const effectiveTax = roundReturnMoney(
      Number(item.ivaAmount || 0) * factor * fraction
    )
    const effectiveSubtotal = roundReturnMoney(Math.max(0, effectiveLineTotal - effectiveTax))

    lines.push({
      saleItemId,
      productId: item.productId ?? null,
      productName: item.productName ?? null,
      quantity,
      unitPrice: roundReturnMoney(Number(item.unitPrice)),
      ivaRate: Number(item.ivaRate || 0),
      ivaAmount: effectiveTax,
      lineSubtotal: effectiveSubtotal,
      lineTotal: effectiveLineTotal,
      alreadyReturnedQuantity,
      remainingQuantity,
    })
  }

  // ¿Esta devolución completa todas las líneas pendientes de la venta?
  const fullyReturnsSale = input.saleItems.every((item) => {
    const sold = roundReturnMoney(Number(item.quantity))
    const previously = returnedByItem.get(item.id) ?? 0
    const requested = requestedByItem.get(item.id) ?? 0
    return previously + requested >= sold - RETURN_EPSILON
  })

  const previousReturnTotal = Math.max(0, roundReturnMoney(input.previousReturnTotal ?? 0))
  const remainingTotal = Math.max(0, roundReturnMoney(saleTotal - previousReturnTotal))

  let total: number
  if (fullyReturnsSale) {
    // Se reembolsa exactamente el saldo pendiente para no dejar centavos
    // perdidos por el redondeo global de la venta.
    total = remainingTotal
    const lineSum = lines.reduce((sum, line) => sum + line.lineTotal, 0)
    const difference = roundReturnMoney(total - lineSum)
    if (lines.length > 0 && difference !== 0) {
      const last = lines[lines.length - 1]
      last.lineTotal = roundReturnMoney(last.lineTotal + difference)
      last.lineSubtotal = roundReturnMoney(Math.max(0, last.lineTotal - last.ivaAmount))
    }
  } else {
    const rawTotal = lines.reduce((sum, line) => sum + line.lineTotal, 0)
    total = Math.min(roundReturnMoney(rawTotal), remainingTotal)
  }

  if (total <= 0) {
    throw new Error('El valor de la devolución debe ser mayor que cero.')
  }

  const subtotal = lines.reduce((sum, line) => sum + line.lineSubtotal, 0)
  const taxAmount = lines.reduce((sum, line) => sum + line.ivaAmount, 0)

  return {
    lines,
    subtotal: roundReturnMoney(subtotal),
    taxAmount: roundReturnMoney(taxAmount),
    total: roundReturnMoney(total),
    fullyReturnsSale,
  }
}
