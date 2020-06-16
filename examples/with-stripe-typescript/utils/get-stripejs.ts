/**
 * This is a singleton to ensure we only instantiate Stripe once.
 */
import { loadStripe } from '@stripe/stripe-js'

let stripePromise: Promise<import('@stripe/stripe-js').Stripe | null>
const getStripe = () => {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
  }
  return stripePromise
}

export default getStripe
