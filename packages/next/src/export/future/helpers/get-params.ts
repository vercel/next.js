import { getRouteMatcher } from '../../../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../../shared/lib/router/utils/route-regex'

export function getParams(
  pagePathname: string,
  requestPathname: string
): Record<string, string | string[] | undefined> {
  const matcher = getRouteMatcher(getRouteRegex(pagePathname))
  const params = matcher(requestPathname)
  if (!params) {
    throw new Error(
      `The provided export path '${requestPathname}' doesn't match the '${pagePathname}' page.\nRead more: https://nextjs.org/docs/messages/export-path-mismatch`
    )
  }

  return params
}
