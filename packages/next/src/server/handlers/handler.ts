import type { BaseNextRequest, BaseNextResponse } from '../base-http'
import type { Route } from '../routes/route'

export type HandlerFn<R extends Route> = (
  route: R,
  req: BaseNextRequest,
  res: BaseNextResponse
) => Promise<void> | void

export interface RouteHandler<R extends Route> {
  /**
   * Handler will return the handler for a given route given the route handler.
   *
   * @param route the route to execute with
   */
  handle(
    route: R,
    req: BaseNextRequest,
    res: BaseNextResponse
  ): Promise<void> | void
}
