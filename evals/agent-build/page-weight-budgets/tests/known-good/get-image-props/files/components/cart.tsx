'use client'

import { createContext, useContext, useState } from 'react'

const CartContext = createContext<{ count: number; add: () => void }>({
  count: 0,
  add: () => {},
})

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0)
  return (
    <CartContext value={{ count, add: () => setCount((c) => c + 1) }}>
      {children}
    </CartContext>
  )
}

export function CartButton({ icon }: { icon: React.ReactNode }) {
  const { count } = useContext(CartContext)
  return (
    <span
      className="cart"
      aria-label={`Cart, ${count} items`}
      data-testid="cart-count"
    >
      {icon} {count}
    </span>
  )
}

export function AddToCart({ children }: { children: React.ReactNode }) {
  const { add } = useCart()
  const [added, setAdded] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => {
          add()
          setAdded(true)
        }}
      >
        {children}
      </button>
      {added ? <p role="status">Added to your cart</p> : null}
    </>
  )
}

export function useCart() {
  return useContext(CartContext)
}
