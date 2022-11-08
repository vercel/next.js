export interface PathLocale {
  detectedLocale?: string
  pathname: string
}

/**
 * For a pathname that may include a locale from a list of locales, it
 * removes the locale from the pathname returning it alongside with the
 * detected locale.
 *
 * @param pathname A pathname that may include a locale.
 * @param locales A list of locales.
 * @returns The detected locale and pathname without locale
 */
export function normalizeLocalePath(
  pathname: string,
  locales?: string[]
): PathLocale {
  let detectedLocale: string | undefined
  // first item will be empty string from splitting at first char
  const pathnameParts = pathname.split('/')

  ;(locales || []).some((locale) => {
    if (
      pathnameParts[1] &&
      pathnameParts[1].toLowerCase() === locale.toLowerCase()
    ) {
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
