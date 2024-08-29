export function isChrome() {
  if (typeof window === 'undefined') return false
  const isChromium = 'chrome' in window && window.chrome
  const vendorName = window.navigator.vendor

  return (
    isChromium !== null &&
    isChromium !== undefined &&
    vendorName === 'Google Inc.'
  )
}
