import type { BaseNextRequest, BaseNextResponse } from '../base-http'
import type { RouteMatch, RouteType } from '../route-matches/route-match'

export type RouteHandlerFn<R extends RouteType> = (
  route: RouteMatch<R>,
  req: BaseNextRequest,
  res: BaseNextResponse
) => Promise<void> | void

export interface RouteHandler<R extends RouteType> {
  /**
   * Handler will return the handler for a given route given the route handler.
   *
   * @param route the route to execute with
   */
  handle(
    route: RouteMatch<R>,
    req: BaseNextRequest,
    res: BaseNextResponse
  ): Promise<void> | void
}
