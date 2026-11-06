'use server'
// Server Actions del módulo de devoluciones a cliente. Módulo operativo del
// sistema: no emite ni transmite documentos electrónicos DIAN.
import { revalidatePath } from 'next/cache'
import type { CreateCustomerReturnDTO } from '@/lib/types'
import {
  RETURN_READ_ROLES,
  RETURN_ROLES,
  createCustomerReturn as createCustomerReturnForActor,
  getCustomerReturnDetail as getCustomerReturnDetailForActor,
  getCustomerReturns as getCustomerReturnsForActor,
  getReturnableSale as getReturnableSaleForActor,
  searchReturnableSales as searchReturnableSalesForActor,
} from '@/lib/returns/service'
import { requireActor } from './_shared'
import { safeAction } from './_result'

export async function searchSalesForReturn(query: string) {
  const actor = await requireActor([...RETURN_READ_ROLES])
  return searchReturnableSalesForActor(actor, query)
}

export async function getSaleForReturn(saleId: string) {
  const actor = await requireActor([...RETURN_READ_ROLES])
  return getReturnableSaleForActor(actor, saleId)
}

export async function createCustomerReturn(input: CreateCustomerReturnDTO) {
  return safeAction(
    async () => {
      const actor = await requireActor([...RETURN_ROLES])
      const result = await createCustomerReturnForActor(actor, input)
      revalidatePath('/dashboard/returns')
      revalidatePath('/dashboard/cashier')
      revalidatePath('/dashboard/cash-closure')
      revalidatePath('/dashboard/inventory')
      revalidatePath('/dashboard/customers')
      return { success: true as const, ...result }
    },
    'No se pudo registrar la devolución. Verifique las cantidades disponibles de la factura.'
  )
}

export async function getReturnsList(filters?: {
  search?: string
  dateFrom?: string
  dateTo?: string
}) {
  const actor = await requireActor([...RETURN_READ_ROLES])
  return getCustomerReturnsForActor(actor, filters)
}

export async function getReturnDetail(returnId: string) {
  const actor = await requireActor([...RETURN_READ_ROLES])
  return getCustomerReturnDetailForActor(actor, returnId)
}
