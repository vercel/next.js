import matchBundle from './match-bundle'

// matches app/:path*.js
const APP_ROUTE_NAME_REGEX = /^app[/\\](.*)$/

export default function getAppRouteFromEntrypoint(entryFile: string) {
  const pagePath = matchBundle(APP_ROUTE_NAME_REGEX, entryFile)
  if (typeof pagePath === 'string' && !pagePath) {
    return '/'
  }

  if (!pagePath) {
    return null
  }

  return pagePath
}
