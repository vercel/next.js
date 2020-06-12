import React, { useState } from 'react'

import { useShoppingCart } from 'use-shopping-cart'
import { fetchPostJSON } from '../utils/api-helpers'

const CartSummary = () => {
  const [loading, setLoading] = useState(false)
  const {
    formattedTotalPrice,
    cartCount,
    clearCart,
    cartDetails,
    redirectToCheckout,
  } = useShoppingCart()

  const handleCheckout: React.FormEventHandler<HTMLFormElement> = async (
    event
  ) => {
    event.preventDefault()
    setLoading(true)

    const { id: sessionId } = await fetchPostJSON(
      '/api/checkout_sessions/cart',
      cartDetails
    )

    redirectToCheckout({ sessionId })
  }

  return (
    <form onSubmit={handleCheckout}>
      <h2>Cart summary</h2>
      {/* This is where we'll render our cart */}
      <p>
        <strong>Number of Items:</strong> {cartCount}
      </p>
      <p>
        <strong>Total:</strong> {formattedTotalPrice}
      </p>

      {/* Redirects the user to Stripe */}
      <button
        className="cart-style-background"
        type="submit"
        disabled={!cartCount || loading}
      >
        Checkout
      </button>
      <button
        className="cart-style-background"
        type="button"
        onClick={clearCart}
      >
        Clear Cart
      </button>
    </form>
  )
}

export default CartSummary
