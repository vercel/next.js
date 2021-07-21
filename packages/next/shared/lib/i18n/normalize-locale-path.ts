export interface PathLocale {
  detectedLocale?: string
  pathname: string
}

export function normalizeLocalePath(
  pathname: string,
  locales?: string[]
): PathLocale {
  let detectedLocale: string | undefined
  // first item will be empty string from splitting at first char
  const pathnameParts = pathname.split('/')

  ;(locales || []).some((locale) => {
    if (pathnameParts[1].toLowerCase() === locale.toLowerCase()) {
      detectedLocale = locale
      pathnameParts.splice(1, 1)
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
