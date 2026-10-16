'use client'

import { Plus } from 'lucide-react'
import { StatusBadge } from '@/components/tactical/StatusBadge'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Pagination } from '@/components/tactical/Pagination'
import { DataTable } from '@/components/ui/DataTable'
import { formatCOP } from '@/lib/utils/pos-utils'

interface PurchaseOrdersTableProps {
  rows: any[]
  totalItems: number
  page: number
  totalPages: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  onNew: () => void
}

export function PurchaseOrdersTable({
  rows,
  totalItems,
  page,
  totalPages,
  itemsPerPage,
  onPageChange,
  onNew,
}: PurchaseOrdersTableProps) {
  return (
    <div>
      <SectionPanel
        title="ÓRDENES DE COMPRA PROCESADAS (PURCHASE ORDERS)"
        subtitle="HISTORIAL DE ORDENAMIENTO A PROVEEDORES"
        action={
          <TacticalButton
            variant="primary"
            size="sm"
            onClick={onNew}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            NUEVA PO
          </TacticalButton>
        }
        noPadding
      >
        <DataTable
          columns={[
            {
              key: 'poNumber',
              header: 'CÓDIGO PO',
              thClassName: 'px-5 py-3.5',
              cellClassName: 'px-5 py-3.5 font-bold text-accent',
              render: (po: any) => po.poNumber || po.id,
            },
            {
              key: 'supplier',
              header: 'PROVEEDOR',
              thClassName: 'px-5 py-3.5',
              cellClassName: 'px-5 py-3.5 text-fg font-medium',
              render: (po: any) => po.supplierName || po.supplierId,
            },
            {
              key: 'total',
              header: 'MONTO TOTAL',
              thClassName: 'px-5 py-3.5',
              cellClassName: 'px-5 py-3.5 font-bold text-success',
              render: (po: any) => formatCOP(po.total),
            },
            {
              key: 'status',
              header: 'ESTADO',
              thClassName: 'px-5 py-3.5',
              cellClassName: 'px-5 py-3.5',
              render: (po: any) => <StatusBadge status="online" label={po.status} />,
            },
            {
              key: 'createdAt',
              header: 'FECHA REGISTRO',
              thClassName: 'px-5 py-3.5',
              cellClassName: 'px-5 py-3.5 text-fg-muted',
              render: (po: any) => new Date(po.createdAt).toLocaleDateString(),
            },
          ]}
          rows={rows}
          rowKey={(po: any) => po.id}
          rowClassName="hover:bg-hover transition-colors"
          emptyMessage={'[NO HAY ÓRDENES DE COMPRA REGISTRADAS EN LA BASE DE DATOS // UTILICE EL BOTÓN "NUEVA PO"]'}
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
