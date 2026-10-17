'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createSale, getProducts, completeSale, generateInvoice, emitFactusElectronicInvoice, getCustomers, createCustomer, getCurrentCashierSessionSummary } from '@/app/actions/pos-actions'
import { isSessionError, redirectToLogin } from '@/lib/hooks/use-protected-query'
import { useCart } from '@/lib/hooks/use-cart'
import { calculateSaleTotals } from '@/lib/utils/pos-utils'
import { CustomerDTO } from '@/lib/types'
import type { PaymentSplit } from '@/lib/utils/payment-splits'
import { AlertTriangle } from 'lucide-react'
import { CustomerFormValues } from '@/components/customers/CustomerFormModal'
import { useToast } from '@/components/ui/ToastProvider'
import { PosHeader } from '@/components/pos/PosHeader'
import { ProductGrid } from '@/components/pos/ProductGrid'
import { CartPanel } from '@/components/pos/CartPanel'
import { PaymentModal } from '@/components/pos/PaymentModal'
import { ConfirmMoraModal } from '@/components/pos/ConfirmMoraModal'
import { StockErrorModal } from '@/components/pos/StockErrorModal'
import { OverdueSessionModal } from '@/components/pos/OverdueSessionModal'

const ITEMS_PER_PAGE = 20

const EMPTY_CUSTOMER: CustomerDTO = {
  documentType: 'CC',
  documentNumber: '',
  name: '',
  email: '',
  phone: '',
  address: '',
}

