'use client'

import { useEffect, useState } from 'react'
import { UserPlus, IdCard } from 'lucide-react'
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
  const [docInput, setDocInput] = useState(customer.documentNumber || '')
  const [searched, setSearched] = useState(false)

  // Sincroniza el input cuando el cliente seleccionado cambia desde afuera
  useEffect(() => {
    setDocInput(customer.documentNumber || '')
    setSearched(false)
  }, [customer.documentNumber])

  const docTrim = docInput.trim()
  const exactMatch = docTrim
    ? customerList.find((c) => String(c.documentNumber).trim() === docTrim)
    : null
  const canCreate = docTrim !== '' && !exactMatch

  // Busca por cédula y selecciona el cliente si existe (Enter o pérdida de foco)
  function runSearch() {
    if (!docTrim) {
      onClear()
      setSearched(false)
      return
    }
    setSearched(true)
    const found = customerList.find((c) => String(c.documentNumber).trim() === docTrim)
    if (found) onSelect(found)
  }

  function handleCreate() {
    if (!canCreate) return
    onChangeForm({ ...form, documentNumber: docTrim })
    onToggleForm()
  }

  return (
    <div className="shrink-0 bg-surface border border-line rounded p-2.5 font-mono text-xs w-full min-w-0">
      <div className="flex items-center gap-1.5 w-full min-w-0">
        <input
          type="text"
          inputMode="numeric"
          aria-label="Cédula o NIT del cliente"
          value={docInput}
          placeholder="— CONSUMIDOR FINAL — (cédula + Enter)"
          onChange={(e) => {
            setDocInput(e.target.value)
            setSearched(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              runSearch()
            }
          }}
          onBlur={runSearch}
          className="flex-1 min-w-0 w-0 text-fg px-2 py-1.5 bg-input border border-line rounded font-mono text-[11px] outline-none truncate"
        />
        <button
          onClick={handleCreate}
          disabled={!canCreate}
          className="shrink-0 p-1.5 bg-raised border border-line text-accent hover:bg-accent hover:text-white rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-raised disabled:hover:text-accent"
          title={canCreate ? 'Crear cliente con esta cédula' : 'Escriba una cédula sin coincidencias para crear el cliente'}
        >
          <UserPlus className="w-3.5 h-3.5" />
        </button>
      </div>

      {searched && canCreate && (
        <div className="text-[10px] text-fg-muted pt-1.5 leading-tight">
          No se encontró un cliente con «{docTrim}». Use el botón para crearlo.
        </div>
      )}

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
