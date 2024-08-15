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
  const isDataRoute = pathname.startsWith('/_next/data')

  // Create a pathname for locale detection, removing /_next/data/[buildId] if present
  // This is because locale detection relies on path splitting and so the first part
  // should be the locale.
  const pathNameNoDataPrefix = isDataRoute
    ? pathname.replace(/^\/_next\/data\/[^/]+/, '')
    : pathname

  // Split the path for locale detection
  const pathnameParts = pathNameNoDataPrefix.split('/')

  ;(locales || []).some((locale) => {
    if (
      pathnameParts[1] &&
      pathnameParts[1].toLowerCase() === locale.toLowerCase()
    ) {
      detectedLocale = locale
      pathnameParts.splice(1, 1)
      return true
    }
    return false
  })

  // For non-data routes, we return the path with the locale stripped out.
  // For data routes, we keep the path as is, since we only want to extract the locale.
  if (detectedLocale && !isDataRoute) {
    pathname = pathnameParts.join('/') || '/'
  }

  return {
    pathname,
    detectedLocale,
  }
}
