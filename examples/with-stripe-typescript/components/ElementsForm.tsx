import React, { useState, FC } from 'react'

import CustomDonationInput from '../components/CustomDonationInput'
import StripeTestCards from '../components/StripeTestCards'
import PrintObject from '../components/PrintObject'

import { fetchPostJSON } from '../utils/api-helpers'
import {
  formatAmountForDisplay,
  formatAmountFromStripe,
} from '../utils/stripe-helpers'
import * as config from '../config'

import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js'
import { PaymentIntent } from '@stripe/stripe-js'

const ElementsForm: FC<{
  paymentIntent?: PaymentIntent | null
}> = ({ paymentIntent = null }) => {
  const defaultAmout = paymentIntent
    ? formatAmountFromStripe(paymentIntent.amount, paymentIntent.currency)
    : Math.round(config.MAX_AMOUNT / config.AMOUNT_STEP)
  const [input, setInput] = useState({
    customDonation: defaultAmout,
    cardholderName: '',
  })
  const [paymentType, setPaymentType] = useState('')
  const [payment, setPayment] = useState({ status: 'initial' })
  const [errorMessage, setErrorMessage] = useState('')
  const stripe = useStripe()
  const elements = useElements()

  const PaymentStatus = ({ status }: { status: string }) => {
    switch (status) {
      case 'processing':
      case 'requires_payment_method':
      case 'requires_confirmation':
        return <h2>Processing...</h2>

      case 'requires_action':
        return <h2>Authenticating...</h2>

      case 'succeeded':
        return <h2>Payment Succeeded 🥳</h2>

      case 'error':
        return (
          <>
            <h2>Error 😭</h2>
            <p className="error-message">{errorMessage}</p>
          </>
        )

      default:
        return null
    }
  }

  const handleInputChange: React.ChangeEventHandler<HTMLInputElement> = (e) =>
    setInput({
      ...input,
      [e.currentTarget.name]: e.currentTarget.value,
    })

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault()
    // Abort if form isn't valid
    if (!e.currentTarget.reportValidity()) return
    if (!elements) return
    setPayment({ status: 'processing' })

    // Create a PaymentIntent with the specified amount.
    const response = await fetchPostJSON('/api/payment_intents', {
      amount: input.customDonation,
      payment_intent_id: paymentIntent?.id,
    })
    setPayment(response)

    if (response.statusCode === 500) {
      setPayment({ status: 'error' })
      setErrorMessage(response.message)
      return
    }

    // Use your card Element with other Stripe.js APIs
    const { error } = await stripe!.confirmPayment({
      elements,
      confirmParams: {
        return_url: 'http://localhost:3000/donate-with-elements',
        payment_method_data: {
          billing_details: {
            name: input.cardholderName,
          },
        },
      },
    })

    if (error) {
      setPayment({ status: 'error' })
      setErrorMessage(error.message ?? 'An unknown error occurred')
    } else if (paymentIntent) {
      setPayment(paymentIntent)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit}>
        <CustomDonationInput
          className="elements-style"
          name="customDonation"
          value={input.customDonation}
          min={config.MIN_AMOUNT}
          max={config.MAX_AMOUNT}
          step={config.AMOUNT_STEP}
          currency={config.CURRENCY}
          onChange={handleInputChange}
        />
        <StripeTestCards />
        <fieldset className="elements-style">
          <legend>Your payment details:</legend>
          {paymentType === 'card' ? (
            <input
              placeholder="Cardholder name"
              className="elements-style"
              type="Text"
              name="cardholderName"
              onChange={handleInputChange}
              required
            />
          ) : null}
          <div className="FormRow elements-style">
            <PaymentElement
              onChange={(e) => {
                setPaymentType(e.value.type)
              }}
            />
          </div>
        </fieldset>
        <button
          className="elements-style-background"
          type="submit"
          disabled={
            !['initial', 'succeeded', 'error'].includes(payment.status) ||
            !stripe
          }
        >
          Donate {formatAmountForDisplay(input.customDonation, config.CURRENCY)}
        </button>
      </form>
      <PaymentStatus status={payment.status} />
      <PrintObject content={payment} />
    </>
  )
}

export default ElementsForm
