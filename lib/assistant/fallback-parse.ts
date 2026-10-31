import {
  assistantIntentSchema,
  type AssistantIntent,
  type PaymentMethodCode,
} from './intents'

/**
 * Parser sin LLM para frases típicas del POS.
 * Se usa cuando Zen/OpenAI falla (cuota free, 429, etc.).
 *
 * Formatos:
 *   Facturar Agua Mineral Sin Gas 600ml
 *   Factura 2 pan, 1 leche cliente 123456
 *   Factura 1 pan nequi 20000 efectivo resto
 *   Entrada 10 arroz
 *   Sale 3 leche merma
 *   Cuánto hay de azúcar
 */
export function tryParseIntentFallback(text: string): AssistantIntent | null {
  const raw = text.replace(/\s+/g, ' ').trim()
  if (!raw) return null

  const stock = raw.match(
    /^(?:cu[aá]nto\s+hay\s+de|stock(?:\s+de)?|existencia(?:es)?(?:\s+de)?)\s+(.+)$/i
  )
  if (stock?.[1]) {
    return safe({ type: 'STOCK_QUERY', query: stock[1].trim() })
  }

  const invIn = raw.match(
    /^(?:entrada|ingreso|mete|compra(?:r)?)\s+(\d+(?:[.,]\d+)?)\s+(?:de\s+|x\s+)?(.+)$/i
  )
  if (invIn) {
    return safe({
      type: 'INVENTORY_IN',
      items: [{ query: cleanProduct(invIn[2]), quantity: num(invIn[1]) }],
      notes: 'Asistente (parser local)',
    })
  }

  const invOut = raw.match(
    /^(?:salida|sale|saca|merma)\s+(\d+(?:[.,]\d+)?)\s+(?:de\s+|x\s+)?(.+)$/i
  )
  if (invOut) {
    const rest = invOut[2]
    const reason = /merma/i.test(raw) ? 'MERMA' : undefined
    return safe({
      type: 'INVENTORY_OUT',
      items: [{ query: cleanProduct(rest), quantity: num(invOut[1]) }],
      reason,
      notes: 'Asistente (parser local)',
    })
  }

  const sale = raw.match(
    /^(?:factura(?:r)?|facturaci[oó]n|cobrar|vender|venta)\s+(.+)$/i
  )
  if (sale?.[1]) {
    let rest = sale[1].trim()
    let documentNumber: string | undefined
    let customerName: string | undefined

    const { rest: afterPay, payments } = extractPayments(rest)
    rest = afterPay

    const cliente = rest.match(
      /\s+(?:al?\s+)?cliente\s+(\d{5,15}|consumidor\s*final|cf|[A-Za-zÁÉÍÓÚáéíóúñÑ][\wÁÉÍÓÚáéíóúñÑ\s.]{1,40})\s*$/i
    )
    if (cliente) {
      const hint = cliente[1].trim()
      if (/^\d+$/.test(hint)) documentNumber = hint
      else if (/consumidor\s*final|^cf$/i.test(hint)) {
        documentNumber = '222222222222'
        customerName = 'Consumidor Final'
      } else {
        customerName = hint
      }
      rest = rest.slice(0, cliente.index).trim()
    }

    const items = parseSaleItems(rest)
    if (!items.length) return null

    const payload: Record<string, unknown> = {
      type: 'CREATE_SALE',
      items,
      customer:
        documentNumber || customerName
          ? { documentNumber, name: customerName }
          : undefined,
      notes: 'Asistente (parser local)',
    }

    if (payments.length > 1 || (payments.length === 1 && payments[0].amount != null)) {
      payload.payments = payments
      payload.paymentMethod = payments[0].method
    } else {
      payload.paymentMethod = payments[0]?.method || 'CASH'
    }

    return safe(payload)
  }

  return null
}

function parseSaleItems(body: string): Array<{ query: string; quantity: number }> {
  const cleaned = cleanProduct(body)
  if (!cleaned) return []

  // "2 pan, 1 leche" | "2 pan y 1 leche" | "pan y 1 leche"
  const segments = cleaned
    .split(/\s*,\s*|\s+y\s+(?=\d+(?:[.,]\d+)?\s)/i)
    .map((s) => s.trim())
    .filter(Boolean)

  const items: Array<{ query: string; quantity: number }> = []
  for (const seg of segments) {
    const withQty = seg.match(/^(\d+(?:[.,]\d+)?)\s+(?:de\s+|x\s+|unidades?\s+de\s+)?(.+)$/i)
    if (withQty) {
      const query = cleanProduct(withQty[2])
      if (query) items.push({ query, quantity: num(withQty[1]) })
      continue
    }
    const q = cleanProduct(seg)
    if (q) items.push({ query: q, quantity: 1 })
  }
  return items
}

type PaySplit = { method: PaymentMethodCode; amount?: number }

function extractPayments(rest: string): { rest: string; payments: PaySplit[] } {
  let r = rest.trim()
  const found: PaySplit[] = []

  // Repetir desde el final: "en nequi 20000" | "efectivo resto" | "nequi"
  const piece =
    /\s+(?:en\s+)?(efectivo|cash|nequi|transferencia|transfer|tarjeta|card|cr[eé]dito|qr)(?:\s+(\d+(?:[.,]\d+)?|resto|restante))?\s*$/i

  for (let i = 0; i < 6; i++) {
    const m = r.match(piece)
    if (!m) break
    const method = mapPayment(m[1])
    const amountRaw = m[2]
    const amount =
      amountRaw && !/^resto|restante$/i.test(amountRaw) ? num(amountRaw) : undefined
    found.unshift({ method, amount })
    r = r.slice(0, m.index).trim()
  }

  return { rest: r, payments: found.length ? found : [{ method: 'CASH' }] }
}

function num(s: string): number {
  return Number(String(s).replace(',', '.'))
}

function cleanProduct(s: string): string {
  return s
    .replace(/\s+(?:en\s+)?(?:efectivo|cash|nequi|transferencia|tarjeta|qr)\s*$/i, '')
    .replace(/\s+(?:al?\s+)?cliente\s+.+$/i, '')
    .replace(/[.,;]+$/g, '')
    .trim()
}

function mapPayment(raw: string): PaymentMethodCode {
  const p = raw.toLowerCase()
  if (p.includes('nequi')) return 'NEQUI'
  if (p.includes('transfer')) return 'TRANSFER'
  if (p.includes('tarjeta') || p === 'card') return 'CARD'
  if (p.includes('qr')) return 'QR'
  if (p.includes('crédit') || p.includes('credit')) return 'STORE_CREDIT'
  return 'CASH'
}

function safe(value: unknown): AssistantIntent | null {
  const parsed = assistantIntentSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
