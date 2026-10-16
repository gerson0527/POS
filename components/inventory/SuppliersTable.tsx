'use client'

import { Plus, Trash2 } from 'lucide-react'
import { StatusBadge } from '@/components/tactical/StatusBadge'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Pagination } from '@/components/tactical/Pagination'

interface SuppliersTableProps {
  rows: any[]
  totalItems: number
  page: number
  totalPages: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  onNew: () => void
  onDelete: (id: string, name: string) => void
}

export function SuppliersTable({
  rows,
  totalItems,
  page,
  totalPages,
  itemsPerPage,
  onPageChange,
  onNew,
  onDelete,
}: SuppliersTableProps) {
  return (
    <div>
      <SectionPanel
        title="DIRECTORIO DE PROVEEDORES"
        subtitle="DIRECTORIO COMERCIAL DE PROVEEDORES Y ALIADOS"
        action={
          <TacticalButton
            variant="primary"
            size="sm"
            onClick={onNew}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            NUEVO PROVEEDOR
          </TacticalButton>
        }
      >
        {rows.length === 0 ? (
          <div className="py-12 text-center text-xs text-fg-muted border border-dashed border-line rounded bg-surface">
            [NO HAY PROVEEDORES REGISTRADOS EN LA BASE DE DATOS // UTILICE EL BOTÓN "NUEVO PROVEEDOR"]
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rows.map((s) => (
              <div key={s.id} className="bg-surface border border-line rounded p-5 space-y-2.5 hover:border-accent transition-colors text-xs">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-fg text-sm">{s.name}</h4>
                  <div className="flex items-center gap-2">
                    <StatusBadge status="online" label="ACTIVO" />
                    <button
                      onClick={() => onDelete(s.id, s.name)}
                      className="p-1 bg-raised border border-line text-alert hover:bg-alert hover:text-black rounded transition-colors"
                      title="Eliminar Proveedor"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-fg-muted">📍 NIT: {s.nit || 'N/A'}</p>
                <p className="text-fg-muted">📧 {s.email || 'N/A'}</p>
                <p className="text-fg-muted">📞 {s.phone || 'N/A'}</p>
                {s.address && <p className="text-fg-muted">🏠 {s.address}</p>}
              </div>
            ))}
          </div>
        )}
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
