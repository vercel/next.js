import type { BaseNextRequest } from '../base-http'
import type { RouteMatch, RouteType } from '../route-matches/route-match'
import type { RouteMatcher } from './route-matcher'

/**
 * Matchers provides a single entrypoint to configuring all the available
 * matchers for this application. It will try all the provided matchers in
 * order until a single one is found.
 */
export class RouteMatchers implements RouteMatcher<RouteType> {
  private readonly matchers: Array<RouteMatcher<RouteType>> = []

  public push(matcher: RouteMatcher<RouteType>) {
    this.matchers.push(matcher)
  }

  /**
   * Returns the route that should handle the request if any.
   *
   * @param req the request for which we should resolve the route for
   * @returns the route (if it exists) for the request
   */
  public async match(
    req: BaseNextRequest<any>
  ): Promise<RouteMatch<RouteType> | null> {
    // Loop over all the matchers, find the one that matches this route.
    for (const matcher of this.matchers) {
      const match = await matcher.match(req)
      if (!match) continue

      return match
    }

    // No route was found given the configured matchers.
    return null
  }
}
