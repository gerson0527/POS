'use client'

import { Plus, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Pagination } from '@/components/tactical/Pagination'
import { DataTable } from '@/components/ui/DataTable'

interface MovementsTableProps {
  rows: any[]
  totalItems: number
  page: number
  totalPages: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  onNew: () => void
}

export function MovementsTable({
  rows,
  totalItems,
  page,
  totalPages,
  itemsPerPage,
  onPageChange,
  onNew,
}: MovementsTableProps) {
  return (
    <div className="space-y-4">
      <SectionPanel
        title="LOG COMPLETO DE MOVIMIENTOS KARDEX"
        subtitle="AUDITORÍA DE ENTRADAS Y SALIDAS DE STOCK"
        action={
          <TacticalButton
            variant="primary"
            size="sm"
            onClick={onNew}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            REGISTRAR KARDEX
          </TacticalButton>
        }
        noPadding
      >
        <DataTable
          columns={[
            {
              key: 'createdAt',
              header: 'TIMESTAMP',
              thClassName: 'px-5 py-3.5',
              cellClassName: 'px-5 py-3.5 text-fg-muted',
              render: (m: any) => new Date(m.createdAt).toLocaleString(),
            },
            {
              key: 'product',
              header: 'PRODUCTO',
              thClassName: 'px-5 py-3.5',
              cellClassName: 'px-5 py-3.5 font-bold text-fg',
              render: (m: any) => (m.productName ? `${m.productName} (${m.sku || 'SKU'})` : m.productId),
            },
            {
              key: 'movementType',
              header: 'TIPO OPERACIÓN',
              thClassName: 'px-5 py-3.5',
              cellClassName: 'px-5 py-3.5',
              render: (m: any) =>
                m.movementType === 'IN' ? (
                  <span className="inline-flex items-center gap-1 text-success font-bold bg-ok-dim border border-ok-line px-2 py-0.5 rounded text-[10px]">
                    <ArrowDownLeft className="w-3 h-3" /> ENTRADA
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-danger font-bold bg-alert-dim border border-alert-line px-2 py-0.5 rounded text-[10px]">
                    <ArrowUpRight className="w-3 h-3" /> SALIDA
                  </span>
                ),
            },
            {
              key: 'quantity',
              header: 'CANTIDAD',
              thClassName: 'px-5 py-3.5',
              cellClassName: 'px-5 py-3.5 text-fg',
              render: (m: any) => `${m.quantity} unidades`,
            },
            {
              key: 'notes',
              header: 'NOTAS',
              thClassName: 'px-5 py-3.5',
              cellClassName: 'px-5 py-3.5 text-fg-muted',
              render: (m: any) => m.notes || 'N/A',
            },
          ]}
          rows={rows}
          rowKey={(m: any) => m.id}
          rowClassName="hover:bg-hover transition-colors"
          emptyMessage="[NO HAY MOVIMIENTOS KARDEX REGISTRADOS EN LA BASE DE DATOS]"
        />
      </SectionPanel>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={itemsPerPage}
        onPageChange={onPageChange}
      />
    </div>
  )
}
