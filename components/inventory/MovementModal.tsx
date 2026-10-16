'use client'

import { useState } from 'react'
import { History } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Label } from '@/components/ui/Label'
import { useToast } from '@/components/ui/ToastProvider'
import { recordInventoryMovement } from '@/app/actions/pos-actions'

interface MovementModalProps {
  open: boolean
  onClose: () => void
  products: any[]
  onSubmitted: () => void
}

export function MovementModal({ open, onClose, products, onSubmitted }: MovementModalProps) {
  const { toast } = useToast()
  const [movementForm, setMovementForm] = useState({
    productId: '',
    movementType: 'IN' as 'IN' | 'OUT' | 'ADJUSTMENT',
    quantity: '1',
    notes: '',
  })

  async function handleRecordMovement(e: React.FormEvent) {
    e.preventDefault()
    if (!movementForm.productId || !movementForm.quantity) return

    try {
      await recordInventoryMovement({
        productId: movementForm.productId,
        movementType: movementForm.movementType,
        quantity: parseFloat(movementForm.quantity) || 1,
        notes: movementForm.notes,
      })

      toast('¡MOVIMIENTO KARDEX REGISTRADO CORRECTAMENTE!')
      onClose()
      setMovementForm({ productId: '', movementType: 'IN', quantity: '1', notes: '' })
      onSubmitted()
    } catch (err: any) {
      toast(`Error al registrar movimiento: ${err.message}`, 'error')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="REGISTRAR MOVIMIENTO DE STOCK KARDEX"
      icon={<History className="w-4 h-4" />}
      size="lg"
    >
      <form onSubmit={handleRecordMovement} className="space-y-3 text-xs">
        <div>
          <Label>SELECCIONAR PRODUCTO *</Label>
          <Select
            className="font-normal"
            required
            value={movementForm.productId}
            onChange={(e) => setMovementForm({ ...movementForm, productId: e.target.value })}
          >
            <option value="">-- Seleccionar Producto --</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (SKU: {p.sku || p.id.substring(0, 6)})
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>TIPO DE OPERACIÓN *</Label>
            <Select
              value={movementForm.movementType}
              onChange={(e: any) => setMovementForm({ ...movementForm, movementType: e.target.value })}
            >
              <option value="IN">ENTRADA DE STOCK (COMPRA)</option>
              <option value="OUT">SALIDA DE STOCK (MERMA/VENTA)</option>
              <option value="ADJUSTMENT">AJUSTE DE INVENTARIO</option>
            </Select>
          </div>
          <div>
            <Label>CANTIDAD (UNIDADES) *</Label>
            <Input
              type="number"
              required
              min="1"
              value={movementForm.quantity}
              onChange={(e) => setMovementForm({ ...movementForm, quantity: e.target.value })}
              className="font-bold"
            />
          </div>
        </div>

        <div>
          <Label>NOTAS / JUSTIFICACIÓN</Label>
          <Input
            type="text"
            placeholder="Ej: Factura de compra proveedor #1092"
            value={movementForm.notes}
            onChange={(e) => setMovementForm({ ...movementForm, notes: e.target.value })}
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-line-dim">
          <TacticalButton type="button" variant="secondary" size="sm" onClick={onClose}>
            CANCELAR
          </TacticalButton>
          <TacticalButton type="submit" variant="primary" size="sm">
            REGISTRAR EN KARDEX
          </TacticalButton>
        </div>
      </form>
    </Modal>
  )
}
