'use client'

import { useEffect, useState } from 'react'
import { Copy, KeyRound, Plus, ShieldOff } from 'lucide-react'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { StatusBadge } from '@/components/tactical/StatusBadge'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { DataTable } from '@/components/ui/DataTable'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useToast } from '@/components/ui/ToastProvider'
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from '@/app/actions/api-keys'

interface ApiKeysSectionProps {
  refreshKey?: number
  onLoadingChange?: (loading: boolean) => void
}

interface ApiKeyRow {
  id: string
  name: string
  keyPrefix: string
  rateLimit: number
  rateLimitWindow: string
  scopes: string
  status: string
  lastUsedAt: string | Date | null
  createdAt: string | Date
  expiresAt: string | Date | null
}

export function ApiKeysSection({ refreshKey = 0, onLoadingChange }: ApiKeysSectionProps) {
  const { toast } = useToast()
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    scopes: ['read'] as string[],
    rateLimit: '1000',
    rateLimitWindow: '1h',
    expiresAt: '',
  })

  async function loadKeys() {
    setLoading(true)
    onLoadingChange?.(true)
    try {
      const rows = await listApiKeys()
      setKeys(rows as ApiKeyRow[])
    } catch (err: any) {
      toast(`Error al cargar API keys: ${err.message}`, 'error')
    } finally {
      setLoading(false)
      onLoadingChange?.(false)
    }
  }

  useEffect(() => {
    loadKeys()
  }, [refreshKey])

  function toggleScope(scope: string) {
    setForm((current) => ({
      ...current,
      scopes: current.scopes.includes(scope)
        ? current.scopes.filter((value) => value !== scope)
        : [...current.scopes, scope],
    }))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setNewKey(null)
    try {
      const result = await createApiKey({
        name: form.name,
        scopes: form.scopes,
        rateLimit: Number(form.rateLimit),
        rateLimitWindow: form.rateLimitWindow,
        expiresAt: form.expiresAt || undefined,
      })
      setNewKey(result.key)
      setForm({
        name: '',
        scopes: ['read'],
        rateLimit: '1000',
        rateLimitWindow: '1h',
        expiresAt: '',
      })
      toast('API key creada. Copie la clave ahora: no se volverá a mostrar.')
      await loadKeys()
    } catch (err: any) {
      toast(`Error al crear API key: ${err.message}`, 'error')
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(row: ApiKeyRow) {
    if (!window.confirm(`¿Revocar la API key "${row.name}"? Esta acción es permanente.`)) {
      return
    }
    try {
      await revokeApiKey(row.id)
      toast('API key revocada')
      await loadKeys()
    } catch (err: any) {
      toast(`Error al revocar API key: ${err.message}`, 'error')
    }
  }

  async function copyKey() {
    if (!newKey) return
    try {
      await navigator.clipboard.writeText(newKey)
      toast('API key copiada al portapapeles')
    } catch {
      toast('No se pudo copiar automáticamente. Seleccione y copie manualmente.', 'error')
    }
  }

  return (
    <SectionPanel
      title="API PÚBLICA // CLAVES DE ACCESO"
      subtitle="Claves para integrar sistemas externos con /api/v1. Se muestran una sola vez."
    >
      {newKey && (
        <div className="mb-5 border border-ok-line bg-ok-dim rounded-lg p-4 space-y-2">
          <p className="text-xs font-bold text-success uppercase tracking-wider">
            Nueva API key creada — cópiela ahora
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <code className="flex-1 break-all bg-night border border-line rounded p-2 text-xs text-accent">
              {newKey}
            </code>
            <TacticalButton variant="secondary" size="sm" onClick={copyKey}>
              <Copy className="w-3.5 h-3.5 mr-1" /> COPIAR
            </TacticalButton>
          </div>
          <p className="text-[10px] text-fg-muted">
            Por seguridad no almacenamos la clave en texto plano. Si la pierde, revóquela y cree otra.
          </p>
        </div>
      )}

      <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end mb-6">
        <div className="md:col-span-2">
          <Label>NOMBRE *</Label>
          <Input
            required
            maxLength={100}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ej: Integración e-commerce"
          />
        </div>
        <div>
          <Label>LÍMITE / VENTANA</Label>
          <div className="flex gap-1">
            <Input
              type="number"
              min="1"
              max="100000"
              value={form.rateLimit}
              onChange={(e) => setForm({ ...form, rateLimit: e.target.value })}
              className="w-24"
            />
            <select
              value={form.rateLimitWindow}
              onChange={(e) => setForm({ ...form, rateLimitWindow: e.target.value })}
              className="flex-1 bg-input border border-line rounded px-2 text-xs text-fg"
            >
              <option value="30s">30s</option>
              <option value="1m">1m</option>
              <option value="5m">5m</option>
              <option value="1h">1h</option>
              <option value="1d">1d</option>
            </select>
          </div>
        </div>
        <div>
          <Label>EXPIRA (OPCIONAL)</Label>
          <Input
            type="date"
            value={form.expiresAt}
            onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
          />
        </div>
        <div>
          <Label>PERMISOS</Label>
          <div className="flex items-center gap-3 h-10 text-xs text-fg">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={form.scopes.includes('read')}
                onChange={() => toggleScope('read')}
              />
              Lectura
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={form.scopes.includes('write')}
                onChange={() => toggleScope('write')}
              />
              Escritura
            </label>
          </div>
        </div>
        <div className="md:col-span-5 flex justify-end">
          <TacticalButton type="submit" variant="primary" size="sm" loading={creating}>
            <Plus className="w-3.5 h-3.5 mr-1" /> CREAR API KEY
          </TacticalButton>
        </div>
      </form>

      <DataTable
        columns={[
          {
            key: 'name',
            header: 'NOMBRE',
            cellClassName: 'font-semibold text-accent',
            render: (row: ApiKeyRow) => row.name,
          },
          {
            key: 'keyPrefix',
            header: 'PREFIJO',
            render: (row: ApiKeyRow) => <code className="text-xs">{row.keyPrefix}…</code>,
          },
          {
            key: 'scopes',
            header: 'PERMISOS',
            render: (row: ApiKeyRow) => row.scopes,
          },
          {
            key: 'rateLimit',
            header: 'LÍMITE',
            render: (row: ApiKeyRow) => `${row.rateLimit} / ${row.rateLimitWindow}`,
          },
          {
            key: 'status',
            header: 'ESTADO',
            render: (row: ApiKeyRow) => (
              <StatusBadge
                status={row.status === 'ACTIVE' ? 'online' : 'default'}
                label={row.status}
              />
            ),
          },
          {
            key: 'lastUsedAt',
            header: 'ÚLTIMO USO',
            render: (row: ApiKeyRow) =>
              row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : 'Nunca',
          },
          {
            key: 'expiresAt',
            header: 'EXPIRA',
            render: (row: ApiKeyRow) =>
              row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : 'Sin vencimiento',
          },
          {
            key: 'actions',
            header: 'ACCIONES',
            align: 'right',
            render: (row: ApiKeyRow) =>
              row.status === 'ACTIVE' ? (
                <TacticalButton variant="danger" size="sm" onClick={() => handleRevoke(row)}>
                  <ShieldOff className="w-3 h-3 mr-1" /> REVOCAR
                </TacticalButton>
              ) : (
                <span className="text-fg-muted text-xs">—</span>
              ),
          },
        ]}
        rows={keys}
        rowKey={(row: ApiKeyRow) => row.id}
        emptyMessage={loading ? '[CARGANDO API KEYS...]' : '[NO HAY API KEYS REGISTRADAS]'}
      />

      <p className="mt-3 text-[10px] text-fg-muted flex items-center gap-1">
        <KeyRound className="w-3 h-3" /> Las claves se validan contra hash SHA-256 y prefijo; el tenant
        se deriva de la clave, nunca de un header del cliente.
      </p>
    </SectionPanel>
  )
}
