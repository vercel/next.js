import type { Route } from '../../shared/lib/route-types'
import { getRouteMatcher } from '../../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../shared/lib/router/utils/route-regex'

/**
 * Gets the params for the provided normalized route pattern.
 * @param page the URL pattern that contains dynamic path parameters
 * @param pathname the pathname to match
 * @returns the matches that were found, throws otherwise
 */
export function getParams(page: Route, pathname: Route) {
  const params = getRouteMatcher(getRouteRegex(page))(pathname)
  if (!params) {
    throw new Error(
      `The provided export path '${pathname}' doesn't match the '${page}' page.\nRead more: https://nextjs.org/docs/messages/export-path-mismatch`
    )
  }

  return params
}
