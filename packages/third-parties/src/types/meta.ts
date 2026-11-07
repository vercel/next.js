export type MetaPixelStandardEvent =
  | 'PageView'
  | 'ViewContent'
  | 'Search'
  | 'AddToCart'
  | 'AddToWishlist'
  | 'InitiateCheckout'
  | 'AddPaymentInfo'
  | 'Purchase'
  | 'Lead'
  | 'CompleteRegistration'
  | 'Contact'
  | 'CustomizeProduct'
  | 'Donate'
  | 'FindLocation'
  | 'Schedule'
  | 'StartTrial'
  | 'SubmitApplication'
  | 'Subscribe'

export type MetaPixelProps = {
  /**
   * The Meta (Facebook) Pixel ID.
   */
  pixelId: string

  /**
   * The event to track on page load. Default is 'PageView'.
   * Only accepts standard events defined by Meta.
   * @default 'PageView'
   * @see https://developers.facebook.com/docs/meta-pixel/reference#standard-events
   */
  trackEvent?: MetaPixelStandardEvent
}
