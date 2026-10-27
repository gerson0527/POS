'use client'

import { useState, useEffect } from 'react'
import {
  Package,
  Plus,
  Truck,
  Building2,
  History,
  RefreshCw,
  FileDown,
  FileUp,
} from 'lucide-react'
import { ProductFormModal, type ProductFormValues } from '@/components/inventory/ProductFormModal'
import { MovementModal } from '@/components/inventory/MovementModal'
import { SupplierModal } from '@/components/inventory/SupplierModal'
import { PurchaseOrderModal } from '@/components/inventory/PurchaseOrderModal'
import { ImportCsvModal } from '@/components/inventory/ImportCsvModal'
import { InventoryStats } from '@/components/inventory/InventoryStats'
import { ProductsTable } from '@/components/inventory/ProductsTable'
import { PurchaseOrdersTable } from '@/components/inventory/PurchaseOrdersTable'
import { SuppliersTable } from '@/components/inventory/SuppliersTable'
import { MovementsTable } from '@/components/inventory/MovementsTable'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { PageHeader } from '@/components/ui/PageHeader'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import {
  getProducts,
  getInventoryStats,
  getSuppliersList,
  getPurchaseOrdersList,
  getInventoryMovementsList,
  createProduct,
  updateProduct,
  toggleProductStatus,
  deleteSupplier,
  exportProductsToCSV,
  getProductCategories,
} from '@/app/actions/pos-actions'

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState('overview')
  const [products, setProducts] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([])
  const [movements, setMovements] = useState<any[]>([])
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalStockValue: 0,
    lowStockCount: 0,
    lowStockProducts: [] as any[],
    pendingPOsCount: 0,
  })

  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { toast } = useToast()
  const confirmAction = useConfirm()

  // Pagination states
  const [productsPage, setProductsPage] = useState(1)
  const [movementsPage, setMovementsPage] = useState(1)
  const [suppliersPage, setSuppliersPage] = useState(1)
  const [ordersPage, setOrdersPage] = useState(1)
  const itemsPerPage = 20

  // Modal States
  const [isProductModalOpen, setIsProductModalOpen] = useState(false)
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false)
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false)
  const [isPOModalOpen, setIsPOModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

  // Product Form States
  const defaultProductForm: ProductFormValues = {
    name: '',
    sku: '',
    barcode: '',
    description: '',
    category: 'General',
    categoryId: '',
    unitPrice: '',
    cost: '',
    margin: '0',
    ivaRate: '19',
    taxTreatment: 'TAXED',
    initialStock: '10',
  }

  const [productForm, setProductForm] = useState<ProductFormValues>(defaultProductForm)
  const [productModalTab, setProductModalTab] = useState<'general' | 'pricing' | 'taxonomy'>('general')
  const [editingProduct, setEditingProduct] = useState<any | null>(null)

  const [productCategories, setProductCategories] = useState<any[]>([])

  useEffect(() => {
    loadInventoryData()
  }, [])

  async function loadInventoryData() {
    setLoading(true)
    try {
      const [prodsData, statsData, suppsData, posData, movsData, catsData] = await Promise.all([
        getProducts().catch(() => []),
        getInventoryStats().catch(() => ({
          totalProducts: 0,
          totalStockValue: 0,
          lowStockCount: 0,
          lowStockProducts: [],
          pendingPOsCount: 0,
        })),
        getSuppliersList().catch(() => []),
        getPurchaseOrdersList().catch(() => []),
        getInventoryMovementsList().catch(() => []),
        getProductCategories(true).catch(() => []),
      ])

      setProducts(prodsData || [])
      setStats(statsData)
      setSuppliers(suppsData || [])
      setPurchaseOrders(posData || [])
      setMovements(movsData || [])
      setProductCategories(catsData || [])
    } catch (error) {
      console.error('Error fetching inventory data from PostgreSQL:', error)
    } finally {
      setLoading(false)
    }
  }

  // EXPORT
  async function handleExportProducts() {
    try {
      const { csv, filename } = await exportProductsToCSV()
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast(`EXPORTADOS ${products.length} PRODUCTOS`)
    } catch (err: any) {
      toast(`Error al exportar: ${err.message}`, 'error')
    }
  }

  // Handlers for Product Modal
  function openCreateProductModal() {
    setProductForm(defaultProductForm)
    setEditingProduct(null)
    setProductModalTab('general')
    setIsProductModalOpen(true)
  }

  function openEditProductModal(p: any) {
    const u = parseFloat(p.unitPrice) || 0
    const c = parseFloat(p.cost) || 0
    const calcMargin = p.margin !== undefined && p.margin !== null ? String(p.margin) : (u > 0 && c >= 0 ? (((u - c) / u) * 100).toFixed(1) : '0')

    // Detectar categoría: si tiene categoryId válido de la lista, usarlo; si no, mantener texto libre
    const matchedCategory = productCategories.find((c) => c.id === p.categoryId || c.id === p.category || c.name === p.category)

    setProductForm({
      id: p.id,
      name: p.name || '',
      sku: p.sku || '',
      barcode: p.barcode || '',
      description: p.description || '',
      category: p.category || matchedCategory?.name || 'General',
      categoryId: matchedCategory?.id || p.categoryId || '',
      unitPrice: p.unitPrice ? String(p.unitPrice) : '',
      cost: p.cost ? String(p.cost) : '',
      margin: calcMargin,
      ivaRate: p.ivaRate ? String(p.ivaRate) : '19',
      taxTreatment: p.taxTreatment || 'TAXED',
      status: p.status || 'ACTIVE',
    })
    setEditingProduct(p)
    setProductModalTab('general')
    setIsProductModalOpen(true)
  }

  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault()

    if (editingProduct) {
      if (!productForm.id || !productForm.name || !productForm.unitPrice) return

      try {
        const matchedCategory = productCategories.find((c) => c.id === productForm.categoryId)

        await updateProduct(productForm.id, {
          name: productForm.name,
          sku: productForm.sku,
          barcode: productForm.barcode || undefined,
          description: productForm.description || undefined,
          category: matchedCategory?.name || productForm.category || 'General',
          categoryId: productForm.categoryId || undefined,
          unitPrice: parseFloat(productForm.unitPrice) || 0,
          cost: productForm.cost ? parseFloat(productForm.cost) : undefined,
          margin: productForm.margin ? parseFloat(productForm.margin) : undefined,
          ivaRate: parseFloat(productForm.ivaRate) || 0,
          taxTreatment: productForm.taxTreatment,
          status: productForm.status,
        })

        toast(`¡PRODUCTO "${productForm.name.toUpperCase()}" ACTUALIZADO EXITOSAMENTE!`)
        setIsProductModalOpen(false)
        setProductForm(defaultProductForm)
        setEditingProduct(null)
        setProductModalTab('general')
        loadInventoryData()
      } catch (err: any) {
        toast(`Error al actualizar producto: ${err.message}`, 'error')
      }
      return
    }

    if (!productForm.name || !productForm.unitPrice) return

    try {
      const matchedCategory = productCategories.find((c) => c.id === productForm.categoryId)

      await createProduct({
        name: productForm.name,
        sku: productForm.sku || `SKU-${Date.now().toString().slice(-6)}`,
        barcode: productForm.barcode || undefined,
        description: productForm.description || undefined,
        category: matchedCategory?.name || productForm.category || 'General',
        categoryId: productForm.categoryId || undefined,
        unitPrice: parseFloat(productForm.unitPrice) || 0,
        cost: productForm.cost ? parseFloat(productForm.cost) : undefined,
        margin: productForm.margin ? parseFloat(productForm.margin) : undefined,
        ivaRate: parseFloat(productForm.ivaRate) || 19,
        taxTreatment: productForm.taxTreatment,
        initialStock: parseInt(productForm.initialStock || '') || 0,
      } as any)

      toast(`¡PRODUCTO "${productForm.name.toUpperCase()}" REGISTRADO CORRECTAMENTE!`)
      setIsProductModalOpen(false)
      setProductForm(defaultProductForm)
      setEditingProduct(null)
      setProductModalTab('general')
      loadInventoryData()
    } catch (err: any) {
      toast(`Error al registrar producto: ${err.message}`, 'error')
    }
  }

  async function handleToggleProductStatus(p: any) {
    const newStatus = p.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    const label = newStatus === 'ACTIVE' ? 'ACTIVADO' : 'INACTIVADO'
    try {
      await toggleProductStatus(p.id, newStatus)
      toast(`¡PRODUCTO "${p.name.toUpperCase()}" ${label}!`)
      loadInventoryData()
    } catch (err: any) {
      toast(`Error al cambiar estado del producto: ${err.message}`, 'error')
    }
  }

  async function handleDeleteSupplier(id: string, name: string) {
    if (!(await confirmAction({ title: 'ELIMINAR PROVEEDOR', message: `¿Está seguro de eliminar el proveedor "${name}"?`, confirmLabel: 'ELIMINAR', tone: 'danger' }))) return
    try {
      await deleteSupplier(id)
      toast(`¡PROVEEDOR "${name.toUpperCase()}" ELIMINADO CON ÉXITO!`)
      loadInventoryData()
    } catch (err: any) {
      toast(`Error al eliminar proveedor: ${err.message}`, 'error')
    }
  }

  const tabs = [
    { id: 'overview', label: 'RESUMEN DE KARDEX', icon: Package },
    { id: 'purchase-orders', label: 'ÓRDENES DE COMPRA (PO)', icon: Truck },
    { id: 'suppliers', label: 'PROVEEDORES', icon: Building2 },
    { id: 'movements', label: 'LOG DE MOVIMIENTOS', icon: History },
  ]

  // Filtered and Paginated Products
  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const totalProductPages = Math.ceil(filteredProducts.length / itemsPerPage) || 1
  const paginatedProducts = filteredProducts.slice(
    (productsPage - 1) * itemsPerPage,
    productsPage * itemsPerPage
  )

  const totalMovementPages = Math.ceil(movements.length / itemsPerPage) || 1
  const paginatedMovements = movements.slice(
    (movementsPage - 1) * itemsPerPage,
    movementsPage * itemsPerPage
  )

  const totalSupplierPages = Math.ceil(suppliers.length / itemsPerPage) || 1
  const paginatedSuppliers = suppliers.slice(
    (suppliersPage - 1) * itemsPerPage,
    suppliersPage * itemsPerPage
  )

  const totalOrderPages = Math.ceil(purchaseOrders.length / itemsPerPage) || 1
  const paginatedOrders = purchaseOrders.slice(
    (ordersPage - 1) * itemsPerPage,
    ordersPage * itemsPerPage
  )

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <PageHeader
        breakpoint="lg"
        actionsClassName="flex flex-wrap items-center gap-2"
        icon={<Package className="w-4 h-4" />}
        kicker="STOCK & LOGISTICS CONTROL"
        title="INVENTARIO Y KARDEX TÁCTICO"
        description="Gestión en tiempo real de existencias, kardex y proveedores."
        actions={
          <>
            <TacticalButton
              variant="secondary"
              size="sm"
              onClick={loadInventoryData}
              loading={loading}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              RECARGAR
            </TacticalButton>

            <TacticalButton
              variant="primary"
              size="sm"
              onClick={openCreateProductModal}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              NUEVO PRODUCTO
            </TacticalButton>

            <TacticalButton
              variant="primary"
              size="sm"
              onClick={() => setIsPOModalOpen(true)}
              icon={<Truck className="w-3.5 h-3.5" />}
            >
              NUEVA PO
            </TacticalButton>

            <TacticalButton
              variant="primary"
              size="sm"
              onClick={() => setIsSupplierModalOpen(true)}
              icon={<Building2 className="w-3.5 h-3.5" />}
            >
              NUEVO PROVEEDOR
            </TacticalButton>

            <TacticalButton
              variant="secondary"
              size="sm"
              onClick={handleExportProducts}
              icon={<FileDown className="w-3.5 h-3.5" />}
            >
              EXPORTAR EXCEL
            </TacticalButton>

            <TacticalButton
              variant="secondary"
              size="sm"
              onClick={() => setIsImportModalOpen(true)}
              icon={<FileUp className="w-3.5 h-3.5" />}
            >
              IMPORTAR EXCEL
            </TacticalButton>

            <TacticalButton
              variant="secondary"
              size="sm"
              onClick={() => setIsMovementModalOpen(true)}
              icon={<History className="w-3.5 h-3.5" />}
            >
              REGISTRAR KARDEX
            </TacticalButton>
          </>
        }
      />

      {/* Dynamic DB Stats Grid */}
      <InventoryStats stats={stats} />

      {/* Tabs Bar */}
      <Tabs
        items={tabs}
        value={activeTab}
        onChange={(id) => setActiveTab(id)}
      />

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'overview' && (
          <ProductsTable
            rows={paginatedProducts}
            searchQuery={searchQuery}
            onSearchChange={(value) => {
              setSearchQuery(value)
              setProductsPage(1)
              setSuppliersPage(1)
              setOrdersPage(1)
            }}
            page={productsPage}
            totalPages={totalProductPages}
            totalItems={filteredProducts.length}
            itemsPerPage={itemsPerPage}
            onPageChange={(page) => setProductsPage(page)}
            onEdit={openEditProductModal}
            onToggle={handleToggleProductStatus}
          />
        )}

        {activeTab === 'purchase-orders' && (
          <PurchaseOrdersTable
            rows={paginatedOrders}
            totalItems={purchaseOrders.length}
            page={ordersPage}
            totalPages={totalOrderPages}
            itemsPerPage={itemsPerPage}
            onPageChange={(page) => setOrdersPage(page)}
            onNew={() => setIsPOModalOpen(true)}
          />
        )}

        {activeTab === 'suppliers' && (
          <SuppliersTable
            rows={paginatedSuppliers}
            totalItems={suppliers.length}
            page={suppliersPage}
            totalPages={totalSupplierPages}
            itemsPerPage={itemsPerPage}
            onPageChange={(page) => setSuppliersPage(page)}
            onNew={() => setIsSupplierModalOpen(true)}
            onDelete={handleDeleteSupplier}
          />
        )}

        {activeTab === 'movements' && (
          <MovementsTable
            rows={paginatedMovements}
            totalItems={movements.length}
            page={movementsPage}
            totalPages={totalMovementPages}
            itemsPerPage={itemsPerPage}
            onPageChange={(page) => setMovementsPage(page)}
            onNew={() => setIsMovementModalOpen(true)}
          />
        )}
      </div>

      {/* MODAL: PRODUCTO (NUEVO / EDITAR) */}
      {isProductModalOpen && (
        <ProductFormModal
          open={isProductModalOpen}
          onClose={() => setIsProductModalOpen(false)}
          onSubmit={handleSaveProduct}
          mode={editingProduct ? 'edit' : 'create'}
          form={productForm}
          onChange={setProductForm}
          tab={productModalTab}
          onTabChange={(t) => setProductModalTab(t)}
          categories={productCategories}
        />
      )}

      {/* MODAL: REGISTRAR MOVIMIENTO KARDEX */}
      {isMovementModalOpen && (
        <MovementModal
          open={isMovementModalOpen}
          onClose={() => setIsMovementModalOpen(false)}
          products={products}
          onSubmitted={loadInventoryData}
        />
      )}

      {/* MODAL: NUEVO PROVEEDOR */}
      {isSupplierModalOpen && (
        <SupplierModal
          open={isSupplierModalOpen}
          onClose={() => setIsSupplierModalOpen(false)}
          onSubmitted={loadInventoryData}
        />
      )}

      {/* MODAL: NUEVA ORDEN DE COMPRA (PO) */}
      {isPOModalOpen && (
        <PurchaseOrderModal
          open={isPOModalOpen}
          onClose={() => setIsPOModalOpen(false)}
          suppliers={suppliers}
          products={products}
          onSubmitted={loadInventoryData}
        />
      )}

      {/* MODAL: IMPORTAR PRODUCTOS DESDE EXCEL/CSV */}
      {isImportModalOpen && (
        <ImportCsvModal
          open={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImported={loadInventoryData}
        />
      )}
    </div>
  )
}
