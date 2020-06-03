import { ROUTE_NAME_REGEX, SERVERLESS_ROUTE_NAME_REGEX } from '../lib/constants'
import { denormalizePagePath } from './normalize-page-path'

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
