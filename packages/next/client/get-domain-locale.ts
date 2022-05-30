import type { DomainLocale } from '../server/config'
import { normalizeLocalePath } from './normalize-locale-path'
import { detectDomainLocale } from './detect-domain-locale'

const basePath = (process.env.__NEXT_ROUTER_BASEPATH as string) || ''

export function getDomainLocale(
  path: string,
  locale?: string | false,
  locales?: string[],
  domainLocales?: DomainLocale[]
) {
  if (process.env.__NEXT_I18N_SUPPORT) {
    const target = locale || normalizeLocalePath(path, locales).detectedLocale
    const domain = detectDomainLocale(domainLocales, undefined, target)
    if (domain) {
      const proto = `http${domain.http ? '' : 's'}://`
      const finalLocale = target === domain.defaultLocale ? '' : `/${target}`
      return `${proto}${domain.domain}${basePath}${finalLocale}${path}`
    }
    return false
  } else {
    return false
  }
}
