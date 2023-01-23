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
  if (!locales) return { pathname }

  // The first segment will be empty, because it has a leading `/`. If
  // there is no further segment, there is no locale.
  const segments = pathname.split('/')
  if (!segments[1]) return { pathname }

  // The second segment will contain the locale part if any.
  const segment = segments[1].toLowerCase()

  const detectedLocale = locales.find(
    (locale) => locale.toLowerCase() === segment
  )
  if (!detectedLocale) return { pathname }

  // Remove the `/${detectedLocale}` part of the pathname.
  pathname = pathname.slice(detectedLocale.length + 1) || '/'

  return { pathname, detectedLocale }
}
