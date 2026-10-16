'use client'

import { Mail, ShieldCheck } from 'lucide-react'
import { StatusBadge } from '@/components/tactical/StatusBadge'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { Pagination } from '@/components/tactical/Pagination'
import { DataTable } from '@/components/ui/DataTable'
import { SearchInput } from '@/components/ui/SearchInput'

interface UsersTableProps {
  rows: any[]
  filteredCount: number
  currentPage: number
  totalPages: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  searchQuery: string
  onSearchChange: (value: string) => void
}

export function UsersTable({
  rows,
  filteredCount,
  currentPage,
  totalPages,
  itemsPerPage,
  onPageChange,
  searchQuery,
  onSearchChange,
}: UsersTableProps) {
  return (
    <>
      <SectionPanel
        title="DIRECTORIO DE USUARIOS Y OPERADORES AUTORIZADOS"
        subtitle={`${filteredCount} USUARIO(S) · PÁGINA ${currentPage} DE ${totalPages}`}
        statusSlot={<StatusBadge status="online" label="SECURITY OK" />}
        action={
          <SearchInput
            placeholder="BUSCAR USUARIO / EMAIL..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            inputClassName="w-auto bg-input py-1.5"
          />
        }
        noPadding
      >
        <DataTable
          columns={[
            {
              key: 'name',
              header: 'OPERADOR / CORREO',
              render: (u: any) => (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-ash border border-line-hover flex items-center justify-center text-accent font-bold text-xs">
                    {u.name?.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-fg flex items-center gap-2">
                      <span>{u.name}</span>
                      {u.isCurrent && (
                        <span className="text-[10px] bg-accent text-black font-extrabold px-1.5 py-0.5 rounded">
                          ACTUAL
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-fg-muted flex items-center gap-1 mt-0.5">
                      <Mail className="w-3 h-3 text-fg-faint" />
                      <span>{u.email}</span>
                    </div>
                  </div>
                </div>
              ),
            },
            {
              key: 'role',
              header: 'ROL',
              render: (u: any) => (
                <span className="inline-flex items-center gap-1 bg-night-deep border border-line text-accent px-2.5 py-1 rounded text-[11px] font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" /> {u.role}
                </span>
              ),
            },
            {
              key: 'tenantName',
              header: 'EMPRESA',
              cellClassName: 'text-fg-muted',
              render: (u: any) => u.tenantName || '—',
            },
            {
              key: 'status',
              header: 'ESTADO',
              render: () => <StatusBadge status="online" label="ACTIVO" />,
            },
          ]}
          rows={rows}
          rowKey={(u: any) => u.id}
          rowClassName="hover:bg-hover transition-colors"
          emptyMessage="[NO HAY USUARIOS REGISTRADOS O COINCIDENTES]"
        />
      </SectionPanel>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredCount}
        itemsPerPage={itemsPerPage}
        onPageChange={onPageChange}
      />
    </>
  )
}
