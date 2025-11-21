export interface PathLocale {
  detectedLocale?: string
  pathname: string
}

/**
 * A cache of lowercased locales for each list of locales. This is stored as a
 * WeakMap so if the locales are garbage collected, the cache entry will be
 * removed as well.
 */
const cache = new WeakMap<readonly string[], readonly string[]>()

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
  locales?: readonly string[]
): PathLocale {
  // If locales is undefined, return the pathname as is.
  if (!locales) return { pathname }

  // Get the cached lowercased locales or create a new cache entry.
  let lowercasedLocales = cache.get(locales)
  if (!lowercasedLocales) {
    lowercasedLocales = locales.map((locale) => locale.toLowerCase())
    cache.set(locales, lowercasedLocales)
  }

  let detectedLocale: string | undefined

  // The first segment will be empty, because it has a leading `/`. If
  // there is no further segment, there is no locale (or it's the default).
  const segments = pathname.split('/', 2)

  // If there's no second segment (ie, the pathname is just `/`), there's no
  // locale.
  if (!segments[1]) return { pathname }

  // The second segment will contain the locale part if any.
  const segment = segments[1].toLowerCase()

  // See if the segment matches one of the locales. If it doesn't, there is
  // no locale (or it's the default).
  const index = lowercasedLocales.indexOf(segment)
  if (index < 0) return { pathname }

  // Return the case-sensitive locale.
  detectedLocale = locales[index]

  // Remove the `/${locale}` part of the pathname.
  pathname = pathname.slice(detectedLocale.length + 1) || '/'

  return { pathname, detectedLocale }
}
