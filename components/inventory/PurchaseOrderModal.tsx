'use client'

import { useMemo, useState } from 'react'
import { Truck, AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { Label } from '@/components/ui/Label'
import { useToast } from '@/components/ui/ToastProvider'
import { createPurchaseOrder } from '@/app/actions/pos-actions'

interface PurchaseOrderModalProps {
  open: boolean
  onClose: () => void
  suppliers: any[]
  products: any[]
  onSubmitted: () => void
}

const EMPTY_PO_FORM = {
  supplierId: '',
  poNumber: '',
  productId: '',
  productName: '',
  quantity: '1',
  cost: '',
  unitPrice: '',
  margin: '0',
  total: '',
  notes: '',
  updateCatalogProduct: true,
}

export function PurchaseOrderModal({ open, onClose, suppliers, products, onSubmitted }: PurchaseOrderModalProps) {
  const { toast } = useToast()
  const [poForm, setPoForm] = useState(EMPTY_PO_FORM)
  const [zeroProfitWarningModal, setZeroProfitWarningModal] = useState<{
    unitPrice: number
    cost: number
    margin: number
    productName: string
  } | null>(null)

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        value: p.id,
        label: `${p.name}${p.sku ? ` (SKU: ${p.sku})` : ' (Sin SKU)'}`,
        description: `Costo: $${p.cost || 0} · Precio Venta: $${p.unitPrice || 0}`,
        searchText: `${p.name} ${p.sku || ''}`,
      })),
    [products]
  )

  function handlePOSelectProduct(productId: string) {
    if (!productId) {
      setPoForm({
        ...poForm,
        productId: '',
        productName: '',
        cost: '',
        unitPrice: '',
        margin: '0',
      })
      return
    }

    const prod = products.find((p) => p.id === productId)
    if (!prod) return

    const u = parseFloat(prod.unitPrice) || 0
    const c = parseFloat(prod.cost) || 0
    const m = u > 0 ? (((u - c) / u) * 100).toFixed(1) : '0'
    const qty = parseFloat(poForm.quantity) || 1
    const tot = c > 0 ? (c * qty).toFixed(0) : poForm.total

    setPoForm({
      ...poForm,
      productId: prod.id,
      productName: prod.name,
      cost: c > 0 ? String(c) : '',
      unitPrice: u > 0 ? String(u) : '',
      margin: m,
      total: tot,
    })
  }

  function handlePOCostChange(newCost: string) {
    const c = parseFloat(newCost) || 0
    const u = parseFloat(poForm.unitPrice) || 0
    const m = u > 0 ? (((u - c) / u) * 100).toFixed(1) : '0'
    const qty = parseFloat(poForm.quantity) || 1
    const tot = c > 0 ? (c * qty).toFixed(0) : poForm.total

    setPoForm({
      ...poForm,
      cost: newCost,
      margin: m,
      total: tot,
    })
  }

  function handlePOUnitPriceChange(newUnitPrice: string) {
    const u = parseFloat(newUnitPrice) || 0
    const c = parseFloat(poForm.cost) || 0
    const m = u > 0 ? (((u - c) / u) * 100).toFixed(1) : '0'

    setPoForm({
      ...poForm,
      unitPrice: newUnitPrice,
      margin: m,
    })
  }

  function handlePOMarginChange(newMargin: string) {
    const m = parseFloat(newMargin) || 0
    const c = parseFloat(poForm.cost) || 0
    const u = m < 100 ? c / (1 - m / 100) : c

    setPoForm({
      ...poForm,
      margin: newMargin,
      unitPrice: u > 0 ? u.toFixed(0) : poForm.unitPrice,
    })
  }

  function handlePOQuantityChange(newQty: string) {
    const qty = parseFloat(newQty) || 1
    const c = parseFloat(poForm.cost) || 0
    const tot = c > 0 ? (c * qty).toFixed(0) : poForm.total

    setPoForm({
      ...poForm,
      quantity: newQty,
      total: tot,
    })
  }

  async function handleCreatePO(e?: React.FormEvent, bypassZeroProfitWarning = false) {
    if (e) e.preventDefault()
    if (!poForm.supplierId || !poForm.total) return

    const u = parseFloat(poForm.unitPrice) || 0
    const c = parseFloat(poForm.cost) || 0
    const m = parseFloat(poForm.margin) || 0

    // Alerta de Margen Sin Ganancia / Margen <= 0
    if ((u <= c || m <= 0) && (u > 0 || c > 0) && !bypassZeroProfitWarning) {
      setZeroProfitWarningModal({
        unitPrice: u,
        cost: c,
        margin: m,
        productName: poForm.productName || 'Producto Seleccionado',
      })
      return
    }

    try {
      await createPurchaseOrder({
        supplierId: poForm.supplierId,
        poNumber: poForm.poNumber || `PO-${Date.now().toString().slice(-6)}`,
        total: parseFloat(poForm.total) || 0,
        notes: poForm.notes,
        productId: poForm.productId || undefined,
        productName: poForm.productName || undefined,
        quantity: parseFloat(poForm.quantity) || 1,
        cost: c > 0 ? c : undefined,
        unitPrice: u > 0 ? u : undefined,
        margin: !isNaN(m) ? m : undefined,
        updateCatalogProduct: poForm.updateCatalogProduct,
      })

      toast('¡ÓRDEN DE COMPRA (PO) PROCESADA CORRECTAMENTE!')
      onClose()
      setZeroProfitWarningModal(null)
      setPoForm(EMPTY_PO_FORM)
      onSubmitted()
    } catch (err: any) {
      toast(`Error al crear PO: ${err.message}`, 'error')
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="NUEVA ÓRDEN DE COMPRA (PURCHASE ORDER)"
        icon={<Truck className="w-4 h-4" />}
        size="2xl"
      >
        <form onSubmit={handleCreatePO} className="space-y-4 text-xs">
          <div>
            <Label className="mb-1.5">SELECCIONAR PROVEEDOR *</Label>
            <Select
              className="p-3 h-11"
              required
              value={poForm.supplierId}
              onChange={(e) => setPoForm({ ...poForm, supplierId: e.target.value })}
            >
              <option value="">-- Seleccionar Proveedor --</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name} (NIT: {s.nit || 'N/A'})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label className="mb-1.5">SELECCIONAR PRODUCTO DE CATÁLOGO (OPCIONAL / AUTO-CARGAR)</Label>
            <SearchableSelect
              className="h-11"
              options={productOptions}
              value={poForm.productId}
              onChange={handlePOSelectProduct}
              placeholder="-- Seleccionar Producto para actualizar existencias y precios --"
              emptyLabel="-- Ninguno (no actualizar catálogo) --"
            />
          </div>

          {/* CAMPOS DE COSTO, PRECIO UNITARIO Y MARGEN CON ALINEACIÓN PERFECTA */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-input border border-line-soft rounded-lg p-4">
            <div>
              <Label className="mb-1.5">COSTO UNITARIO ($)</Label>
              <Input
                type="number"
                placeholder="Ej: 15000"
                value={poForm.cost}
                onChange={(e) => handlePOCostChange(e.target.value)}
                className="bg-panel p-3 font-bold h-11"
              />
            </div>
            <div>
              <Label className="mb-1.5">PRECIO VENTA ($)</Label>
              <Input
                type="number"
                placeholder="Ej: 25000"
                value={poForm.unitPrice}
                onChange={(e) => handlePOUnitPriceChange(e.target.value)}
                className="bg-panel p-3 font-bold h-11"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label>MARGEN (%)</Label>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap ${
                    parseFloat(poForm.margin) > 0
                      ? 'bg-success-bg text-success-fg'
                      : 'bg-danger-bg text-red-soft animate-pulse'
                  }`}
                >
                  {parseFloat(poForm.margin) > 0 ? `+${poForm.margin}%` : `${poForm.margin}% (SIN GANANCIA)`}
                </span>
              </div>
              <input
                type="number"
                step="0.1"
                placeholder="Ej: 40"
                value={poForm.margin}
                onChange={(e) => handlePOMarginChange(e.target.value)}
                className={`w-full bg-panel border p-3 rounded font-bold h-11 ${
                  parseFloat(poForm.margin) > 0
                    ? 'border-line text-success-fg focus:border-accent'
                    : 'border-alert text-red-soft'
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>NÚMERO DE PO</Label>
              <Input
                type="text"
                placeholder="Auto Ej: PO-2026-001"
                value={poForm.poNumber}
                onChange={(e) => setPoForm({ ...poForm, poNumber: e.target.value })}
              />
            </div>
            <div>
              <Label>CANTIDAD COMPRADA</Label>
              <Input
                type="number"
                min="1"
                value={poForm.quantity}
                onChange={(e) => handlePOQuantityChange(e.target.value)}
                className="font-bold"
              />
            </div>
            <div>
              <Label>VALOR TOTAL ($) *</Label>
              <Input
                type="number"
                required
                placeholder="500000"
                value={poForm.total}
                onChange={(e) => setPoForm({ ...poForm, total: e.target.value })}
                className="border-accent text-accent font-bold text-sm"
              />
            </div>
          </div>

          {poForm.productId && (
            <div className="flex items-center gap-2 bg-warn-bg-6 border border-accent/40 p-2.5 rounded text-accent">
              <input
                type="checkbox"
                id="updateCatalogProduct"
                checked={poForm.updateCatalogProduct}
                onChange={(e) => setPoForm({ ...poForm, updateCatalogProduct: e.target.checked })}
                className="accent-accent"
              />
              <Label htmlFor="updateCatalogProduct" className="cursor-pointer text-[11px]">
                Actualizar automáticamente costo (${poForm.cost || 0}), precio venta (${poForm.unitPrice || 0}) y margen ({poForm.margin}%) en el catálogo de productos.
              </Label>
            </div>
          )}

          <div>
            <Label>OBSERVACIONES</Label>
            <Input
              type="text"
              placeholder="Ej: Despacho prioritario sede principal"
              value={poForm.notes}
              onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-line-dim">
            <TacticalButton type="button" variant="secondary" size="sm" onClick={onClose}>
              CANCELAR
            </TacticalButton>
            <TacticalButton type="submit" variant="primary" size="sm">
              EMITIR ÓRDEN PO
            </TacticalButton>
          </div>
        </form>
      </Modal>

      {/* MODAL AUDITORÍA: ALERTA DE MARGEN SIN GANANCIA O PÉRDIDA */}
      {zeroProfitWarningModal && (
        <Modal
          bare
          open={!!zeroProfitWarningModal}
          onClose={() => setZeroProfitWarningModal(null)}
          tone="danger"
          size="md"
        >
          <div className="flex items-center gap-3 border-b border-line pb-3 text-alert">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider">
                ⚠️ ADVERTENCIA: MARGEN SIN GANANCIA
              </h3>
              <p className="text-[10px] text-fg-muted">CONTROL DE RENTABILIDAD Y PRECIOS DE VENTA</p>
            </div>
          </div>

          <p className="text-xs text-fg leading-relaxed">
            El sistema detectó que para el producto <span className="text-accent font-bold">"{zeroProfitWarningModal.productName}"</span>, el <span className="font-bold text-fg">Precio de Venta (${zeroProfitWarningModal.unitPrice})</span> es menor o igual al <span className="font-bold text-red-soft">Costo Unitario (${zeroProfitWarningModal.cost})</span>.
          </p>

          <div className="bg-rose-surface border border-danger-bg rounded p-3 text-[11px] text-red-soft space-y-1">
            <p className="font-bold text-xs text-alert">• MARGEN RESULTANTE: {zeroProfitWarningModal.margin}%</p>
            <p>Esta configuración venderá el producto sin obtener margen de utilidad o incurriendo en pérdidas.</p>
            <p className="text-fg font-semibold mt-1">¿Desea confirmar que este valor es correcto y emitir la orden de compra?</p>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2 border-t border-line-soft">
            <button
              type="button"
              onClick={() => setZeroProfitWarningModal(null)}
              className="px-4 py-2.5 bg-night-mid-2 hover:bg-line-dim text-fg-muted hover:text-fg rounded font-bold text-xs transition-colors"
            >
              AJUSTAR PRECIO DE VENTA
            </button>
            <button
              type="button"
              onClick={() => handleCreatePO(undefined, true)}
              className="px-4 py-2.5 bg-alert hover:bg-danger-solid text-white font-bold rounded text-xs transition-colors flex items-center justify-center gap-1"
            >
              <span>SÍ, ES CORRECTO (EMITIR ÓRDEN)</span>
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
