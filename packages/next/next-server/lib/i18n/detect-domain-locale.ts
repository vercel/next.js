export function detectDomainLocale(
  domainItems:
    | Array<{
        http?: boolean
        domain: string
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
        defaultLocale: string
      }
    | undefined

  if (domainItems) {
    for (const item of domainItems) {
      // remove port if present
      const domainHostname = item.domain?.split(':')[0].toLowerCase()
      if (
        hostname === domainHostname ||
        detectedLocale?.toLowerCase() === item.defaultLocale.toLowerCase()
      ) {
        domainItem = item
        break
      }
    }
  }

  return domainItem
}
