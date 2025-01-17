import {
  type RouteMatchFn,
  getRouteMatcher,
} from '../../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../shared/lib/router/utils/route-regex'

// The last page and matcher that this function handled.
let last: {
  page: string
  matcher: RouteMatchFn
} | null = null

/**
 * Gets the params for the provided page.
 * @param page the page that contains dynamic path parameters
 * @param pathname the pathname to match
 * @returns the matches that were found, throws otherwise
 */
export function getParams(page: string, pathname: string) {
  // Because this is often called on the output of `getStaticPaths` or similar
  // where the `page` here doesn't change, this will "remember" the last page
  // it created the RegExp for. If it matches, it'll just re-use it.
  let matcher: RouteMatchFn
  if (last?.page === page) {
    matcher = last.matcher
  } else {
    matcher = getRouteMatcher(getRouteRegex(page))
  }

  const params = matcher(pathname)
  if (!params) {
    throw new Error(
      `The provided export path '${pathname}' doesn't match the '${page}' page.\nRead more: https://nextjs.org/docs/messages/export-path-mismatch`
    )
  }

  return params
}
