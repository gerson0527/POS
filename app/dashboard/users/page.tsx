'use client'

import { useState, useEffect } from 'react'
import {
  Users,
  UserPlus,
  RefreshCw,
  Building2,
} from 'lucide-react'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { Tabs } from '@/components/ui/Tabs'
import { CreateUserModal } from '@/components/users/CreateUserModal'
import { EditUserModal, type EditableUser } from '@/components/users/EditUserModal'
import { TenantsTable } from '@/components/users/TenantsTable'
import { UsersTable } from '@/components/users/UsersTable'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import {
  deactivateUserAction,
  getMyAccess,
  getUsersList,
  listAllTenants,
} from '@/app/actions/pos-actions'

type Tab = 'users' | 'companies'

export default function UsersPage() {
  const { toast } = useToast()
  const confirmAction = useConfirm()
  const [activeTab, setActiveTab] = useState<Tab>('users')
  const [users, setUsers] = useState<any[]>([])
  const [tenants, setTenants] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [canManage, setCanManage] = useState(false)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const itemsPerPage = 8

  const [isUserModalOpen, setIsUserModalOpen] = useState(false)
  const [editUser, setEditUser] = useState<EditableUser | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const access = await getMyAccess().catch(() => null)
      const platform = Boolean(access?.isPlatformAdmin)
      setCanManage(Boolean(access?.canManageUsers))
      setIsPlatformAdmin(platform)
      if (!platform) setActiveTab('users')

      const u = await getUsersList().catch(() => [])
      setUsers(u || [])

      // Solo el admin de plataforma lista todas las empresas (evita 500 en tenant ADMIN).
      if (platform) {
        const t = await listAllTenants().catch(() => [])
        setTenants(t || [])
      } else {
        setTenants([])
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
    } finally {
      setLoading(false)
    }
  }

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

  const tabItems = isPlatformAdmin
    ? [
        { id: 'companies' as const, label: 'EMPRESAS', icon: Building2, count: totalTenants },
        { id: 'users' as const, label: 'OPERADORES / USUARIOS', icon: Users, count: totalUsers },
      ]
    : [{ id: 'users' as const, label: 'OPERADORES / USUARIOS', icon: Users, count: totalUsers }]

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Users className="w-4 h-4" />}
        kicker="IDENTITY & ACCESS MANAGEMENT (IAM)"
        title={isPlatformAdmin ? 'CONTROL DE USUARIOS, ROLES Y EMPRESAS' : 'CONTROL DE USUARIOS Y ROLES'}
        description={
          isPlatformAdmin
            ? 'Administra las empresas (SAS) registradas y los usuarios asignados a cada una.'
            : 'Administra los operadores de esta empresa. Solo el administrador puede crear o cambiar usuarios.'
        }
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
            {activeTab === 'users' && canManage && (
              <TacticalButton
                variant="primary"
                size="sm"
                onClick={() => setIsUserModalOpen(true)}
                icon={<UserPlus className="w-3.5 h-3.5" />}
              >
                NUEVO OPERADOR
              </TacticalButton>
            )}
          </>
        }
      />

      {tabItems.length > 1 && (
        <Tabs
          variant="underline"
          items={tabItems}
          value={activeTab}
          onChange={(id) => {
            setActiveTab(id as Tab)
            setSearchQuery('')
            setCurrentPage(1)
          }}
        />
      )}

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

      {isPlatformAdmin && activeTab === 'companies' && (
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
          canManage={canManage}
          onEdit={(u) =>
            setEditUser({
              id: u.id,
              name: u.name,
              email: u.email,
              role: u.role,
              isCurrent: u.isCurrent,
            })
          }
          onDeactivate={async (u) => {
            const ok = await confirmAction({
              title: 'DESACTIVAR OPERADOR',
              message: `¿Desactivar a ${u.name} (${u.email})? Dejará de poder iniciar sesión en esta empresa.`,
              confirmLabel: 'DESACTIVAR',
              cancelLabel: 'CANCELAR',
              tone: 'danger',
            })
            if (!ok) return
            try {
              await deactivateUserAction(u.id)
              toast(`Usuario "${u.name}" desactivado.`)
              await loadData()
            } catch (err: any) {
              toast(err?.message || 'No se pudo desactivar', 'error')
            }
          }}
        />
      )}

      {canManage && isUserModalOpen && (
        <CreateUserModal
          open={isUserModalOpen}
          onClose={() => setIsUserModalOpen(false)}
          onSubmitted={loadData}
        />
      )}

      {canManage && editUser && (
        <EditUserModal
          open={Boolean(editUser)}
          user={editUser}
          onClose={() => setEditUser(null)}
          onSubmitted={loadData}
        />
      )}
    </div>
  )
}
