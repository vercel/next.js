import type { DomainLocale } from '../../../server/config-shared'

/** What the loop below compares of a domain item. */
type DomainMatchKeys = {
  hostname: string | undefined
  defaultLocale: string
  locales: string[] | undefined
}

/**
 * The match keys of the items of a list of domains, by position. The list
 * comes from the configuration, so the keys of an item are derived once and
 * not for every item on every call, of which a request makes several.
 *
 * Only the server keeps them. This module is also bundled for the browser
 * when an app has i18n domains, and there a navigation makes one call: the
 * branch below is removed from that bundle at build time, which leaves it
 * unchanged.
 */
let domainMatchKeys:
  | WeakMap<readonly DomainLocale[], (DomainMatchKeys | undefined)[]>
  | undefined

export function detectDomainLocale(
  domainItems?: readonly DomainLocale[],
  hostname?: string,
  detectedLocale?: string
) {
  if (!domainItems) return

  if (detectedLocale) {
    detectedLocale = detectedLocale.toLowerCase()
  }

  if (typeof window === 'undefined') {
    domainMatchKeys ??= new WeakMap()
    let allKeys = domainMatchKeys.get(domainItems)
    if (allKeys === undefined) {
      allKeys = []
      domainMatchKeys.set(domainItems, allKeys)
    }

    for (let i = 0; i < domainItems.length; i++) {
      const item = domainItems[i]
      let keys = allKeys[i]
      if (keys === undefined) {
        keys = allKeys[i] = {
          // remove port if present
          hostname: item.domain?.split(':', 1)[0].toLowerCase(),
          defaultLocale: item.defaultLocale.toLowerCase(),
          locales: item.locales?.map((locale) => locale.toLowerCase()),
        }
      }
      if (
        hostname === keys.hostname ||
        detectedLocale === keys.defaultLocale ||
        keys.locales?.includes(detectedLocale!)
      ) {
        return item
      }
    }
    return
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
