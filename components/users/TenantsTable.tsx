'use client'

import { Users, Mail, Activity } from 'lucide-react'
import { StatusBadge } from '@/components/tactical/StatusBadge'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { Pagination } from '@/components/tactical/Pagination'
import { DataTable } from '@/components/ui/DataTable'

interface TenantsTableProps {
  rows: any[]
  filteredCount: number
  totalCount: number
  currentPage: number
  totalPages: number
  itemsPerPage: number
  onPageChange: (page: number) => void
}

export function TenantsTable({
  rows,
  filteredCount,
  totalCount,
  currentPage,
  totalPages,
  itemsPerPage,
  onPageChange,
}: TenantsTableProps) {
  return (
    <>
      <SectionPanel
        title="DIRECTORIO DE EMPRESAS (SASs) REGISTRADAS"
        subtitle={`${filteredCount} EMPRESA(S) · PÁGINA ${currentPage} DE ${totalPages}`}
        statusSlot={
          <span className="text-[10px] text-ok bg-ok-dim border border-ok-line px-2 py-0.5 rounded font-bold uppercase flex items-center gap-1">
            <Activity className="w-3 h-3" />
            {totalCount} REGISTRADAS
          </span>
        }
        noPadding
      >
        <DataTable
          columns={[
            {
              key: 'name',
              header: 'Empresa',
              render: (t: any) => (
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded flex items-center justify-center text-black font-extrabold text-sm shrink-0"
                    style={{
                      backgroundColor: t.id === 'tenant_default' ? '#FF6A00' : '#3B82F6',
                    }}
                  >
                    {t.name?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-fg flex items-center gap-2">
                      <span>{t.name}</span>
                      {t.id === 'tenant_default' && (
                        <span className="text-[10px] bg-accent text-black font-extrabold px-1.5 py-0.5 rounded">
                          PRINCIPAL
                        </span>
                      )}
                    </div>
                    {t.legalName && t.legalName !== t.name && (
                      <div className="text-[10px] text-fg-muted">{t.legalName}</div>
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: 'nit',
              header: 'NIT',
              render: (t: any) => (
                <span className="font-mono text-accent font-bold">{t.nit}</span>
              ),
            },
            {
              key: 'dbSlug',
              header: 'DB Asignada',
              render: (t: any) => (
                <code className="text-[10px] bg-input px-1.5 py-0.5 rounded border border-line text-blue font-mono">
                  {t.dbSlug || 'default'}
                </code>
              ),
            },
            {
              key: 'admin',
              header: 'Admin',
              cellClassName: 'text-fg',
              render: (t: any) => (
                <>
                  <div className="text-[11px]">{t.adminName || '—'}</div>
                  <div className="text-[10px] text-fg-muted flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {t.adminEmail || '—'}
                  </div>
                </>
              ),
            },
            {
              key: 'userCount',
              header: 'Usuarios',
              align: 'center',
              render: (t: any) => (
                <span className="inline-flex items-center gap-1 bg-night-deep border border-line text-accent px-2.5 py-1 rounded text-[11px] font-bold">
                  <Users className="w-3 h-3" />
                  {t.userCount}
                </span>
              ),
            },
            {
              key: 'dbProvisioned',
              header: 'Provisionada',
              render: (t: any) =>
                t.dbProvisioned === 'SI' ? (
                  <StatusBadge status="online" label="PROVISIONADA" />
                ) : (
                  <StatusBadge status="warning" label="PENDIENTE" />
                ),
            },
            {
              key: 'createdAt',
              header: 'Creada',
              align: 'right',
              cellClassName: 'text-[10px] text-fg-muted',
              render: (t: any) =>
                t.createdAt
                  ? new Date(t.createdAt).toLocaleDateString('es-CO', {
                      year: 'numeric',
                      month: 'short',
                      day: '2-digit',
                    })
                  : '—',
            },
          ]}
          rows={rows}
          rowKey={(t: any) => t.id}
          rowClassName="hover:bg-hover transition-colors"
          emptyMessage="[NO HAY EMPRESAS REGISTRADAS O COINCIDENTES EN LA BÚSQUEDA]"
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
