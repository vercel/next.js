export const LEGAL = {
  'privacy-policy': 'privacyPolicy',
  'refund-policy': 'refundPolicy',
  'terms-of-service': 'termsOfService',
  // This one is currently not returned by the Storefront API
  'shipping-policy': 'shippingPolicy',
}

// Returns the legal pages that are available in the shop
export function getLegalPages(shop) {
  return Object.values(LEGAL).flatMap((name) =>
    shop[name] ? [shop[name]] : []
  )
}
