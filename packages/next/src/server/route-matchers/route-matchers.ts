import { getSortedRoutes, isDynamicRoute } from '../../shared/lib/router/utils'
import {
  getRouteMatcher,
  RouteMatchFn,
} from '../../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../shared/lib/router/utils/route-regex'
import type { BaseNextRequest } from '../base-http'
import { Normalizer } from '../normalizers/normalizer'
import type { RouteMatch, RouteType } from '../route-matches/route-match'
import { Route, RouteMatcher } from './route-matcher'

interface DynamicRoute<R extends RouteType> {
  route: Route<R>
  match: RouteMatchFn
}

export class RouteMatchers {
  private compiled = false
  private readonly matchers: Array<RouteMatcher<RouteType>> = []
  private normalized: Record<string, Route<RouteType>> = {}
  private dynamic: ReadonlyArray<DynamicRoute<RouteType>> = []

  constructor(private readonly localeNormalizer?: Normalizer) {}

  public push(matcher: RouteMatcher<RouteType>) {
    this.matchers.push(matcher)
  }

  /**
   * Iterates over the matchers routes that have been provided and compiles all
   * the dynamic routes.
   */
  public compile() {
    // Get all the pathnames (that have been normalized by the matcher) and
    // associate them with the given route type.
    this.normalized = this.matchers.reduce<Record<string, Route<RouteType>>>(
      (normalized, matcher) => {
        for (const route of matcher.routes()) {
          // Ensure we don't have duplicate routes in the normalized object.
          // This can only happen when different matchers provide different
          // routes as each matcher is expected to deduplicate routes returned.
          if (route.pathname in normalized) {
            // TODO: maybe just warn here and continue?
            throw new Error(
              'Invariant: unexpected duplicate normalized pathname in matcher'
            )
          }

          normalized[route.pathname] = route
        }

        return normalized
      },
      {}
    )

    this.dynamic =
      // Sort the routes according to their resolution order.
      getSortedRoutes(
        Object.keys(this.normalized)
          // Only consider the routes with dynamic parameters.
          .filter((pathname) => isDynamicRoute(pathname))
      ).map((pathname) => ({
        route: this.normalized[pathname],
        match: getRouteMatcher(getRouteRegex(pathname)),
      }))

    this.compiled = true
  }

  /**
   * Matches a given request to a specific route match. If none could be found,
   * it returns `null`.
   *
   * @param req the request to match a given route for
   * @returns the route match if found
   */
  public match(
    req: Pick<BaseNextRequest, 'url'>
  ): RouteMatch<RouteType> | null {
    if (!this.compiled) {
      throw new Error('Invariant: expected routes to be compiled before match')
    }

    const url = new URL(req.url, 'https://n')

    // Normalize the url pathname if it's configured. This will strip any locale
    // path from the incoming request. This is because the i18n support will
    // match the non-locale version from the manifest. If the locale normalizer
    // isn't provided, default to the pathname provided by the URL parser (this
    // implies that the application was not configured with locale support).
    const pathname =
      this.localeNormalizer?.normalize(url.pathname) ?? url.pathname

    // If this pathname doesn't look like a dynamic route, and this pathname is
    // listed in the normalized list of routes, then return it. This ensures
    // that when a route like `/user/[id]` is encountered, it doesn't just match
    // with the list of normalized routes.
    if (!isDynamicRoute(pathname) && pathname in this.normalized) {
      return this.normalized[pathname]
    }

    // For all the dynamic routes, try and match it.
    for (const { route, match } of this.dynamic) {
      const params = match(pathname)

      // Could not match the dynamic route, continue!
      if (!params) continue

      // Matched!
      return { type: route.type, filename: route.filename, params }
    }

    // We tried direct matching against the pathname and against all the dynamic
    // paths, so there was no match.
    return null
  }
}
