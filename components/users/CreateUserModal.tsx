'use client'

import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Label } from '@/components/ui/Label'
import { useToast } from '@/components/ui/ToastProvider'
import { createUserAction } from '@/app/actions/pos-actions'

interface CreateUserModalProps {
  open: boolean
  onClose: () => void
  onSubmitted: () => void
}

export function CreateUserModal({ open, onClose, onSubmitted }: CreateUserModalProps) {
  const { toast } = useToast()
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'CASHIER',
  })

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    if (!userForm.name || !userForm.email) return

    try {
      await createUserAction({
        name: userForm.name,
        email: userForm.email,
        password: userForm.password,
        role: userForm.role,
      })
      toast(`¡USUARIO "${userForm.name.toUpperCase()}" REGISTRADO CORRECTAMENTE!`)
      onClose()
      setUserForm({ name: '', email: '', password: '', role: 'CASHIER' })
      onSubmitted()
    } catch (err: any) {
      toast(`Error al crear usuario: ${err.message}`, 'error')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="REGISTRAR NUEVO OPERADOR"
      icon={<UserPlus className="w-4 h-4" />}
      size="lg"
    >
      <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
        <div>
          <Label>
            Nombre del operador *
          </Label>
          <Input
            type="text"
            required
            placeholder="Ej: Carlos Gómez Rivera"
            value={userForm.name}
            onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
          />
        </div>
        <div>
          <Label>
            Correo de acceso *
          </Label>
          <Input
            type="email"
            required
            placeholder="carlos.gomez@empresa.com"
            value={userForm.email}
            onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
            className="font-bold"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>
              Contraseña *
            </Label>
            <Input
              type="password"
              required
              minLength={12}
              placeholder="Mínimo 12 caracteres"
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
            />
          </div>
          <div>
            <Label>
              Rol *
            </Label>
            <Select
              value={userForm.role}
              onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
            >
              <option value="CASHIER">CAJERO / CAJA POS</option>
              <option value="MANAGER">SUPERVISOR KARDEX</option>
              <option value="ACCOUNTANT">CONTADORA / CONTADOR (SÓLO FACTURAS)</option>
              <option value="VIEWER">AUDITOR FISCAL (LECTURA)</option>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-line-dim">
          <TacticalButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
          >
            CANCELAR
          </TacticalButton>
          <TacticalButton type="submit" variant="primary" size="sm">
            REGISTRAR OPERADOR
          </TacticalButton>
        </div>
      </form>
    </Modal>
  )
}
