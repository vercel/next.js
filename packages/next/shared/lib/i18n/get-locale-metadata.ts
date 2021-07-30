import accept from '@hapi/accept'
import { denormalizePagePath } from '../../../server/denormalize-page-path'
import { detectDomainLocale } from './detect-domain-locale'
import { formatUrl } from '../router/utils/format-url'
import { normalizeLocalePath } from './normalize-locale-path'
import type { I18NConfig, DomainLocale } from '../../../server/config-shared'

interface Params {
  cookies(): { [key: string]: string }
  headers?: { [key: string]: string | string[] | undefined }
  nextConfig: { basePath?: string; i18n: I18NConfig; trailingSlash?: boolean }
  url: { hostname?: string | null; pathname: string }
}

export function getLocaleMetadata(params: Params) {
  const { i18n } = params.nextConfig
  const { cookies, headers, nextConfig, url } = params
  const path = normalizeLocalePath(url.pathname, i18n.locales)
  const domain = detectDomainLocale(i18n.domains, getHostname(url, headers))
  const defaultLocale = domain?.defaultLocale || i18n.defaultLocale
  const preferredLocale = getAcceptPreferredLocale(i18n, headers)
  return {
    path,
    domain,
    defaultLocale,
    locale: path?.detectedLocale || defaultLocale,
    redirect: getRedirect({
      locale: {
        preferred: preferredLocale,
        default: defaultLocale,
        detected:
          path?.detectedLocale ||
          domain?.defaultLocale ||
          getLocaleFromCookie(i18n, cookies) ||
          preferredLocale ||
          i18n.defaultLocale,
      },
      domain,
      nextConfig,
      url,
    }),
    trailingSlash:
      url.pathname !== '/'
        ? url.pathname.endsWith('/')
        : nextConfig.trailingSlash,
  }
}

function getLocaleFromCookie(
  i18n: I18NConfig,
  cookies: () => { [key: string]: string }
) {
  const nextLocale = cookies()?.NEXT_LOCALE?.toLowerCase()
  return nextLocale
    ? i18n.locales.find((locale) => nextLocale === locale.toLowerCase())
    : undefined
}

function getAcceptPreferredLocale(
  i18n: I18NConfig,
  headers?: { [key: string]: string | string[] | undefined }
) {
  const value = headers?.['accept-language']
  if (i18n.localeDetection !== false && value && !Array.isArray(value)) {
    try {
      return accept.language(value, i18n.locales)
    } catch (err) {}
  }
}

function getHostname(
  parsed: { hostname?: string | null },
  headers?: { [key: string]: string | string[] | undefined }
) {
  return ((!Array.isArray(headers?.host) && headers?.host) || parsed.hostname)
    ?.split(':')[0]
    .toLowerCase()
}

function getRedirect({
  domain,
  locale,
  nextConfig,
  url,
}: {
  domain?: DomainLocale
  locale: { default: string; detected: string; preferred?: string }
  nextConfig: { basePath?: string; i18n: I18NConfig; trailingSlash?: boolean }
  url: { hostname?: string | null; pathname: string }
}) {
  const isRootPath = denormalizePagePath(url.pathname) === '/'
  if (nextConfig.i18n.localeDetection !== false && isRootPath) {
    const preferredDomain = detectDomainLocale(
      nextConfig.i18n.domains,
      undefined,
      locale.preferred
    )

    if (domain && preferredDomain) {
      const isPDomain = preferredDomain.domain === domain.domain
      const isPLocale = preferredDomain.defaultLocale === locale.preferred
      if (!isPDomain || !isPLocale) {
        const scheme = `http${preferredDomain.http ? '' : 's'}`
        const rlocale = isPLocale ? '' : locale.preferred
        return `${scheme}://${preferredDomain.domain}/${rlocale}`
      }
    }

    if (locale.detected.toLowerCase() !== locale.default.toLowerCase()) {
      return formatUrl({
        ...url,
        pathname: `${nextConfig.basePath || ''}/${locale.detected}`,
      })
    }
  }
}
