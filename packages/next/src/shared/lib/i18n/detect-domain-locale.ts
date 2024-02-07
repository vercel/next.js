import type { DomainLocale } from '../../../server/config-shared'

export function detectDomainLocale(
  domainItems?: DomainLocale[],
  hostname?: string,
  detectedLocale?: string
) {
  if (!domainItems) return

  if (detectedLocale) {
    detectedLocale = detectedLocale.toLowerCase()
  }

  for (const item of domainItems) {
    // remove port if present
    const domainHostname = item.domain?.split(':', 1)[0].toLowerCase()
    if (
      hostname === domainHostname ||
      detectedLocale === item.defaultLocale.toLowerCase() ||
      item.locales?.some((locale) => locale.toLowerCase() === detectedLocale)
    ) {
      return item
    }
  }
}
