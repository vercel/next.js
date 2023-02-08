import type { BaseNextRequest, BaseNextResponse } from '../base-http'
import { RouteKind } from '../route-kind'
import type { RouteMatch } from '../route-matches/route-match'

export type RouteHandlerFn<K extends RouteKind> = (
  route: RouteMatch<K>,
  req: BaseNextRequest,
  res: BaseNextResponse
) => Promise<void> | void

export interface RouteHandler<K extends RouteKind> {
  /**
   * Handler will return the handler for a given route given the route handler.
   *
   * @param route the route to execute with
   */
  handle(
    route: RouteMatch<K>,
    req: BaseNextRequest,
    res: BaseNextResponse
  ): Promise<void> | void
}
