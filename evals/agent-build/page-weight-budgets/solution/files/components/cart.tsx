'use client'

import { createContext, useContext, useState } from 'react'
import { Icon } from '@/components/icon'

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

export function CartButton() {
  const { count } = useContext(CartContext)
  return (
    <span
      className="cart"
      aria-label={`Cart, ${count} items`}
      data-testid="cart-count"
    >
      <Icon name="cart" /> {count}
    </span>
  )
}

export function AddToCart() {
  const { add } = useContext(CartContext)
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
        <Icon name="cart" /> Add to cart
      </button>
      {added ? <p role="status">Added to your cart</p> : null}
    </>
  )
}
