import { BaseNextRequest } from '../base-http'
import { Route } from '../routes/route'

/**
 * Resolver provides the interface for a given route type that could resolve to
 * a given `Route`.
 */
export interface Resolver<R extends Route> {
  /**
   * Returns the route that should handle the request if any.
   *
   * @param req the request for which we should resolve the route for
   * @returns the route (if it exists) for the request
   */
  resolve(req: BaseNextRequest): R | null | Promise<R | null>
}
