'use client'

import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Label } from '@/components/ui/Label'
import { useToast } from '@/components/ui/ToastProvider'
import { updateUserAction } from '@/app/actions/pos-actions'

export interface EditableUser {
  id: string
  name: string
  email: string
  role: string
  isCurrent?: boolean
}

interface EditUserModalProps {
  open: boolean
  user: EditableUser | null
  onClose: () => void
  onSubmitted: () => void
}

export function EditUserModal({ open, user, onClose, onSubmitted }: EditUserModalProps) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    role: 'CASHIER',
    password: '',
  })

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || '',
        role: user.role || 'CASHIER',
        password: '',
      })
    }
  }, [user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    try {
      await updateUserAction({
        userId: user.id,
        name: form.name,
        role: form.role,
        password: form.password || undefined,
      })
      toast(`Usuario "${form.name}" actualizado.`)
      onClose()
      onSubmitted()
    } catch (err: any) {
      toast(`Error al actualizar: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="EDITAR OPERADOR"
      icon={<Pencil className="w-4 h-4" />}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-3 text-xs">
        <div>
          <Label>Correo (no editable)</Label>
          <Input type="email" value={user?.email || ''} disabled className="opacity-70" />
        </div>
        <div>
          <Label>Nombre *</Label>
          <Input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Rol *</Label>
            <Select
              value={form.role}
              disabled={user?.isCurrent && user.role === 'ADMIN'}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className={user?.isCurrent && user.role === 'ADMIN' ? 'opacity-70' : undefined}
            >
              <option value="ADMIN">ADMINISTRADOR</option>
              <option value="CASHIER">CAJERO / CAJA POS</option>
              <option value="MANAGER">SUPERVISOR KARDEX</option>
              <option value="ACCOUNTANT">CONTADORA / CONTADOR (SÓLO FACTURAS)</option>
              <option value="VIEWER">AUDITOR FISCAL (LECTURA)</option>
            </Select>
            {user?.isCurrent && user.role === 'ADMIN' && (
              <p className="mt-1 text-[10px] text-fg-muted">
                No puede bajarse de administrador usted mismo.
              </p>
            )}
          </div>
          <div>
            <Label>Nueva contraseña (opcional)</Label>
            <Input
              type="password"
              minLength={12}
              placeholder="Dejar vacío para no cambiar"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-line-dim">
          <TacticalButton type="button" variant="secondary" size="sm" onClick={onClose}>
            CANCELAR
          </TacticalButton>
          <TacticalButton type="submit" variant="primary" size="sm" loading={saving}>
            GUARDAR CAMBIOS
          </TacticalButton>
        </div>
      </form>
    </Modal>
  )
}
