'use client'

import { ShoppingCart, Plus, Minus, Trash2, ArrowRight } from 'lucide-react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { motion } from 'motion/react'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { formatCOP } from '@/lib/utils/pos-utils'
import type { CartItem } from '@/lib/hooks/use-cart'
import { CustomerPicker } from './CustomerPicker'
import { TotalsBreakdown } from './TotalsBreakdown'
import { CustomerFormValues } from '@/components/customers/CustomerFormModal'
import { CustomerDTO } from '@/lib/types'

interface CustomerCreditInfo {
  enabled: boolean
  limit: number
  balance: number
  status: 'AL_DIA' | 'EN_MORA' | 'BLOQUEADO'
}

interface CartPanelProps {
  cart: CartItem[]
  totals: {
    subtotal: number
    taxAmount: number
    discountAmount: number
    total: number
  }
  discount: number
  onDiscountChange: (discount: number) => void
  loading: boolean
  cashierBlocked?: boolean
  onProceed: () => void
  onRemoveItem: (productId: string) => void
  onUpdateQuantity: (productId: string, quantity: number) => void
  customer: CustomerDTO
  customerList: any[]
  customerCreditInfo: CustomerCreditInfo | null
  customerError: string | null
  showCustomerForm: boolean
  customerForm: CustomerFormValues
  onSelectCustomer: (customer: any) => void
  onClearCustomer: () => void
  onToggleCustomerForm: () => void
  onChangeCustomerForm: (form: CustomerFormValues) => void
  onSubmitCustomerForm: (e: React.FormEvent) => void
  onCancelCustomerForm: () => void
}

export function CartPanel({
  cart,
  totals,
  discount,
  onDiscountChange,
  loading,
  cashierBlocked = false,
  onProceed,
  onRemoveItem,
  onUpdateQuantity,
  customer,
  customerList,
  customerCreditInfo,
  customerError,
  showCustomerForm,
  customerForm,
  onSelectCustomer,
  onClearCustomer,
  onToggleCustomerForm,
  onChangeCustomerForm,
  onSubmitCustomerForm,
  onCancelCustomerForm,
}: CartPanelProps) {
  const [cartListRef] = useAutoAnimate<HTMLDivElement>({
    duration: 180,
    easing: 'ease-out',
  })

  return (
    <SectionPanel
      title="TICKET DE COMPRA // CARRITO"
      subtitle={`ARTÍCULOS EN ORDEN: ${cart.reduce((acc, i) => acc + i.quantity, 0)}`}
      statusSlot={<ShoppingCart className="w-4 h-4 text-accent" />}
      className="lg:col-span-1 h-full min-h-0 flex flex-col overflow-hidden"
      contentClassName="flex-1 flex flex-col justify-between min-h-0 p-3.5 space-y-3 overflow-hidden"
    >
      {/* Customer Section (DIAN Electronic Invoice) */}
      <CustomerPicker
        customer={customer}
        customerList={customerList}
        customerCreditInfo={customerCreditInfo}
        customerError={customerError}
        showCustomerForm={showCustomerForm}
        form={customerForm}
        onSelect={onSelectCustomer}
        onClear={onClearCustomer}
        onToggleForm={onToggleCustomerForm}
        onChangeForm={onChangeCustomerForm}
        onSubmitForm={onSubmitCustomerForm}
        onCancelForm={onCancelCustomerForm}
      />

      {cart.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs font-mono text-fg-muted border border-dashed border-line rounded bg-surface p-4 text-center">
          [CARRITO VACÍO - SELECCIONE PRODUCTOS]
        </div>
      ) : (
        <div ref={cartListRef} className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
          {cart.map((item) => (
            <div
              key={item.productId}
              className="bg-surface border border-line-soft rounded p-2.5 font-mono text-xs space-y-1.5"
            >
              <div className="flex justify-between items-start">
                <span className="font-bold text-fg truncate max-w-[160px]">
                  {item.productName}
                </span>
                <button
                  onClick={() => onRemoveItem(item.productId)}
                  className="text-danger hover:text-white p-1 rounded hover:bg-alert-dim transition-[color,background-color,transform] duration-150 active:scale-90"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-hover">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onUpdateQuantity(item.productId, item.quantity - 1)}
                    className="w-5 h-5 bg-panel-hover border border-line text-fg rounded flex items-center justify-center hover:bg-line transition-[background-color,transform] duration-150 active:scale-90"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <motion.span
                    key={item.quantity}
                    initial={{ scale: 0.85, opacity: 0.6 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="w-7 text-center font-bold text-accent text-xs"
                  >
                    {item.quantity}
                  </motion.span>
                  <button
                    onClick={() => onUpdateQuantity(item.productId, item.quantity + 1)}
                    className="w-5 h-5 bg-panel-hover border border-line text-fg rounded flex items-center justify-center hover:bg-line transition-[background-color,transform] duration-150 active:scale-90"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <span className="font-bold text-success text-xs">
                  {formatCOP(item.unitPrice * item.quantity)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Totals Breakdown */}
      <TotalsBreakdown totals={totals} discount={discount} />

      {/* Discount Input & Action Button */}
      <div className="shrink-0 space-y-2">
        <div className="flex items-center gap-2 font-mono text-xs">
          <Label className="whitespace-nowrap">
            DESCUENTO (%):
          </Label>
          <Input
            type="number"
            min="0"
            max="100"
            value={discount}
            onChange={(e) => onDiscountChange(Math.max(0, parseInt(e.target.value) || 0))}
            placeholder="0"
            className="bg-surface text-fg px-2.5 py-1 font-mono text-xs text-right outline-none"
          />
        </div>

        <TacticalButton
          variant="primary"
          size="md"
          className="w-full justify-center"
          disabled={cart.length === 0 || loading || cashierBlocked}
          loading={loading}
          icon={<ArrowRight className="w-4 h-4" />}
          iconPosition="right"
          onClick={onProceed}
        >
          {cashierBlocked ? 'ABRA CAJA PARA VENDER' : 'PROCEDE A PAGO'}
        </TacticalButton>
      </div>
    </SectionPanel>
  )
}
