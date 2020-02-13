import { buffer } from 'micro'
import Cors from 'micro-cors'
import { NextApiRequest, NextApiResponse } from 'next'

import Stripe from 'stripe'
const stripeSecretKey: string = process.env.STRIPE_SECRET_KEY!
const stripe = new Stripe(stripeSecretKey, {
  // https://github.com/stripe/stripe-node#configuration
  apiVersion: '2019-12-03',
  typescript: true,
  telemetry: true,
})

const webhookSecret: string = process.env.STRIPE_WEBHOOK_SECRET!

// Stripe requires the raw body to construct the event.
export const config = {
  api: {
    bodyParser: false,
  },
}

const cors = Cors({
  allowMethods: ['POST', 'HEAD'],
})

const webhookHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'POST') {
    const buf = await buffer(req)
    const sig = req.headers['stripe-signature']!

    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(buf.toString(), sig, webhookSecret)
    } catch (err) {
      // On error, log and return the error message.
      console.log(`❌ Error message: ${err.message}`)
      res.status(400).send(`Webhook Error: ${err.message}`)
      return
    }

    // Successfully constructed event.
    console.log('✅ Success:', event.id)

    // Cast event data to Stripe object.
    if (event.type === 'payment_intent.succeeded') {
      const stripeObject: Stripe.PaymentIntent = event.data
        .object as Stripe.PaymentIntent
      console.log(`💰 PaymentIntent status: ${stripeObject.status}`)
    } else if (event.type === 'charge.succeeded') {
      const stripeObject = event.data.object as Stripe.Charge
      console.log(`💵 Charge id: ${stripeObject.id}`)
    } else if (event.type === 'payment_intent.payment_failed') {
      const stripeObject: Stripe.PaymentIntent = event.data
        .object as Stripe.PaymentIntent
      console.log(
        `❌ Payment failed: ${stripeObject.last_payment_error?.message}`
      )
    } else {
      console.warn(`🤷‍♀️ Unhandled event type: ${event.type}`)
    }

    // Return a response to acknowledge receipt of the event.
    res.json({ received: true })
  } else {
    res.setHeader('Allow', 'POST')
    res.status(405).end('Method Not Allowed')
  }
}

export default cors(webhookHandler as any)
