import { Package } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Label } from '@/components/ui/Label'
import { TextArea } from '@/components/ui/TextArea'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { formatCOP } from '@/lib/utils/pos-utils'

export interface ProductFormValues {
  id?: string
  name: string
  sku: string
  barcode: string
  description: string
  category: string
  categoryId: string
  unitPrice: string
  cost: string
  margin: string
  ivaRate: string
  status?: string
  initialStock?: string
}

export type ProductModalTab = 'general' | 'pricing' | 'taxonomy'

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
  mode: 'create' | 'edit'
  form: ProductFormValues
  onChange: (next: ProductFormValues) => void
  tab: ProductModalTab
  onTabChange: (t: ProductModalTab) => void
  categories: any[]
}

const TABS: { id: ProductModalTab; label: string }[] = [
  { id: 'general', label: 'GENERAL' },
  { id: 'pricing', label: 'PRECIOS / IMPUESTOS' },
  { id: 'taxonomy', label: 'TAXONOMÍA / STOCK' },
]

const TEXTAREA_CLASS =
  'w-full bg-input border border-line focus:border-accent p-2.5 rounded text-white resize-none'

export function ProductFormModal({
  open,
  onClose,
  onSubmit,
  mode,
  form,
  onChange,
  tab,
  onTabChange,
  categories,
}: Props) {
  const isEdit = mode === 'edit'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'EDITAR PRODUCTO' : 'REGISTRAR NUEVO PRODUCTO'}
      icon={<Package className="w-4 h-4" />}
      size="2xl"
    >
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-line-soft -mx-2 px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTabChange(t.id)}
            className={`px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider border-b-2 transition-colors ${
              tab === t.id
                ? 'border-accent text-accent'
                : 'border-transparent text-fg-muted hover:text-fg'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-3 text-xs">
        {/* TAB: GENERAL */}
        {tab === 'general' && (
          <>
            <div>
              <Label>Nombre del producto *</Label>
              <Input
                type="text"
                required
                placeholder="Ej: Teclado Mecánico RGB"
                value={form.name}
                onChange={(e) => onChange({ ...form, name: e.target.value })}
                className="font-bold"
              />
            </div>

            <div>
              <Label>Descripción</Label>
              <TextArea
                rows={3}
                placeholder="Descripción, especificaciones, notas…"
                value={form.description}
                onChange={(e) => onChange({ ...form, description: e.target.value })}
                className={TEXTAREA_CLASS}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Código SKU</Label>
                <Input
                  type="text"
                  placeholder="Auto si vacío"
                  value={form.sku}
                  onChange={(e) => onChange({ ...form, sku: e.target.value })}
                />
              </div>
              <div>
                <Label>Código de barras</Label>
                <Input
                  type="text"
                  placeholder="Ej: 770123456789"
                  value={form.barcode}
                  onChange={(e) => onChange({ ...form, barcode: e.target.value })}
                  className="font-mono"
                />
              </div>
            </div>

            {isEdit && (
              <div>
                <Label>Estado del producto</Label>
                <Select value={form.status || 'ACTIVE'} onChange={(e) => onChange({ ...form, status: e.target.value })}>
                  <option value="ACTIVE">ACTIVO</option>
                  <option value="INACTIVE">INACTIVO</option>
                </Select>
              </div>
            )}
          </>
        )}

        {/* TAB: PRICING */}
        {tab === 'pricing' && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Precio venta *</Label>
                <Input
                  type="number"
                  required
                  placeholder="15000"
                  value={form.unitPrice}
                  onChange={(e) => {
                    const u = parseFloat(e.target.value) || 0
                    const c = parseFloat(form.cost) || 0
                    const m = u > 0 && c >= 0 ? (((u - c) / u) * 100).toFixed(1) : '0'
                    onChange({ ...form, unitPrice: e.target.value, margin: m })
                  }}
                  className="font-bold"
                />
              </div>
              <div>
                <Label>Costo</Label>
                <Input
                  type="number"
                  placeholder="9000"
                  value={form.cost}
                  onChange={(e) => {
                    const c = parseFloat(e.target.value) || 0
                    const u = parseFloat(form.unitPrice) || 0
                    const m = u > 0 && c >= 0 ? (((u - c) / u) * 100).toFixed(1) : '0'
                    onChange({ ...form, cost: e.target.value, margin: m })
                  }}
                />
              </div>
              <div>
                <Label>Margen %</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="30"
                  value={form.margin}
                  onChange={(e) => onChange({ ...form, margin: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Tarifa / IVA *</Label>
              <Select value={form.ivaRate} onChange={(e) => onChange({ ...form, ivaRate: e.target.value })}>
                <option value="19">19% — General (IVA estándar)</option>
                <option value="5">5% — Tarifa Reducida (Café/Granos/Alimentos)</option>
                <option value="0">0% — Exento / Excluido de IVA</option>
                <option value="8">8% — Impoconsumo (Licores / Restaurantes)</option>
              </Select>
            </div>

            <div className="bg-input border border-line-dim rounded p-3 text-[10px] text-fg-muted space-y-1">
              <div className="font-bold text-accent uppercase tracking-wider">Resumen fiscal</div>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                <div>
                  <span className="text-fg-faint">Subtotal:</span>{' '}
                  <span className="text-fg font-bold">
                    {form.unitPrice
                      ? formatCOP(
                          Math.round(
                            (parseFloat(form.unitPrice) || 0) /
                              (1 + (parseFloat(form.ivaRate) || 0) / 100)
                          )
                        )
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-fg-faint">Impuesto:</span>{' '}
                  <span className="text-warning font-bold">
                    {form.unitPrice
                      ? formatCOP(
                          Math.round(
                            (parseFloat(form.unitPrice) || 0) -
                              (parseFloat(form.unitPrice) || 0) /
                                (1 + (parseFloat(form.ivaRate) || 0) / 100)
                          )
                        )
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-fg-faint">Ganancia:</span>{' '}
                  <span className="text-success font-bold">
                    {form.unitPrice && form.cost
                      ? formatCOP(
                          (parseFloat(form.unitPrice) || 0) - (parseFloat(form.cost) || 0)
                        )
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* TAB: TAXONOMY / STOCK */}
        {tab === 'taxonomy' && (
          <>
            <div>
              <Label>Categoría del catálogo</Label>
              <Select value={form.categoryId} onChange={(e) => onChange({ ...form, categoryId: e.target.value })}>
                <option value="">— Sin categoría asignada —</option>
                {categories
                  .filter((c) => c.status === 'ACTIVE')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
              <p className="text-[10px] text-fg-faint mt-1">
                {categories.length === 0
                  ? '⚠ No has creado categorías. Ve a /dashboard/categories.'
                  : `${categories.length} categorías disponibles`}
              </p>
            </div>

            <div>
              <Label>Etiqueta libre (alternativa)</Label>
              <Input
                type="text"
                value={form.category}
                onChange={(e) => onChange({ ...form, category: e.target.value })}
                placeholder="Ej: General, Oferta, Temporada…"
              />
              <p className="text-[10px] text-fg-faint mt-1">
                Usado si no asignas una categoría estructurada arriba.
              </p>
            </div>

            {!isEdit && (
              <div>
                <Label>Stock inicial</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="10"
                  value={form.initialStock || ''}
                  onChange={(e) => onChange({ ...form, initialStock: e.target.value })}
                />
                <p className="text-[10px] text-fg-faint mt-1">
                  Se registrará como movimiento de inventario tipo{' '}
                  <span className="text-accent font-bold">ENTRADA</span> al guardar.
                </p>
              </div>
            )}
          </>
        )}

        <div className="flex justify-between items-center gap-2 pt-3 border-t border-line-dim">
          <div className="flex items-center gap-1.5">
            {(['general', 'pricing', 'taxonomy'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onTabChange(t)}
                className={`w-2 h-2 rounded-full ${tab === t ? 'bg-accent' : 'bg-line'}`}
              />
            ))}
            <span className="text-[10px] text-fg-muted ml-2 uppercase">
              Paso {tab === 'general' ? 1 : tab === 'pricing' ? 2 : 3} / 3
            </span>
          </div>
          <div className="flex gap-2">
            <TacticalButton type="button" variant="secondary" size="sm" onClick={onClose}>
              CANCELAR
            </TacticalButton>
            {tab !== 'taxonomy' ? (
              <TacticalButton
                type="button"
                variant="primary"
                size="sm"
                onClick={() => onTabChange(tab === 'general' ? 'pricing' : 'taxonomy')}
              >
                SIGUIENTE →
              </TacticalButton>
            ) : (
              <TacticalButton type="submit" variant="primary" size="sm">
                {isEdit ? 'ACTUALIZAR PRODUCTO' : 'GUARDAR PRODUCTO'}
              </TacticalButton>
            )}
          </div>
        </div>
      </form>
    </Modal>
  )
}
