import { getSortedRoutes, isDynamicRoute } from '../../shared/lib/router/utils'
import { removeTrailingSlash } from '../../shared/lib/router/utils/remove-trailing-slash'
import {
  getRouteMatcher,
  RouteMatchFn,
} from '../../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../shared/lib/router/utils/route-regex'
import { Normalizer } from '../normalizers/normalizer'
import { Normalizers } from '../normalizers/normalizers'
import { wrapNormalizerFn } from '../normalizers/wrap-normalizer-fn'
import { RouteKind } from '../route-kind'
import type { RouteMatch } from '../route-matches/route-match'
import { RouteDefinition, RouteMatcher } from '../route-matchers/route-matcher'
import { RouteMatcherManager } from './route-matcher-manager'

interface DynamicRoute<K extends RouteKind> {
  route: RouteDefinition<K>
  match: RouteMatchFn
}

export class DefaultRouteMatcherManager implements RouteMatcherManager {
  private readonly matchers: Array<RouteMatcher<RouteKind>> = []
  private readonly normalizers: Normalizer
  private normalized: Record<string, RouteDefinition<RouteKind>> = {}
  private dynamic: ReadonlyArray<DynamicRoute<RouteKind>> = []
  private lastCompilationID = this.compilationID

  constructor(public readonly localeNormalizer?: Normalizer) {
    const normalizers = new Normalizers([
      // Remove the trailing slash from incoming request pathnames as it may
      // impact matching.
      wrapNormalizerFn(removeTrailingSlash),
    ])

    // This will strip any locale code from the incoming path if configured.
    if (localeNormalizer) normalizers.push(localeNormalizer)

    this.normalizers = normalizers
  }

  /**
   * When this value changes, it indicates that a change has been introduced
   * that requires recompilation.
   */
  private get compilationID() {
    return this.matchers.length
  }

  public push(matcher: RouteMatcher<RouteKind>) {
    this.matchers.push(matcher)
  }

  /**
   * Iterates over the matchers routes that have been provided and compiles all
   * the dynamic routes.
   */
  public async compile(): Promise<void> {
    // Grab the compilation ID for this run, we'll verify it at the end to
    // ensure that if any routes were added before compilation is finished that
    // we error out.
    const compilationID = this.compilationID
    const matcherRoutes = await Promise.all(
      this.matchers.map((matcher) => matcher.routes())
    )

    // Get all the pathnames (that have been normalized by the matcher) and
    // associate them with the given route type.
    this.normalized = matcherRoutes.reduce<
      Record<string, RouteDefinition<RouteKind>>
    >((normalized, routes) => {
      for (const route of routes) {
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
    }, {})

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

    // This means that there was a new matcher pushed while we were waiting
    if (this.compilationID !== compilationID) {
      throw new Error(
        'Invariant: expected compilation to finish before new matchers were added, possible missing await'
      )
    }

    // The compilation ID matched, so mark the complication as finished.
    this.lastCompilationID = compilationID
  }

  /**
   * Matches a given request to a specific route match. If none could be found,
   * it returns `null`.
   *
   * @param req the request to match a given route for
   * @returns the route match if found
   */
  public async match(
    pathname: string,
    options?: { skipDynamic?: boolean }
  ): Promise<RouteMatch<RouteKind> | null> {
    if (this.lastCompilationID !== this.compilationID) {
      throw new Error('Invariant: expected routes to be compiled before match')
    }

    // Normalize the pathname.
    pathname = this.normalizers.normalize(pathname)

    // If this pathname doesn't look like a dynamic route, and this pathname is
    // listed in the normalized list of routes, then return it. This ensures
    // that when a route like `/user/[id]` is encountered, it doesn't just match
    // with the list of normalized routes.
    if (!isDynamicRoute(pathname) && pathname in this.normalized) {
      return this.normalized[pathname]
    }

    // If we should skip handling dynamic routes, exit now.
    if (options?.skipDynamic) return null

    // For all the dynamic routes, try and match it.
    for (const { route, match } of this.dynamic) {
      const params = match(pathname)

      // Could not match the dynamic route, continue!
      if (!params) continue

      // Matched!
      return { ...route, params }
    }

    // We tried direct matching against the pathname and against all the dynamic
    // paths, so there was no match.
    return null
  }
}
