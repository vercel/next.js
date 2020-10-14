import { IncomingMessage } from 'http'

export function detectDomainLocale(
  domainItems:
    | Array<{
        http?: boolean
        domain: string
        defaultLocale: string
      }>
    | undefined,
  req?: IncomingMessage,
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
    const { host } = req?.headers || {}
    // remove port from host and remove port if present
    const hostname = host?.split(':')[0].toLowerCase()

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
