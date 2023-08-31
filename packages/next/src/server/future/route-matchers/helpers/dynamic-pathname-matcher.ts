import { getRouteMatcher } from '../../../../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../../../shared/lib/router/utils/route-regex'
import { type PathnameMatchResult, PathnameMatcher } from './pathname-matcher'

/**
 * DynamicPathnameMatcher is a matcher that matches a dynamic pathname by
 * matching against the given regex.
 */
export class DynamicPathnameMatcher extends PathnameMatcher {
  private readonly matcher = getRouteMatcher(getRouteRegex(this.pathname))

  public match(pathname: string): PathnameMatchResult | null {
    const params = this.matcher(pathname)
    if (!params) return null

    return { params }
  }
}
