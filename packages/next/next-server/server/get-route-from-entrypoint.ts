import { normalizePathSep } from './normalize-page-path'

// matches static/<buildid>/pages/:page*.js
const ROUTE_NAME_REGEX = /^static\/[^/]+\/pages\/(.*)\.js$/
// matches pages/:page*.js
const SERVERLESS_ROUTE_NAME_REGEX = /^pages\/(.*)\.js$/

export default function getRouteFromEntrypoint(
  entryFile: string,
  isServerlessLike: boolean = false
): string | null {
  const result = (isServerlessLike
    ? SERVERLESS_ROUTE_NAME_REGEX
    : ROUTE_NAME_REGEX
  ).exec(normalizePathSep(entryFile))

  if (!result) {
    return null
  }

  let pagePath = `/${result[1]}`

  if (!pagePath) {
    return null
  }

  if (pagePath.startsWith('/index/')) {
    pagePath = pagePath.slice(6)
  } else if (pagePath === '/index') {
    pagePath = '/'
  }

  return pagePath
}
