'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Stripe from 'stripe'

import { CURRENCY } from '../../config'
import { formatAmountForStripe } from '../../utils/stripe-helpers'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // https://github.com/stripe/stripe-node#configuration
  apiVersion: '2022-11-15'
})

export async function createCheckoutSession(data: FormData): Promise<void> {
  const checkoutSession: Stripe.Checkout.Session =
    await stripe.checkout.sessions.create({
      mode: 'payment',
      submit_type: 'donate',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            product_data: {
              name: 'Custom amount donation'
            },
            unit_amount: formatAmountForStripe(
              Number(data.get('customDonation') as string),
              CURRENCY
            )
          }
        }
      ],
      success_url: `${headers().get(
        'origin'
      )}/result?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${headers().get('origin')}/donate-with-checkout`
    })

  redirect(checkoutSession.url as string)
}
