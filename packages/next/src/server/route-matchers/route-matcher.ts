import { BaseNextRequest } from '../base-http'
import { RouteMatch, RouteType } from '../route-matches/route-match'

/**
 * Resolver provides the interface for a given route type that could resolve to
 * a given `Route`.
 */
export interface RouteMatcher<R extends RouteType> {
  /**
   * Returns the route that should handle the request if any.
   *
   * @param req the request for which we should resolve the route for
   * @returns the route (if it exists) for the request
   */
  match(
    req: BaseNextRequest
  ): Promise<RouteMatch<R> | null> | RouteMatch<R> | null
}
