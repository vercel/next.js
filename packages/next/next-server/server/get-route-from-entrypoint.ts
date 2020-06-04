import { denormalizePagePath } from './normalize-page-path'

// matches static/<buildid>/pages/:page*.js
const ROUTE_NAME_REGEX = /^static[/\\][^/\\]+[/\\]pages[/\\](.*)\.js$/
const SERVERLESS_ROUTE_NAME_REGEX = /^pages[/\\](.*)\.js$/

export default function getRouteFromEntrypoint(
  entryFile: string,
  isServerlessLike: boolean = false
): string | null {
  const result = (isServerlessLike
    ? SERVERLESS_ROUTE_NAME_REGEX
    : ROUTE_NAME_REGEX
  ).exec(entryFile)

  if (!result) {
    return null
  }

  const pagePath = result[1]

  if (!pagePath) {
    return null
  }

  return denormalizePagePath(`/${pagePath}`)
}
