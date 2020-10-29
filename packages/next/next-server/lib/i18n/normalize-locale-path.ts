export function normalizeLocalePath(
  pathname: string,
  locales?: string[]
): {
  detectedLocale?: string
  pathname: string
} {
  let detectedLocale: string | undefined
  // first item will be empty string from splitting at first char
  const pathnameParts = pathname.split('/')

  ;(locales || []).some((locale) => {
    const partIndex = pathnameParts.findIndex(
      (part) => part.toLowerCase() === locale.toLowerCase()
    )
    if (partIndex !== -1) {
      detectedLocale = locale
      pathnameParts.splice(partIndex, 1)
      pathname = pathnameParts.join('/') || '/'
      return true
    }
    return false
  })

  return {
    pathname,
    detectedLocale,
  }
}
