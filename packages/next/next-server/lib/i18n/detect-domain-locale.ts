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

    domainItem =
      // Check whether current hostname is defined in domains and return it
      domainItems.find(
        (item) => hostname === item.domain?.split(':')[0].toLowerCase()
      ) ??
      // Check for domain item that uses the detected locale
      domainItems.find(
        (item) =>
          detectedLocale === item.defaultLocale.toLowerCase() ||
          item.locales?.some(
            (locale) => locale.toLowerCase() === detectedLocale
          )
      )
  }

  return domainItem
}
