export function isChromeDesktop() {
  if (typeof window === 'undefined') return false
  const isChromium = 'chrome' in window && window.chrome
  const vendorName = window.navigator.vendor
  const isOpera = 'opr' in window && typeof window.opr !== 'undefined'
  const isIEedge = window.navigator.userAgent.indexOf('Edge') > -1
  const isIOSChrome = /CriOS/.test(window.navigator.userAgent)

  return (
    isChromium !== null &&
    isChromium !== undefined &&
    vendorName === 'Google Inc.' &&
    isOpera === false &&
    isIEedge === false &&
    isIOSChrome === false
  )
}
