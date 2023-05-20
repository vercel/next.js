import { NextPage } from 'next'
import { useState, useEffect } from 'react'
import { Elements } from '@stripe/react-stripe-js'
import { PaymentIntent } from '@stripe/stripe-js'
import getStripe from '../utils/get-stripejs'
import { fetchPostJSON } from '../utils/api-helpers'
import Layout from '../components/Layout'
import * as config from '../config'
import ElementsForm from '../components/ElementsForm'

const DonatePage: NextPage = () => {
  const [paymentIntent, setPaymentIntent] = useState<PaymentIntent | null>(null)
  useEffect(() => {
    fetchPostJSON('/api/payment_intents', {
      amount: Math.round(config.MAX_AMOUNT / config.AMOUNT_STEP),
    }).then((data) => {
      setPaymentIntent(data)
    })
  }, [setPaymentIntent])
  return (
    <Layout title="Donate with Elements | Next.js + TypeScript Example">
      <div className="page-container">
        <h1>Donate with Elements</h1>
        <p>Donate to our project 💖</p>
        {paymentIntent && paymentIntent.client_secret ? (
          <Elements
            stripe={getStripe()}
            options={{
              appearance: {
                variables: {
                  colorIcon: '#6772e5',
                  fontFamily: 'Roboto, Open Sans, Segoe UI, sans-serif',
                },
              },
              clientSecret: paymentIntent.client_secret,
            }}
          >
            <ElementsForm paymentIntent={paymentIntent} />
          </Elements>
        ) : (
          <p>Loading...</p>
        )}
      </div>
    </Layout>
  )
}

export default DonatePage
