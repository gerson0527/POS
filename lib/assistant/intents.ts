import { z } from 'zod'

const saleLineItemSchema = z.object({
  query: z.string().min(1).describe('Nombre, SKU o alias del producto como lo dijo el usuario'),
  quantity: z.number().positive(),
})

/** En ajustes el signo puede venir negativo ("quita 2"). */
const inventoryLineItemSchema = z.object({
  query: z.string().min(1),
  quantity: z.number().refine((n) => Number.isFinite(n) && n !== 0, {
    message: 'La cantidad no puede ser cero',
  }),
})

const customerHintSchema = z
  .object({
    documentNumber: z.string().optional(),
    name: z.string().optional(),
  })
  .optional()

export const paymentMethodSchema = z.enum([
  'CASH',
  'TRANSFER',
  'NEQUI',
  'CARD',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'QR',
  'STORE_CREDIT',
])

/** Un tramo de pago. Si amount falta, ese medio recibe el remanente del total. */
const paymentSplitSchema = z.object({
  method: paymentMethodSchema,
  amount: z.number().positive().optional(),
})

export const createSaleIntentSchema = z.object({
  type: z.literal('CREATE_SALE'),
  items: z.array(saleLineItemSchema).min(1),
  customer: customerHintSchema,
  /** Pago único (compat). Si hay `payments`, se ignora. */
  paymentMethod: paymentMethodSchema.default('CASH'),
  /** Varios medios: "nequi 20000 efectivo resto". */
  payments: z.array(paymentSplitSchema).min(1).optional(),
  notes: z.string().optional(),
  allowWithoutStock: z.boolean().optional(),
})

export const inventoryMovementIntentSchema = z.object({
  type: z.enum(['INVENTORY_IN', 'INVENTORY_OUT', 'INVENTORY_ADJUSTMENT']),
  items: z.array(inventoryLineItemSchema).min(1),
  locationQuery: z.string().optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
})

export const stockQueryIntentSchema = z.object({
  type: z.literal('STOCK_QUERY'),
  query: z.string().min(1),
  locationQuery: z.string().optional(),
})

export const clarifyIntentSchema = z.object({
  type: z.literal('CLARIFY'),
  question: z.string().min(1),
})

export const unsupportedIntentSchema = z.object({
  type: z.literal('UNSUPPORTED'),
  reason: z.string().min(1),
})

export const assistantIntentSchema = z.discriminatedUnion('type', [
  createSaleIntentSchema,
  inventoryMovementIntentSchema,
  stockQueryIntentSchema,
  clarifyIntentSchema,
  unsupportedIntentSchema,
])

export type AssistantIntent = z.infer<typeof assistantIntentSchema>
export type CreateSaleIntent = z.infer<typeof createSaleIntentSchema>
export type InventoryMovementIntent = z.infer<typeof inventoryMovementIntentSchema>
export type PaymentMethodCode = z.infer<typeof paymentMethodSchema>

export const ASSISTANT_INTENT_SYSTEM_PROMPT = `Eres el extractor de intenciones de un POS retail en Colombia (Telegram/WhatsApp).
Devuelves ÚNICAMENTE un JSON válido que cumpla este esquema (sin markdown ni texto extra):

{
  "type": "CREATE_SALE" | "INVENTORY_IN" | "INVENTORY_OUT" | "INVENTORY_ADJUSTMENT" | "STOCK_QUERY" | "CLARIFY" | "UNSUPPORTED",
  ...campos según el tipo
}

Alcance permitido (NO salirte):
- Facturar / vender (CREATE_SALE)
- Entrada, salida o ajuste de inventario
- Consulta de stock
- Pedir aclaración (CLARIFY) si falta dato crítico
- UNSUPPORTED para anulación, nota crédito, traslados entre sedes, reportes, configuración o cualquier cosa fuera de lo anterior

Reglas CREATE_SALE:
- items: uno o varios [{query, quantity}]. Ej: "2 pan y 1 leche" → dos ítems.
- customer: solo si el usuario dio cédula/NIT o nombre. Si no mencionó cliente, omite customer (el sistema pedirá Consumidor Final).
- Si dice "consumidor final" / "CF": customer = { documentNumber: "222222222222", name: "Consumidor Final" }.
- paymentMethod: un solo medio (default CASH).
- payments: usar cuando hay varios medios. Ej: "nequi 20000 y efectivo resto" →
  [{"method":"NEQUI","amount":20000},{"method":"CASH"}] (sin amount = remanente).
- No inventes productos, precios ni documentos. No calcules totales. No escribas SQL.

Reglas inventario / stock:
- INVENTORY_IN / OUT / ADJUSTMENT: items[{query, quantity}]. En ajuste quantity puede ser negativa si dice "quita"/"baja".
- STOCK_QUERY: query = producto.

CLARIFY: question en español claro si falta cantidad o el pedido es ambiguo sin opciones.
Español colombiano coloquial: "facturame", "mete 3 coca", "saca 2 de merma".`
