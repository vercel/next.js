'use client'

import { useCartCount } from './cart-count-context'

export function CartCount() {
  const [count] = useCartCount()
  return <span>{count}</span>
}
