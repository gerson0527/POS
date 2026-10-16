'use client'

import { UserPlus, IdCard } from 'lucide-react'
import { Select } from '@/components/ui/Select'
import { CustomerFormModal, CustomerFormValues } from '@/components/customers/CustomerFormModal'
import { POS_DOC_TYPES } from '@/lib/catalogs/customers'
import { CustomerDTO } from '@/lib/types'

interface CustomerCreditInfo {
  enabled: boolean
  limit: number
  balance: number
  status: 'AL_DIA' | 'EN_MORA' | 'BLOQUEADO'
}

interface CustomerPickerProps {
  customer: CustomerDTO
  customerList: any[]
  customerCreditInfo: CustomerCreditInfo | null
  customerError: string | null
  showCustomerForm: boolean
  form: CustomerFormValues
  onSelect: (customer: any) => void
  onClear: () => void
  onToggleForm: () => void
  onChangeForm: (form: CustomerFormValues) => void
  onSubmitForm: (e: React.FormEvent) => void
  onCancelForm: () => void
}

export function CustomerPicker({
  customer,
  customerList,
  customerCreditInfo,
  customerError,
  showCustomerForm,
  form,
  onSelect,
  onClear,
  onToggleForm,
  onChangeForm,
  onSubmitForm,
  onCancelForm,
}: CustomerPickerProps) {
  return (
    <div className="shrink-0 bg-surface border border-line rounded p-2.5 font-mono text-xs w-full min-w-0">
      <div className="flex items-center gap-1.5 w-full min-w-0">
        <Select
          value={customer.documentNumber || ''}
          onChange={(e) => {
            const doc = e.target.value
            if (!doc) {
              onClear()
              return
            }
            const found = customerList.find((c) => c.documentNumber === doc)
            if (found) onSelect(found)
          }}
          className="flex-1 min-w-0 w-0 text-fg px-2 py-1.5 font-mono text-[11px] uppercase outline-none truncate font-normal"
        >
          <option value="">— CONSUMIDOR FINAL —</option>
          {customerList.map((c) => (
            <option key={c.id} value={c.documentNumber} className="bg-surface text-fg">
              {c.documentType} {c.documentNumber} · {c.name}
            </option>
          ))}
        </Select>
        <button
          onClick={onToggleForm}
          className="shrink-0 p-1.5 bg-raised border border-line text-accent hover:bg-accent hover:text-white rounded transition-colors"
          title="Nuevo cliente"
        >
          <UserPlus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Indicador de estado del cliente seleccionado */}
      {customer.documentNumber && customer.name && customerCreditInfo && (
        <div className="flex items-center justify-between gap-2 text-[10px] pt-1.5 border-t border-line-soft">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-fg uppercase truncate">{customer.name}</div>
            <div className="text-fg-muted text-[10px]">
              {customer.documentType} {customer.documentNumber}
            </div>
          </div>
          {customerCreditInfo.status === 'EN_MORA' && (
            <div className="flex items-center gap-1 px-2 py-1 bg-alert-dim border border-alert-line rounded text-alert font-bold uppercase text-[9px] shrink-0">
              ⚠ MORA
            </div>
          )}
          {customerCreditInfo.status === 'BLOQUEADO' && (
            <div className="flex items-center gap-1 px-2 py-1 bg-amber-line border border-warn-bg-4 rounded text-warning font-bold uppercase text-[9px] shrink-0">
              🔒 BLOQUEADO
            </div>
          )}
          {customerCreditInfo.enabled && customerCreditInfo.status === 'AL_DIA' && (
            <div className="flex items-center gap-1 px-2 py-1 bg-ok-dim border border-ok-line rounded text-ok font-bold uppercase text-[9px] shrink-0">
              ✓ CRÉDITO OK
            </div>
          )}
        </div>
      )}

      {customerError && (
        <div className="flex items-start gap-1 text-[10px] text-alert font-bold pt-1">
          <IdCard className="w-3 h-3 shrink-0 mt-0.5" />
          <span>{customerError}</span>
        </div>
      )}

      {showCustomerForm && (
        <CustomerFormModal
          compact
          onSubmit={onSubmitForm}
          form={form}
          onChange={onChangeForm}
          docTypes={POS_DOC_TYPES}
          error={customerError}
          onCancel={onCancelForm}
        />
      )}
    </div>
  )
}
