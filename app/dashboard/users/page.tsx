'use client'

import { useState, useEffect } from 'react'
import {
  Users,
  UserPlus,
  RefreshCw,
  Building2,
  Plus,
} from 'lucide-react'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { Tabs } from '@/components/ui/Tabs'
import { CreateUserModal } from '@/components/users/CreateUserModal'
import { CreateTenantModal } from '@/components/users/CreateTenantModal'
import { TenantsTable } from '@/components/users/TenantsTable'
import { UsersTable } from '@/components/users/UsersTable'
import {
  getUsersList,
  listAllTenants,
} from '@/app/actions/pos-actions'

type Tab = 'users' | 'companies'

export default function UsersPage() {
  const [activeTab, setActiveTab] = useState<Tab>('companies')
  const [users, setUsers] = useState<any[]>([])
  const [tenants, setTenants] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 8

  // Modal "Crear operador" (dentro del tenant actual)
  const [isUserModalOpen, setIsUserModalOpen] = useState(false)

  // Modal "Nueva Empresa + Admin" (crea tenant independiente)
  const [isTenantModalOpen, setIsTenantModalOpen] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [u, t] = await Promise.all([getUsersList().catch(() => []), listAllTenants().catch(() => [])])
      setUsers(u || [])
      setTenants(t || [])
    } catch (error) {
      console.error('Error al cargar datos:', error)
    } finally {
      setLoading(false)
    }
  }

  // ---------- Filtros y paginación ----------
  const filteredUsers = users.filter(
    (u) =>
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.role?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredTenants = tenants.filter(
    (t) =>
      t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.nit?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.dbSlug?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.adminEmail?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const totalUserPages = Math.ceil(filteredUsers.length / itemsPerPage) || 1
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const totalTenantPages = Math.ceil(filteredTenants.length / itemsPerPage) || 1
  const paginatedTenants = filteredTenants.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const totalTenants = tenants.length
  const totalUsers = users.length

  function handleSearchChange(value: string) {
    setSearchQuery(value)
    setCurrentPage(1)
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <PageHeader
        icon={<Users className="w-4 h-4" />}
        kicker="IDENTITY & ACCESS MANAGEMENT (IAM) // TENANT REGISTRY"
        title="CONTROL DE USUARIOS, ROLES Y EMPRESAS"
        description="Crea cada empresa (SAS) con su propio administrador y base de datos aislada. Los usuarios se asignan a su empresa."
        actions={
          <>
            <TacticalButton
              variant="secondary"
              size="sm"
              onClick={loadData}
              loading={loading}
              icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
            >
              RECARGAR
            </TacticalButton>
            {activeTab === 'users' ? (
              <TacticalButton
                variant="primary"
                size="sm"
                onClick={() => setIsUserModalOpen(true)}
                icon={<UserPlus className="w-3.5 h-3.5" />}
              >
                NUEVO OPERADOR
              </TacticalButton>
            ) : (
              <TacticalButton
                variant="primary"
                size="sm"
                onClick={() => setIsTenantModalOpen(true)}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                NUEVA EMPRESA
              </TacticalButton>
            )}
          </>
        }
      />

      {/* Tabs */}
      <Tabs
        variant="underline"
        items={[
          { id: 'companies', label: 'EMPRESAS', icon: Building2, count: totalTenants },
          { id: 'users', label: 'OPERADORES / USUARIOS', icon: Users, count: totalUsers },
        ]}
        value={activeTab}
        onChange={(id) => {
          setActiveTab(id as Tab)
          setSearchQuery('')
          setCurrentPage(1)
        }}
      />

      {/* Search */}
      <div className="flex items-center gap-3">
        <SearchInput
          placeholder={
            activeTab === 'companies'
              ? 'BUSCAR EMPRESA POR NOMBRE, NIT O SLUG...'
              : 'BUSCAR USUARIO POR NOMBRE, EMAIL O ROL...'
          }
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          wrapperClassName="flex-1"
        />
      </div>

      {/* TAB: EMPRESAS */}
      {activeTab === 'companies' && (
        <TenantsTable
          rows={paginatedTenants}
          filteredCount={filteredTenants.length}
          totalCount={totalTenants}
          currentPage={currentPage}
          totalPages={totalTenantPages}
          itemsPerPage={itemsPerPage}
          onPageChange={(page) => setCurrentPage(page)}
        />
      )}

      {/* TAB: USUARIOS / OPERADORES */}
      {activeTab === 'users' && (
        <UsersTable
          rows={paginatedUsers}
          filteredCount={filteredUsers.length}
          currentPage={currentPage}
          totalPages={totalUserPages}
          itemsPerPage={itemsPerPage}
          onPageChange={(page) => setCurrentPage(page)}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
        />
      )}

      {/* MODAL: NUEVO OPERADOR (dentro del tenant actual) */}
      {isUserModalOpen && (
        <CreateUserModal
          open={isUserModalOpen}
          onClose={() => setIsUserModalOpen(false)}
          onSubmitted={loadData}
        />
      )}

      {/* MODAL: NUEVA EMPRESA + ADMIN (crea tenant independiente) */}
      {isTenantModalOpen && (
        <CreateTenantModal
          open={isTenantModalOpen}
          onClose={() => setIsTenantModalOpen(false)}
          onSubmitted={loadData}
        />
      )}
    </div>
  )
}
