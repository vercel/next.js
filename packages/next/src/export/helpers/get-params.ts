import { getRouteMatcher } from '../../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../shared/lib/router/utils/route-regex'

/**
 * Gets the params for the provided page.
 * @param page the page that contains dynamic path parameters
 * @param pathname the pathname to match
 * @returns the matches that were found, throws otherwise
 */
export function getParams(page: string, pathname: string) {
  const params = getRouteMatcher(getRouteRegex(page))(pathname)
  if (!params) {
    throw new Error(
      `The provided export path '${pathname}' doesn't match the '${page}' page.\nRead more: https://nextjs.org/docs/messages/export-path-mismatch`
    )
  }

  return params
}
