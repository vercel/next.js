import { IncomingMessage } from 'http'

export function detectDomainLocales(
  req: IncomingMessage,
  domainItems:
    | Array<{
        domain: string
        locales: string[]
        defaultLocale: string
      }>
    | undefined,
  locales: string[],
  defaultLocale: string
) {
  let curDefaultLocale = defaultLocale
  let curLocales = locales

  const { host } = req.headers

  if (host && domainItems) {
    // remove port from host and remove port if present
    const hostname = host.split(':')[0].toLowerCase()

    for (const item of domainItems) {
      if (hostname === item.domain.toLowerCase()) {
        curDefaultLocale = item.defaultLocale
        curLocales = item.locales
        break
      }
    }
  }

  return {
    defaultLocale: curDefaultLocale,
    locales: curLocales,
  }
}
