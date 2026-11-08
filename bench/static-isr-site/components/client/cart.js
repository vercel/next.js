'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

const CartContext = createContext(null)

export function CartProvider({ children, currency }) {
  const [lines, setLines] = useState([])
  const add = useCallback((product, sku) => {
    setLines((prev) => [...prev, { id: product.id, sku, price: product.price }])
  }, [])
  const value = useMemo(
    () => ({ lines, add, currency }),
    [lines, add, currency]
  )
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  return useContext(CartContext)
}

export function CartButton({ label }) {
  const cart = useCart()
  const count = cart ? cart.lines.length : 0
  return (
    <button type="button" className="cart-button" aria-label={label}>
      <span aria-hidden="true">Cart</span>
      <span className="cart-count">{count}</span>
    </button>
  )
}

export function AddToCart({ product, sku, compact }) {
  const cart = useCart()
  const [added, setAdded] = useState(false)
  return (
    <button
      type="button"
      className={compact ? 'add-to-cart compact' : 'add-to-cart'}
      data-product={product.id}
      onClick={() => {
        cart?.add(product, sku)
        setAdded(true)
      }}
    >
      {added ? 'Added' : compact ? 'Add' : `Add ${product.name} to cart`}
    </button>
  )
}
