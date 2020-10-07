export function normalizeLocalePath(
  pathname: string,
  locales?: string[]
): {
  detectedLocale?: string
  pathname: string
} {
  let detectedLocale: string | undefined
  ;(locales || []).some((locale) => {
    if (pathname.startsWith(`/${locale}`)) {
      detectedLocale = locale
      pathname = pathname.replace(new RegExp(`^/${locale}`), '') || '/'
      return true
    }
    return false
  })

  return {
    pathname,
    detectedLocale,
  }
}
