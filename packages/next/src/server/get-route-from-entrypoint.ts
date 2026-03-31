import getAppRouteFromEntrypoint from './get-app-route-from-entrypoint'
import matchBundle from './match-bundle'

// matches pages/:page*.js
const SERVER_ROUTE_NAME_REGEX = /^pages[/\\](.*)$/

// matches static/pages/:page*.js
const BROWSER_ROUTE_NAME_REGEX = /^static[/\\]pages[/\\](.*)$/

export default function getRouteFromEntrypoint(
  entryFile: string,
  app?: boolean
): string | null {
  let pagePath = matchBundle(SERVER_ROUTE_NAME_REGEX, entryFile)

  if (pagePath) {
    return pagePath
  }

  if (app) {
    pagePath = getAppRouteFromEntrypoint(entryFile)
    if (pagePath) return pagePath
  }

  // Potentially the passed item is a browser bundle so we try to match that also
  return matchBundle(BROWSER_ROUTE_NAME_REGEX, entryFile)
}
