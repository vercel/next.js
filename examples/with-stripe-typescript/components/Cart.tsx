import React, { ReactNode } from 'react'
import { CartProvider } from 'use-shopping-cart'
import * as config from '../config'

const Cart = ({ children }: { children: ReactNode }) => (
  <CartProvider
    cartMode="checkout-session"
    stripe={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string}
    currency={config.CURRENCY}
  >
    <>{children}</>
  </CartProvider>
)

export default Cart
