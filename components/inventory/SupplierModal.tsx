'use client'

import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useToast } from '@/components/ui/ToastProvider'
import { createSupplier } from '@/app/actions/pos-actions'

interface SupplierModalProps {
  open: boolean
  onClose: () => void
  onSubmitted: () => void
}

export function SupplierModal({ open, onClose, onSubmitted }: SupplierModalProps) {
  const { toast } = useToast()
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    nit: '',
    email: '',
    phone: '',
    address: '',
  })

  async function handleCreateSupplier(e: React.FormEvent) {
    e.preventDefault()
    if (!supplierForm.name) return

    try {
      await createSupplier({
        name: supplierForm.name,
        nit: supplierForm.nit,
        email: supplierForm.email,
        phone: supplierForm.phone,
        address: supplierForm.address,
      })

      toast(`¡PROVEEDOR "${supplierForm.name.toUpperCase()}" CREADO EXITOSAMENTE!`)
      onClose()
      setSupplierForm({ name: '', nit: '', email: '', phone: '', address: '' })
      onSubmitted()
    } catch (err: any) {
      toast(`Error al crear proveedor: ${err.message}`, 'error')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="REGISTRAR NUEVO PROVEEDOR"
      icon={<Building2 className="w-4 h-4" />}
      size="lg"
    >
      <form onSubmit={handleCreateSupplier} className="space-y-3 text-xs">
        <div>
          <Label>RAZÓN SOCIAL / PROVEEDOR *</Label>
          <Input
            type="text"
            required
            placeholder="Ej: Distribuidora Logística S.A.S."
            value={supplierForm.name}
            onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>NIT / IDENTIFICACIÓN</Label>
            <Input
              type="text"
              placeholder="Ej: 900.123.456-1"
              value={supplierForm.nit}
              onChange={(e) => setSupplierForm({ ...supplierForm, nit: e.target.value })}
            />
          </div>
          <div>
            <Label>TELÉFONO DE CONTACTO</Label>
            <Input
              type="text"
              placeholder="Ej: +57 300 123 4567"
              value={supplierForm.phone}
              onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>EMAIL DE CONTACTO</Label>
            <Input
              type="email"
              placeholder="proveedor@empresa.com"
              value={supplierForm.email}
              onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
            />
          </div>
          <div>
            <Label>DIRECCIÓN</Label>
            <Input
              type="text"
              placeholder="Ej: Calle 100 #15-30"
              value={supplierForm.address}
              onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-line-dim">
          <TacticalButton type="button" variant="secondary" size="sm" onClick={onClose}>
            CANCELAR
          </TacticalButton>
          <TacticalButton type="submit" variant="primary" size="sm">
            CREAR PROVEEDOR
          </TacticalButton>
        </div>
      </form>
    </Modal>
  )
}
