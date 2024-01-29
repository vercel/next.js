import type { DomainLocale } from '../../../server/config'
import type { I18NConfig } from '../../../server/config-shared'
import { acceptLanguage } from '../../../server/accept-header'
import { denormalizePagePath } from '../page-path/denormalize-page-path'
import { detectDomainLocale } from './detect-domain-locale'
import { formatUrl } from '../router/utils/format-url'
import { getCookieParser } from '../../../server/api-utils/get-cookie-parser'

interface Options {
  defaultLocale: string
  domainLocale?: DomainLocale
  headers?: { [key: string]: string | string[] | undefined }
  nextConfig: {
    basePath?: string
    i18n?: I18NConfig | null
    trailingSlash?: boolean
  }
  pathLocale?: string
  urlParsed: { hostname?: string | null; pathname: string }
}

function getLocaleFromCookie(
  i18n: I18NConfig,
  headers: { [key: string]: string | string[] | undefined } = {}
) {
  const nextLocale = getCookieParser(
    headers || {}
  )()?.NEXT_LOCALE?.toLowerCase()
  return nextLocale
    ? i18n.locales.find((locale) => nextLocale === locale.toLowerCase())
    : undefined
}

function detectLocale({
  i18n,
  headers,
  domainLocale,
  preferredLocale,
  pathLocale,
}: {
  i18n: I18NConfig
  preferredLocale?: string
  headers?: { [key: string]: string | string[] | undefined }
  domainLocale?: DomainLocale
  pathLocale?: string
}) {
  return (
    pathLocale ||
    domainLocale?.defaultLocale ||
    getLocaleFromCookie(i18n, headers) ||
    preferredLocale ||
    i18n.defaultLocale
  )
}

function getAcceptPreferredLocale(
  i18n: I18NConfig,
  headers?: { [key: string]: string | string[] | undefined }
) {
  if (
    headers?.['accept-language'] &&
    !Array.isArray(headers['accept-language'])
  ) {
    try {
      return acceptLanguage(headers['accept-language'], i18n.locales)
    } catch (err) {}
  }
}

export function getLocaleRedirect({
  defaultLocale,
  domainLocale,
  pathLocale,
  headers,
  nextConfig,
  urlParsed,
}: Options) {
  if (
    nextConfig.i18n &&
    nextConfig.i18n.localeDetection !== false &&
    denormalizePagePath(urlParsed.pathname) === '/'
  ) {
    const preferredLocale = getAcceptPreferredLocale(nextConfig.i18n, headers)
    const detectedLocale = detectLocale({
      i18n: nextConfig.i18n,
      preferredLocale,
      headers,
      pathLocale,
      domainLocale,
    })

    const preferredDomain = detectDomainLocale(
      nextConfig.i18n.domains,
      undefined,
      preferredLocale
    )

    if (domainLocale && preferredDomain) {
      const isPDomain = preferredDomain.domain === domainLocale.domain
      const isPLocale = preferredDomain.defaultLocale === preferredLocale
      if (!isPDomain || !isPLocale) {
        const scheme = `http${preferredDomain.http ? '' : 's'}`
        const rlocale = isPLocale ? '' : preferredLocale
        return `${scheme}://${preferredDomain.domain}/${rlocale}`
      }
    }

    if (detectedLocale.toLowerCase() !== defaultLocale.toLowerCase()) {
      return formatUrl({
        ...urlParsed,
        pathname: `${nextConfig.basePath || ''}/${detectedLocale}${
          nextConfig.trailingSlash ? '/' : ''
        }`,
      })
    }
  }
}