export default function DashboardPOSPage() {
  const { toast } = useToast()
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'shopping' | 'payment' | 'complete'>('shopping')
  const [saleId, setSaleId] = useState<string | null>(null)
  const [discount, setDiscount] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const [customer, setCustomer] = useState<CustomerDTO>(EMPTY_CUSTOMER)
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [customerError, setCustomerError] = useState<string | null>(null)
  const [customerList, setCustomerList] = useState<any[]>([])
  const [customerCreditInfo, setCustomerCreditInfo] = useState<{
    enabled: boolean
    limit: number
    balance: number
    status: 'AL_DIA' | 'EN_MORA' | 'BLOQUEADO'
  } | null>(null)
  const [confirmMoraOpen, setConfirmMoraOpen] = useState(false)
  const [form, setForm] = useState<CustomerFormValues>({
    documentType: 'CC',
    documentNumber: '',
    name: '',
    email: '',
    phone: '',
    address: '',
  })

  const [overdueSessionInfo, setOverdueSessionInfo] = useState<{
    isOverdue: boolean
    daysOverdue: number
    openedAt: string
    sessionId: string
  } | null>(null)
  const [showOverdueModal, setShowOverdueModal] = useState(false)

  const {
    cart,
    clearCart,
    hasWithoutStockItems,
    stockErrorModal,
    setStockErrorModal,
    addToCart,
    handleForceAddWithoutStock,
    removeFromCart,
    updateQuantity,
  } = useCart(products)

  // Load products & check session status on mount
  useEffect(() => {
    loadProducts()
    loadCustomers()
    checkSessionStatus()
  }, [])

  async function checkSessionStatus() {
    try {
      const summary = await getCurrentCashierSessionSummary()
      if (summary && summary.hasOpenSession && 'isOverdue' in summary && summary.isOverdue) {
        setOverdueSessionInfo({
          isOverdue: true,
          daysOverdue: summary.daysOverdue || 1,
          openedAt: summary.session?.openedAt ? new Date(summary.session.openedAt).toLocaleDateString() : '',
          sessionId: summary.session?.id || '',
        })
        setShowOverdueModal(true)
      }
    } catch (err) {
      console.error('Error checking cashier session status:', err)
    }
  }

  async function loadCustomers() {
    try {
      const data = await getCustomers(true)
      setCustomerList(data || [])
    } catch (error) {
      console.error('Error loading customers:', error)
    }
  }

  // Reset pagination to page 1 on search change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  async function loadProducts() {
    try {
      const data = await getProducts()
      setProducts(data)
    } catch (error) {
      console.error('Error loading products:', error)
    }
  }

  async function proceedWithSale() {
    if (cart.length === 0) {
      toast('Carrito vacío', 'error')
      return
    }

    const trimmedCustomer: CustomerDTO = {
      documentType: customer.documentType.trim(),
      documentNumber: customer.documentNumber.trim(),
      name: customer.name.trim(),
      email: customer.email?.trim() || undefined,
      phone: customer.phone?.trim() || undefined,
      address: customer.address?.trim() || undefined,
    }

    setCustomerError(null)
    setLoading(true)
    try {
      const locationId = 'loc_bogota_01'
      const isWithoutStock = hasWithoutStockItems || cart.some((i: any) => i.withoutStock)

      const response = await createSale({
        locationId,
        items: cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        customer: trimmedCustomer,
        allowWithoutStock: isWithoutStock,
        notes: isWithoutStock ? '[VENTA REALIZADA SIN STOCK EN INVENTARIO]' : undefined,
      })

      if (response.success) {
        setSaleId(response.saleId)
        setStep('payment')
      }
    } catch (error: any) {
      console.error('Error creating sale:', error)
      if (isSessionError(error)) {
        redirectToLogin()
        return
      }
      toast(`Error al crear venta: ${error.message || 'Intente de nuevo'}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateSale() {
    if (cart.length === 0) {
      toast('Carrito vacío', 'error')
      return
    }

    const trimmedCustomer: CustomerDTO = {
      documentType: customer.documentType.trim(),
      documentNumber: customer.documentNumber.trim(),
      name: customer.name.trim(),
      email: customer.email?.trim() || undefined,
      phone: customer.phone?.trim() || undefined,
      address: customer.address?.trim() || undefined,
    }

    const hasCustomer =
      trimmedCustomer.documentNumber.length > 0 && trimmedCustomer.name.length > 0

    // Cliente obligatorio para facturar
    if (!hasCustomer) {
      setCustomerError('⚠ Debes seleccionar o registrar un cliente antes de facturar.')
      return
    }

    // Si tiene mora, pedir confirmación (pero permitir continuar)
    if (customerCreditInfo && customerCreditInfo.status === 'EN_MORA') {
      setConfirmMoraOpen(true)
      return
    }

    await proceedWithSale()
  }

  const totals = calculateSaleTotals(
    cart.map((item) => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      ivaRate: item.ivaRate,
    })),
    discount
  )

  async function handleCompleteSale(payments: PaymentSplit[]) {
    if (!saleId) return

    setLoading(true)
    try {
      await completeSale({
        saleId,
        payments,
        discountPercentage: discount,
      })

      // 1) Generate local invoice / internal sales ticket (with proper enum)
      try {
        await generateInvoice({
          saleId,
          resolution: 'VENTA-INTERNA-POS',
          prefix: 'REC',
        })
      } catch (invErr) {
        console.warn('Facturación local / Ticket interno:', invErr)
      }

      // 2) Auto-transmitir a Factus → DIAN. Si falla, la factura queda como PENDIENTE
      //    y el usuario puede reintentar desde /dashboard/invoices.
      let factusResult: { success: boolean; message: string; cufe?: string } | null = null
      try {
        factusResult = await emitFactusElectronicInvoice(saleId)
      } catch (factusErr: any) {
        factusResult = { success: false, message: factusErr?.message ?? 'Error desconocido' }
      }

      handleNewSale()

      // Toast del resultado de transmisión
      if (factusResult?.success) {
        toast(
          `✅ Venta completada y transmitida a DIAN.\n\nCUFE: ${factusResult.cufe}\n\nVerás esta factura con badge verde en /dashboard/invoices.`
        )
      } else if (/no hay proveedor|no configurado|configúrelo/i.test(factusResult?.message ?? '')) {
        // Facturación electrónica no configurada (sin credenciales reales de Factus):
        // la venta local SÍ quedó registrada, solo se omite la transmisión.
        toast(
          `✅ Venta completada y guardada localmente.\n\n` +
            `ℹ️ La facturación electrónica (DIAN) no está configurada con credenciales reales, ` +
            `así que esta venta no se transmitió.\n\n` +
            `Para activarla, ve a /dashboard/settings → "FACTURACIÓN ELECTRÓNICA" y coloca tu ` +
            `client_id / client_secret / email / password de Factus.`
        )
      } else {
        toast(
          `⚠ Venta completada. La factura local se creó, pero NO se transmitió a DIAN:\n\n${factusResult?.message ?? 'sin error'}\n\nVe a /dashboard/invoices y dale "TRANSMITIR DIAN" para reintentar.`,
          'error'
        )
      }
    } catch (error: any) {
      console.error('Error completing sale:', error)
      if (isSessionError(error)) {
        redirectToLogin()
        return
      }
      toast(`Error al procesar la venta: ${error.message || 'Intente de nuevo'}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  function handleNewSale() {
    clearCart()
    setSaleId(null)
    setStep('shopping')
    setDiscount(0)
    setCustomer(EMPTY_CUSTOMER)
    setShowCustomerForm(false)
    setCustomerError(null)
    setCustomerCreditInfo(null)
  }

  function clearCustomer() {
    setCustomer(EMPTY_CUSTOMER)
    setShowCustomerForm(false)
    setCustomerError(null)
    setCustomerCreditInfo(null)
  }

  function selectCustomer(c: any) {
    setCustomer({
      documentType: c.documentType,
      documentNumber: c.documentNumber,
      name: c.name,
      email: c.email || '',
      phone: c.phone || '',
      address: c.address || '',
    })
    setShowCustomerForm(false)
    setCustomerError(null)

    // Cargar info de crédito del cliente seleccionado
    setCustomerCreditInfo({
      enabled: c.creditEnabled === 'SI',
      limit: Number(c.creditLimit || 0),
      balance: Number(c.creditBalance || 0),
      status: c.creditStatus || 'AL_DIA',
    })
  }

  async function handleQuickCreateCustomer(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name?.trim() || !form.documentNumber?.trim()) {
      setCustomerError('Documento y Nombre son obligatorios.')
      return
    }
    setCustomerError(null)
    try {
      await createCustomer({
        documentType: form.documentType,
        documentNumber: form.documentNumber,
        name: form.name,
        email: form.email,
        phone: form.phone,
        address: form.address,
        personType: form.documentType === 'NIT' ? 'JURIDICA' : 'NATURAL',
      })
      await loadCustomers()
      setCustomer({
        documentType: form.documentType,
        documentNumber: form.documentNumber,
        name: form.name,
        email: form.email || '',
        phone: form.phone || '',
        address: form.address || '',
      })
      // Cliente recién creado: sin crédito aún
      setCustomerCreditInfo({
        enabled: false,
        limit: 0,
        balance: 0,
        status: 'AL_DIA',
      })
      setForm({ documentType: 'CC', documentNumber: '', name: '', email: '', phone: '', address: '' })
      setShowCustomerForm(false)
      setCustomerError(null)
    } catch (err: any) {
      setCustomerError(err.message || 'Error al crear cliente')
    }
  }

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE) || 1

  // Stock visual: descuenta del badge lo que ya está en el carrito.
  // Solo afecta la vista del grid — useCart sigue validando contra
  // product.quantity real (inventario), no contra este valor.
  const cartQtyByProductId = cart.reduce<Record<string, number>>((acc, item) => {
    acc[item.productId] = (acc[item.productId] || 0) + item.quantity
    return acc
  }, {})

  const paginatedProducts = filteredProducts
    .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
    .map((p) => ({
      ...p,
      quantity: Math.max(0, Number(p.quantity || 0) - (cartQtyByProductId[p.id] || 0)),
    }))

  return (
    <div className="h-[calc(100vh-100px)] md:h-[calc(100vh-110px)] flex flex-col justify-between overflow-hidden gap-3">
      {/* ALERTA CRÍTICA: TURNO VENCIDO DEL DÍA ANTERIOR */}
      {overdueSessionInfo?.isOverdue && (
        <div className="bg-danger-dim border border-alert text-red-soft px-4 py-2 rounded text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shrink-0 animate-pulse">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="w-4 h-4 text-alert shrink-0" />
            <span>
              ⚠️ ALERTA: TIENE UN TURNO DE CAJA PENDIENTE DE CIERRE DESDE HACE {overdueSessionInfo.daysOverdue} DÍA(S) ({overdueSessionInfo.openedAt}).
            </span>
          </div>
          <Link
            href="/dashboard/cash-closure"
            className="bg-alert text-white font-bold px-3 py-1 rounded hover:bg-white hover:text-black transition-colors text-[11px] shrink-0"
          >
            REALIZAR CIERRE AHORA &gt;
          </Link>
        </div>
      )}

      {/* Header Bar */}
      <PosHeader step={step} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0 overflow-hidden">
        {/* Products Selection Section (Left 2 cols) */}
        <ProductGrid
          products={paginatedProducts}
          filteredCount={filteredProducts.length}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={(page) => setCurrentPage(page)}
          onAdd={addToCart}
        />

        {/* Cart Summary Section (Right 1 col) */}
        <CartPanel
          cart={cart}
          totals={totals}
          discount={discount}
          onDiscountChange={setDiscount}
          loading={loading}
          onProceed={handleCreateSale}
          onRemoveItem={removeFromCart}
          onUpdateQuantity={updateQuantity}
          customer={customer}
          customerList={customerList}
          customerCreditInfo={customerCreditInfo}
          customerError={customerError}
          showCustomerForm={showCustomerForm}
          customerForm={form}
          onSelectCustomer={selectCustomer}
          onClearCustomer={clearCustomer}
          onToggleCustomerForm={() => setShowCustomerForm((v) => !v)}
          onChangeCustomerForm={setForm}
          onSubmitCustomerForm={handleQuickCreateCustomer}
          onCancelCustomerForm={() => {
            setShowCustomerForm(false)
            setForm({ documentType: 'CC', documentNumber: '', name: '', email: '', phone: '', address: '' })
            setCustomerError(null)
          }}
        />
      </div>

      {/* MODAL POPUP: PROCESAMIENTO DE PAGO */}
      {step === 'payment' && (
        <PaymentModal
          open={step === 'payment'}
          saleId={saleId}
          total={totals.total}
          loading={loading}
          customerCredit={customerCreditInfo}
          onBack={() => setStep('shopping')}
          onComplete={handleCompleteSale}
        />
      )}

      {/* MODAL: CONFIRMACIÓN DE MORA */}
      {confirmMoraOpen && customerCreditInfo && (
        <ConfirmMoraModal
          open={confirmMoraOpen}
          customer={customer}
          creditInfo={customerCreditInfo}
          onClose={() => setConfirmMoraOpen(false)}
          onConfirm={async () => {
            setConfirmMoraOpen(false)
            await proceedWithSale()
          }}
        />
      )}

      {/* MODAL ALERTA: SIN STOCK DISPONIBLE */}
      {stockErrorModal && (
        <StockErrorModal
          error={stockErrorModal}
          onClose={() => setStockErrorModal(null)}
          onForceAdd={handleForceAddWithoutStock}
        />
      )}

      {/* MODAL AUDITORÍA: NOTIFICACIÓN DE TURNO DE CAJA VENCIDO (DÍA ANTERIOR) */}
      {showOverdueModal && overdueSessionInfo?.isOverdue && (
        <OverdueSessionModal
          open={showOverdueModal}
          info={overdueSessionInfo}
          onClose={() => setShowOverdueModal(false)}
        />
      )}
    </div>
  )
}
