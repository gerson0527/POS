import { useState } from 'react'

export interface CartItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  ivaRate: number
  withoutStock?: boolean
}

export interface StockErrorState {
  title: string
  message: string
  productName?: string
  availableStock?: number
  product?: any
}

export function useCart(products: any[]) {
  const [cart, setCart] = useState<CartItem[]>([])
  const [hasWithoutStockItems, setHasWithoutStockItems] = useState(false)
  const [approvedWithoutStockProductIds, setApprovedWithoutStockProductIds] = useState<string[]>([])
  const [stockErrorModal, setStockErrorModal] = useState<StockErrorState | null>(null)

  function addToCart(product: any) {
    const existing = cart.find((item) => item.productId === product.id)
    const isApprovedWithoutStock = existing?.withoutStock || approvedWithoutStockProductIds.includes(product.id)

    // Si ya se aprobó continuar sin stock para este producto, incrementar directamente sin volver a mostrar la alerta
    if (isApprovedWithoutStock) {
      setCart((prev) => {
        const ex = prev.find((item: any) => item.productId === product.id)
        if (ex) {
          return prev.map((item: any) =>
            item.productId === product.id ? { ...item, quantity: item.quantity + 1, withoutStock: true } : item
          )
        }
        return [
          ...prev,
          {
            productId: product.id,
            productName: product.name,
            quantity: 1,
            unitPrice: Number(product.unitPrice),
            ivaRate: Number(product.ivaRate || 19),
            withoutStock: true,
          },
        ]
      })
      return
    }

    const available = Number(product.quantity || 0)

    if (available <= 0) {
      setStockErrorModal({
        title: '¡PRODUCTO SIN STOCK DISPONIBLE!',
        message: `El producto "${product.name}" no cuenta con existencias en inventario (Stock actual: 0).`,
        productName: product.name,
        availableStock: available,
        product,
      })
      return
    }

    const currentQtyInCart = existing ? existing.quantity : 0

    if (currentQtyInCart + 1 > available) {
      setStockErrorModal({
        title: '¡LÍMITE DE STOCK ALCANZADO!',
        message: `No puede agregar más unidades del producto "${product.name}". Solo dispone de ${available} unidad(es) en inventario.`,
        productName: product.name,
        availableStock: available,
        product,
      })
      return
    }

    setCart((prev) => {
      const ex = prev.find((item) => item.productId === product.id)
      if (ex) {
        return prev.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          unitPrice: Number(product.unitPrice),
          ivaRate: Number(product.ivaRate || 19),
        },
      ]
    })
  }

  function handleForceAddWithoutStock() {
    if (!stockErrorModal?.product) return
    const prod = stockErrorModal.product

    setApprovedWithoutStockProductIds((prev) => [...prev, prod.id])

    setCart((prev) => {
      const ex = prev.find((item: any) => item.productId === prod.id)
      if (ex) {
        return prev.map((item: any) =>
          item.productId === prod.id ? { ...item, quantity: item.quantity + 1, withoutStock: true } : item
        )
      }
      return [
        ...prev,
        {
          productId: prod.id,
          productName: prod.name,
          quantity: 1,
          unitPrice: Number(prod.unitPrice),
          ivaRate: Number(prod.ivaRate || 19),
          withoutStock: true,
        },
      ]
    })

    setHasWithoutStockItems(true)
    setStockErrorModal(null)
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((item) => item.productId !== productId))
  }

  function updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      removeFromCart(productId)
      return
    }

    const cartItem = cart.find((i: any) => i.productId === productId)
    const isApprovedWithoutStock = cartItem?.withoutStock || approvedWithoutStockProductIds.includes(productId)

    if (isApprovedWithoutStock) {
      setCart((prev) =>
        prev.map((item: any) => (item.productId === productId ? { ...item, quantity, withoutStock: true } : item))
      )
      return
    }

    const prod = products.find((p) => p.id === productId)
    if (prod) {
      const available = Number(prod.quantity || 0)
      if (quantity > available) {
        setStockErrorModal({
          title: '¡EXCEDE EL STOCK DISPONIBLE!',
          message: `El producto "${prod.name}" solo dispone de ${available} unidad(es) en inventario.`,
          productName: prod.name,
          availableStock: available,
          product: prod,
        })
        setCart((prev) =>
          prev.map((item) => (item.productId === productId ? { ...item, quantity: available } : item))
        )
        return
      }
    }

    setCart((prev) =>
      prev.map((item) => (item.productId === productId ? { ...item, quantity } : item))
    )
  }

  function clearCart() {
    setCart([])
  }

  return {
    cart,
    setCart,
    clearCart,
    hasWithoutStockItems,
    stockErrorModal,
    setStockErrorModal,
    addToCart,
    handleForceAddWithoutStock,
    removeFromCart,
    updateQuantity,
  }
}
