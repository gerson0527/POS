'use client'

import { useEffect, useRef, useState } from 'react'
import { History } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Label } from '@/components/ui/Label'
import { useToast } from '@/components/ui/ToastProvider'
import { recordInventoryMovement } from '@/app/actions/pos-actions'
import { getAllLocations } from '@/app/actions/locations'

interface MovementModalProps {
  open: boolean
  onClose: () => void
  products: any[]
  onSubmitted: () => void
}

type MovementType = 'IN' | 'OUT' | 'ADJUSTMENT'

const EMPTY_FORM = {
  productId: '',
  locationId: '',
  movementType: 'IN' as MovementType,
  quantity: '1',
  notes: '',
}

export function MovementModal({ open, onClose, products, onSubmitted }: MovementModalProps) {
  const { toast } = useToast()
  const [movementForm, setMovementForm] = useState(EMPTY_FORM)
  const [locations, setLocations] = useState<{ id: string; name: string; city: string | null }[]>([])
  const [submitting, setSubmitting] = useState(false)
  // Una clave por formulario: un doble clic o reintento no duplica el movimiento.
  const idempotencyKey = useRef(crypto.randomUUID())

  useEffect(() => {
    getAllLocations()
      .then((rows) => {
        const active = rows.filter((row) => row.status === 'ACTIVE')
        setLocations(active)
        if (active.length === 1) {
          setMovementForm((form) => ({ ...form, locationId: active[0].id }))
        }
      })
      .catch(() => setLocations([]))
  }, [])

  const isAdjustment = movementForm.movementType === 'ADJUSTMENT'

  async function handleRecordMovement(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (!movementForm.productId || !movementForm.locationId || !movementForm.quantity) return

    const quantity = parseFloat(movementForm.quantity)
    if (!Number.isFinite(quantity) || quantity === 0) {
      toast('La cantidad no es válida.', 'error')
      return
    }

    setSubmitting(true)
    try {
      const result = await recordInventoryMovement({
        productId: movementForm.productId,
        locationId: movementForm.locationId,
        movementType: movementForm.movementType,
        quantity,
        notes: movementForm.notes,
        reason: isAdjustment ? movementForm.notes : null,
        idempotencyKey: idempotencyKey.current,
      })

      if (!result.success) {
        toast(`Error al registrar movimiento: ${result.message}`, 'error')
        return
      }

      toast(
        result.duplicated
          ? 'Este movimiento ya estaba registrado.'
          : `¡MOVIMIENTO KARDEX REGISTRADO! Stock resultante: ${result.newQuantity}`
      )
      idempotencyKey.current = crypto.randomUUID()
      setMovementForm({ ...EMPTY_FORM, locationId: movementForm.locationId })
      onClose()
      onSubmitted()
    } catch (err: any) {
      toast(`Error al registrar movimiento: ${err.message}`, 'error')
    } finally {
      setSubmitting(false)
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

        <div>
          <Label>SEDE *</Label>
          <Select
            className="font-normal"
            required
            value={movementForm.locationId}
            onChange={(e) => setMovementForm({ ...movementForm, locationId: e.target.value })}
          >
            <option value="">-- Seleccionar Sede --</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
                {loc.city ? ` (${loc.city})` : ''}
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
              <option value="ADJUSTMENT">AJUSTE DE INVENTARIO (+/-)</option>
            </Select>
          </div>
          <div>
            <Label>{isAdjustment ? 'AJUSTE (+ SUMA / - RESTA) *' : 'CANTIDAD (UNIDADES) *'}</Label>
            <Input
              type="number"
              required
              step="any"
              min={isAdjustment ? undefined : '0.01'}
              value={movementForm.quantity}
              onChange={(e) => setMovementForm({ ...movementForm, quantity: e.target.value })}
              className="font-bold"
            />
          </div>
        </div>

        <div>
          <Label>{isAdjustment ? 'MOTIVO DEL AJUSTE *' : 'NOTAS / JUSTIFICACIÓN'}</Label>
          <Input
            type="text"
            required={isAdjustment}
            placeholder={isAdjustment ? 'Ej: Conteo físico, producto vencido' : 'Ej: Factura de compra proveedor #1092'}
            value={movementForm.notes}
            onChange={(e) => setMovementForm({ ...movementForm, notes: e.target.value })}
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-line-dim">
          <TacticalButton type="button" variant="secondary" size="sm" onClick={onClose}>
            CANCELAR
          </TacticalButton>
          <TacticalButton type="submit" variant="primary" size="sm" disabled={submitting}>
            {submitting ? 'REGISTRANDO...' : 'REGISTRAR EN KARDEX'}
          </TacticalButton>
        </div>
      </form>
    </Modal>
  )
}
