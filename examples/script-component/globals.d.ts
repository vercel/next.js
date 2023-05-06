declare global {
  interface Window {
    Stripe: (apiKey: string) => stripe.Stripe
  }
}

// Flag as module for TypeScript
export {}
