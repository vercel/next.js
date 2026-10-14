import type { Page } from '../shared/lib/route-types'
import matchBundle from './match-bundle'

// matches app/:path*.js
const APP_ROUTE_NAME_REGEX = /^app[/\\](.*)$/

export default function getAppRouteFromEntrypoint(
  entryFile: string
): Page | null {
  const pagePath = matchBundle(APP_ROUTE_NAME_REGEX, entryFile)
  if (typeof pagePath === 'string' && !pagePath) {
    return '/' as Page
  }

  if (!pagePath) {
    return null
  }

  return pagePath
}
