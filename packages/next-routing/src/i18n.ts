/**
 * i18n utilities for locale detection and handling
 */

export interface I18nDomain {
  defaultLocale: string
  domain: string
  http?: true
  locales?: string[]
}

export interface I18nConfig {
  defaultLocale: string
  domains?: I18nDomain[]
  localeDetection?: false
  locales: string[]
}

/**
 * Detects the domain locale based on hostname or detected locale
 */
export function detectDomainLocale(
  domains: I18nDomain[] | undefined,
  hostname: string | undefined,
  detectedLocale?: string
): I18nDomain | undefined {
  if (!domains) return undefined

  const normalizedHostname = hostname?.toLowerCase()
  const normalizedLocale = detectedLocale?.toLowerCase()

  for (const domain of domains) {
    // Remove port if present
    const domainHostname = domain.domain.split(':', 1)[0].toLowerCase()

    if (
      normalizedHostname === domainHostname ||
      normalizedLocale === domain.defaultLocale.toLowerCase() ||
      domain.locales?.some(
        (locale) => locale.toLowerCase() === normalizedLocale
      )
    ) {
      return domain
    }
  }

  return undefined
}

/**
 * Normalizes a pathname by removing the locale prefix if present
 */
export function normalizeLocalePath(
  pathname: string,
  locales: string[]
): {
  pathname: string
  detectedLocale?: string
} {
  if (!locales || locales.length === 0) {
    return { pathname }
  }

  // The first segment will be empty, because it has a leading `/`
  const segments = pathname.split('/', 2)

  // If there's no second segment, there's no locale
  if (!segments[1]) {
    return { pathname }
  }

  // The second segment will contain the locale part if any
  const segment = segments[1].toLowerCase()

  // Create lowercase lookup for performance
  const lowercaseLocales = locales.map((locale) => locale.toLowerCase())
  const index = lowercaseLocales.indexOf(segment)

  if (index < 0) {
    return { pathname }
  }

  // Return the case-sensitive locale
  const detectedLocale = locales[index]

  // Remove the `/${locale}` part of the pathname
  const newPathname = pathname.slice(detectedLocale.length + 1) || '/'

  return { pathname: newPathname, detectedLocale }
}

/**
 * Parses the Accept-Language header and returns the best matching locale
 */
export function getAcceptLanguageLocale(
  acceptLanguageHeader: string,
  locales: string[]
): string | undefined {
  if (!acceptLanguageHeader || !locales.length) {
    return undefined
  }

  try {
    // Parse accept-language header
    const languages = acceptLanguageHeader
      .split(',')
      .map((lang) => {
        const parts = lang.trim().split(';')
        const locale = parts[0]
        let quality = 1

        if (parts[1]) {
          const qMatch = parts[1].match(/q=([0-9.]+)/)
          if (qMatch && qMatch[1]) {
            quality = parseFloat(qMatch[1])
          }
        }

        return { locale, quality }
      })
      .filter((lang) => lang.quality > 0)
      .sort((a, b) => b.quality - a.quality)

    // Create lowercase lookup for locales
    const localeLookup = new Map<string, string>()
    for (const locale of locales) {
      localeLookup.set(locale.toLowerCase(), locale)
    }

    // Try to find exact match first
    for (const { locale } of languages) {
      const normalized = locale.toLowerCase()
      if (localeLookup.has(normalized)) {
        return localeLookup.get(normalized)
      }
    }

    // Try prefix matching (e.g., "en-US" matches "en")
    for (const { locale } of languages) {
      const prefix = locale.toLowerCase().split('-')[0]
      if (localeLookup.has(prefix)) {
        return localeLookup.get(prefix)
      }

      // Also check if any configured locale starts with this prefix
      for (const [key, value] of localeLookup) {
        if (key.startsWith(prefix + '-')) {
          return value
        }
      }
    }

    return undefined
  } catch (err) {
    return undefined
  }
}

/**
 * Gets the locale from the NEXT_LOCALE cookie
 */
export function getCookieLocale(
  cookieHeader: string | undefined,
  locales: string[]
): string | undefined {
  if (!cookieHeader || !locales.length) {
    return undefined
  }

  try {
    const cookies = cookieHeader.split(';').reduce(
      (acc, cookie) => {
        const [key, ...valueParts] = cookie.trim().split('=')
        if (key && valueParts.length > 0) {
          acc[key] = decodeURIComponent(valueParts.join('='))
        }
        return acc
      },
      {} as Record<string, string>
    )

    const nextLocale = cookies.NEXT_LOCALE?.toLowerCase()
    if (!nextLocale) {
      return undefined
    }

    return locales.find((locale) => locale.toLowerCase() === nextLocale)
  } catch (err) {
    return undefined
  }
}

/**
 * Detects the appropriate locale based on path, domain, cookie, and accept-language
 */
export function detectLocale(params: {
  pathname: string
  hostname: string | undefined
  cookieHeader: string | undefined
  acceptLanguageHeader: string | undefined
  i18n: I18nConfig
}): {
  locale: string
  pathnameWithoutLocale: string
  localeInPath: boolean
} {
  const { pathname, hostname, cookieHeader, acceptLanguageHeader, i18n } =
    params

  // 1. Check if locale is in the pathname
  const pathLocaleResult = normalizeLocalePath(pathname, i18n.locales)
  if (pathLocaleResult.detectedLocale) {
    return {
      locale: pathLocaleResult.detectedLocale,
      pathnameWithoutLocale: pathLocaleResult.pathname,
      localeInPath: true,
    }
  }

  // If locale detection is disabled, use domain locale or default locale
  if (i18n.localeDetection === false) {
    const domainLocale = detectDomainLocale(i18n.domains, hostname)
    return {
      locale: domainLocale?.defaultLocale || i18n.defaultLocale,
      pathnameWithoutLocale: pathname,
      localeInPath: false,
    }
  }

  // 2. Check cookie (priority over domain when locale detection is enabled)
  const cookieLocale = getCookieLocale(cookieHeader, i18n.locales)
  if (cookieLocale) {
    return {
      locale: cookieLocale,
      pathnameWithoutLocale: pathname,
      localeInPath: false,
    }
  }

  // 3. Check accept-language header (priority over domain when locale detection is enabled)
  const acceptLocale = getAcceptLanguageLocale(
    acceptLanguageHeader || '',
    i18n.locales
  )
  if (acceptLocale) {
    return {
      locale: acceptLocale,
      pathnameWithoutLocale: pathname,
      localeInPath: false,
    }
  }

  // 4. Check domain locale
  const domainLocale = detectDomainLocale(i18n.domains, hostname)
  if (domainLocale) {
    return {
      locale: domainLocale.defaultLocale,
      pathnameWithoutLocale: pathname,
      localeInPath: false,
    }
  }

  // 5. Fallback to default locale
  return {
    locale: i18n.defaultLocale,
    pathnameWithoutLocale: pathname,
    localeInPath: false,
  }
}
