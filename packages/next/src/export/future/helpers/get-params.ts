import { getRouteMatcher } from '../../../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../../shared/lib/router/utils/route-regex'

export function getParams(
  page: string,
  pathname: string
): Record<string, string | string[] | undefined> {
  const matcher = getRouteMatcher(getRouteRegex(page))
  const params = matcher(pathname)
  if (!params) {
    throw new Error(
      `The provided export path '${pathname}' doesn't match the '${page}' page.\nRead more: https://nextjs.org/docs/messages/export-path-mismatch`
    )
  }

  return params
}
