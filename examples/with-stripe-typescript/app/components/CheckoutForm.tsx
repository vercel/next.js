'use client'

import React, { useState } from 'react'

import CustomDonationInput from '../../components/CustomDonationInput'
import StripeTestCards from '../../components/StripeTestCards'

import { formatAmountForDisplay } from '../../utils/stripe-helpers'
import * as config from '../../config'
import { createCheckoutSession } from '../actions/stripe'

const CheckoutForm = () => {
  const [loading, setLoading] = useState(false)
  const [input, setInput] = useState({
    customDonation: Math.round(config.MAX_AMOUNT / config.AMOUNT_STEP)
  })

  const handleInputChange: React.ChangeEventHandler<HTMLInputElement> = (e) =>
    setInput({
      ...input,
      [e.currentTarget.name]: e.currentTarget.value
    })

  return (
    <form action={createCheckoutSession}>
      <CustomDonationInput
        className="checkout-style"
        name="customDonation"
        min={config.MIN_AMOUNT}
        max={config.MAX_AMOUNT}
        step={config.AMOUNT_STEP}
        currency={config.CURRENCY}
        onChange={handleInputChange}
        value={input.customDonation}
      />
      <StripeTestCards />
      <button
        className="checkout-style-background"
        type="submit"
        disabled={loading}
      >
        Donate {formatAmountForDisplay(input.customDonation, config.CURRENCY)}
      </button>
    </form>
  )
}

export default CheckoutForm
