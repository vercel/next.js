export function detectDomainLocale(
  domainItems:
    | Array<{
        http?: boolean
        domain: string
        locales?: string[]
        defaultLocale: string
      }>
    | undefined,
  hostname?: string,
  detectedLocale?: string
) {
  let domainItem:
    | {
        http?: boolean
        domain: string
        locales?: string[]
        defaultLocale: string
      }
    | undefined

  if (domainItems) {
    if (detectedLocale) {
      detectedLocale = detectedLocale.toLowerCase()
    }

    for (const item of domainItems) {
      // remove port if present
      const domainHostname = item.domain?.split(':')[0].toLowerCase()
      if (
        hostname === domainHostname ||
        detectedLocale === item.defaultLocale.toLowerCase() ||
        item.locales?.some((locale) => locale.toLowerCase() === detectedLocale)
      ) {
        domainItem = item
        break
      }
    }
  }

  return domainItem
}
