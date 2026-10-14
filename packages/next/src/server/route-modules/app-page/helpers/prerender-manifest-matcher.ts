import type { Route } from '../../../../shared/lib/route-types'
import type {
  DynamicPrerenderManifestRoute,
  PrerenderManifest,
} from '../../../../build'
import type { DeepReadonly } from '../../../../shared/lib/deep-readonly'
import { getRouteRegex } from '../../../../shared/lib/router/utils/route-regex'

/**
 * A matcher for a dynamic route.
 */
type Matcher = {
  /**
   * The matcher for the dynamic route. This is lazily created when the matcher
   * is first used.
   */
  matcher?: RegExp

  /**
   * The source of the dynamic route.
   */
  source: Route

  /**
   * The route that matches the source.
   */
  route: DeepReadonly<DynamicPrerenderManifestRoute>
}

export type PrerenderManifestMatch = {
  source: Route
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
    pathname: Route,
    prerenderManifest: DeepReadonly<PrerenderManifest>
  ) {
    this.matchers = (
      Object.entries(prerenderManifest.dynamicRoutes) as [
        Route,
        DeepReadonly<DynamicPrerenderManifestRoute>,
      ][]
    )
      .filter(([source, route]) => {
        // If the pathname is a fallback source route, or the source route is
        // the same as the pathname, then we should include it in the matchers.
        return route.fallbackSourceRoute === pathname || source === pathname
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
  public match(pathname: Route): PrerenderManifestMatch | null {
    // Iterate over the matchers. They're already in the correct order of
    // specificity as they were inserted into the prerender manifest that way
    // and iterating over them with Object.entries guarantees that.
    for (const matcher of this.matchers) {
      // Lazily create the matcher, this is only done once per matcher.
      if (!matcher.matcher) {
        // The pathname has already been decoded for manifest lookup. We only
        // need to check its structure here; extracting captures would decode
        // route parameters again and reject literal percent signs.
        matcher.matcher = getRouteRegex(matcher.source).re
      }

      if (matcher.matcher.test(pathname)) {
        return {
          source: matcher.source,
          route: matcher.route,
        }
      }
    }

    return null
  }
}
