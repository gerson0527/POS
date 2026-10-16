'use client'

import { Edit, Power } from 'lucide-react'
import { StatusBadge } from '@/components/tactical/StatusBadge'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { Pagination } from '@/components/tactical/Pagination'
import { DataTable } from '@/components/ui/DataTable'
import { SearchInput } from '@/components/ui/SearchInput'
import { formatCOP } from '@/lib/utils/pos-utils'

interface ProductsTableProps {
  rows: any[]
  searchQuery: string
  onSearchChange: (value: string) => void
  page: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  onEdit: (product: any) => void
  onToggle: (product: any) => void
}

export function ProductsTable({
  rows,
  searchQuery,
  onSearchChange,
  page,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onEdit,
  onToggle,
}: ProductsTableProps) {
  return (
    <div className="space-y-6">
      <SectionPanel
        title="DIRECTORIO DE PRODUCTOS Y STOCK KARDEX"
        subtitle="CATÁLOGO GENERAL DE PRODUCTOS Y EXISTENCIAS EN SISTEMA"
        action={
          <SearchInput
            placeholder="BUSCAR PRODUCTO / SKU..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            inputClassName="py-1.5"
          />
        }
        noPadding
      >
        <DataTable
          columns={[
            {
              key: 'sku',
              header: 'SKU CÓDIGO',
              thClassName: 'px-4 py-3.5',
              cellClassName: 'px-4 py-3.5 font-bold text-accent',
              render: (p: any) => `SKU-${p.sku || p.id.substring(0, 6)}`,
            },
            {
              key: 'name',
              header: 'NOMBRE PRODUCTO',
              thClassName: 'px-4 py-3.5',
              cellClassName: 'px-4 py-3.5 font-semibold text-fg',
              render: (p: any) => (
                <>
                  {p.name}
                  {p.status === 'INACTIVE' && (
                    <span className="ml-2 text-[10px] bg-red-dim text-alert border border-danger-line px-1.5 py-0.5 rounded font-bold">
                      INACTIVO
                    </span>
                  )}
                </>
              ),
            },
            {
              key: 'category',
              header: 'CATEGORÍA',
              thClassName: 'px-4 py-3.5',
              cellClassName: 'px-4 py-3.5 font-bold',
              render: (p: any) => (
                <span className="bg-night-mid text-warn-bright border border-line-mid px-2 py-0.5 rounded text-[10px] tracking-wider uppercase">
                  {p.category || 'General'}
                </span>
              ),
            },
            {
              key: 'unitPrice',
              header: 'PRECIO VENTA',
              thClassName: 'px-4 py-3.5',
              cellClassName: 'px-4 py-3.5 font-bold text-success',
              render: (p: any) => formatCOP(p.unitPrice),
            },
            {
              key: 'cost',
              header: 'COSTO',
              thClassName: 'px-4 py-3.5',
              cellClassName: 'px-4 py-3.5 text-fg-muted',
              render: (p: any) => (p.cost ? formatCOP(p.cost) : 'N/A'),
            },
            {
              key: 'margin',
              header: 'MARGEN %',
              thClassName: 'px-4 py-3.5',
              cellClassName: 'px-4 py-3.5 font-bold text-cyan',
              render: (p: any) =>
                p.margin !== undefined && p.margin !== null ? `${Number(p.margin).toFixed(1)}%` : '0%',
            },
            {
              key: 'ivaRate',
              header: 'IMPUESTO / IVA',
              thClassName: 'px-4 py-3.5',
              cellClassName: 'px-4 py-3.5 text-fg font-medium',
              render: (p: any) =>
                p.ivaRate == 0 ? '0% (Exento)' : p.ivaRate == 8 ? '8% (Impoconsumo)' : p.ivaRate == 5 ? '5% (Reducido)' : `${p.ivaRate || 19}% (IVA)`,
            },
            {
              key: 'stock',
              header: 'STOCK',
              thClassName: 'px-4 py-3.5',
              cellClassName: 'px-5 py-3.5 font-bold text-fg',
              render: (p: any) => `${p.quantity || 0} un.`,
            },
            {
              key: 'status',
              header: 'ESTADO',
              thClassName: 'px-4 py-3.5',
              cellClassName: 'px-5 py-3.5',
              render: (p: any) => (
                <StatusBadge
                  status={p.status === 'INACTIVE' ? 'critical' : (p.quantity || 0) > 0 ? 'online' : 'warning'}
                  label={p.status === 'INACTIVE' ? 'INACTIVO' : (p.quantity || 0) > 0 ? 'DISPONIBLE' : 'AGOTADO'}
                />
              ),
            },
            {
              key: 'actions',
              header: 'ACCIONES',
              align: 'right',
              thClassName: 'px-4 py-3.5',
              cellClassName: 'px-5 py-3.5',
              render: (p: any) => (
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => onEdit(p)}
                    className="p-1.5 bg-raised border border-line text-fg hover:border-accent hover:text-accent rounded transition-colors"
                    title="Editar Producto"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onToggle(p)}
                    className={`p-1.5 bg-raised border rounded transition-colors ${p.status === 'ACTIVE'
                      ? 'border-line text-ok hover:border-alert hover:text-alert'
                      : 'border-danger-line text-alert hover:border-ok hover:text-ok'
                      }`}
                    title={p.status === 'ACTIVE' ? 'Inactivar Producto' : 'Activar Producto'}
                  >
                    <Power className="w-3.5 h-3.5" />
                  </button>
                </div>
              ),
            },
          ]}
          rows={rows}
          rowKey={(p: any, idx) => (p.id ? `${p.id}-${idx}` : `prod-${idx}`)}
          rowClassName={(p: any) =>
            `hover:bg-hover transition-colors ${p.status === 'INACTIVE' ? 'opacity-60 bg-night-soft' : ''}`
          }
          emptyMessage={'[NO HAY PRODUCTOS REGISTRADOS // UTILICE EL BOTÓN "NUEVO PRODUCTO"]'}
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
