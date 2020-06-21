import { denormalizePagePath } from './normalize-page-path'

// matches static/<buildid>/pages/:page*.js
const ROUTE_NAME_REGEX = /^static[/\\][^/\\]+[/\\]pages[/\\](.*)$/
// matches pages/:page*.js
const SERVERLESS_ROUTE_NAME_REGEX = /^pages[/\\](.*)$/
// matches static/pages/:page*.js
const BROWSER_ROUTE_NAME_REGEX = /^static[/\\]pages[/\\](.*)$/

function matchBundle(regex: RegExp, input: string): string | null {
  const result = regex.exec(input)

  if (!result) {
    return null
  }

  return denormalizePagePath(`/${result[1]}`)
}

export default function getRouteFromEntrypoint(
  entryFile: string,
  isServerlessLike: boolean = false
): string | null {
  let pagePath = matchBundle(
    isServerlessLike ? SERVERLESS_ROUTE_NAME_REGEX : ROUTE_NAME_REGEX,
    entryFile
  )

  if (pagePath) {
    return pagePath
  }

  // Potentially the passed item is a browser bundle so we try to match that also
  return matchBundle(BROWSER_ROUTE_NAME_REGEX, entryFile)
}
