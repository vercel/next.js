import { NextApiRequest, NextApiResponse } from 'next'

import Stripe from 'stripe'
const stripeSecretKey: string = process.env.STRIPE_SECRET_KEY!
const stripe = new Stripe(stripeSecretKey, {
  // https://github.com/stripe/stripe-node#configuration
  apiVersion: '2019-12-03',
  typescript: true,
  telemetry: true,
})

export default async (req: NextApiRequest, res: NextApiResponse) => {
  const id: string = req.query.id as string
  try {
    if (!id.startsWith('cs_')) {
      throw Error('Incorrect CheckoutSession ID.')
    }
    const checkout_session: Stripe.Checkout.Session = await stripe.checkout.sessions.retrieve(
      id,
      { expand: ['payment_intent'] }
    )

    res.status(200).json(checkout_session)
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message })
  }
}
