import type {
  DynamicPrerenderManifestRoute,
  PrerenderManifest,
} from '../../../../build'
import type { DeepReadonly } from '../../../../shared/lib/deep-readonly'
import {
  getRouteMatcher,
  type RouteMatchFn,
} from '../../../../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../../../shared/lib/router/utils/route-regex'

/**
 * A matcher for a dynamic route.
 */
type Matcher = {
  /**
   * The matcher for the dynamic route. This is lazily created when the matcher
   * is first used.
   */
  matcher?: RouteMatchFn

  /**
   * The source of the dynamic route.
   */
  source: string

  /**
   * The route that matches the source.
   */
  route: DeepReadonly<DynamicPrerenderManifestRoute>
}

/**
 * A matcher for the prerender manifest.
 *
 * This class is used to match the pathname to the dynamic route.
 */
export class PrerenderManifestMatcher {
  private readonly matchers: Array<Matcher>
  constructor(
    pathname: string,
    prerenderManifest: DeepReadonly<PrerenderManifest>
  ) {
    this.matchers = Object.entries(prerenderManifest.dynamicRoutes)
      .filter(([, route]) => {
        return route.fallbackSourceRoute === pathname
      })
      .map(([source, route]) => ({ source, route }))
  }

  /**
   * Match the pathname to the dynamic route. If no match is found, an error is
   * thrown.
   *
   * @param pathname - The pathname to match.
   * @returns The dynamic route that matches the pathname.
   */
  public match(pathname: string): DeepReadonly<DynamicPrerenderManifestRoute> {
    // Iterate over the matchers. They're already in the correct order of
    // specificity as they were inserted into the prerender manifest that way
    // and iterating over them with Object.entries guarantees that.
    for (const matcher of this.matchers) {
      // Lazily create the matcher, this is only done once per matcher.
      if (!matcher.matcher) {
        matcher.matcher = getRouteMatcher(getRouteRegex(matcher.source))
      }

      const match = matcher.matcher(pathname)
      if (match) {
        return matcher.route
      }
    }

    throw new Error('Unable to match pathname to a dynamic route')
  }
}
