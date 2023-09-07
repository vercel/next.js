import type { PathnameMatcher } from './pathname-matcher'

import { isDynamicRoute } from '../../../../shared/lib/router/utils'
import { DynamicPathnameMatcher } from './dynamic-pathname-matcher'
import { StaticPathnameMatcher } from './static-pathname-matcher'

/**
 * createPathnameMatcher creates a PathnameMatcher for the given pathname.
 *
 * @param pathname the pathname to create a matcher for
 * @returns the created PathnameMatcher
 */
export function createPathnameMatcher(pathname: string): PathnameMatcher {
  if (isDynamicRoute(pathname)) {
    return new DynamicPathnameMatcher(pathname)
  }

  return new StaticPathnameMatcher(pathname)
}
