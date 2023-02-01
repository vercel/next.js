import { BaseNextRequest, BaseNextResponse } from '../base-http'
import { RouteMatch, RouteType } from '../route-matches/route-match'
import { RouteHandler } from './route-handler'

/**
 * Handlers provides a single entrypoint to configuring the available handler
 * for this application.
 */
export class RouteHandlers implements RouteHandler<RouteType> {
  private readonly handlers: Partial<{
    [R in RouteType]: RouteHandler<R>
  }> = {}

  public set(type: RouteType, handler: RouteHandler<RouteType>) {
    this.handlers[type] = handler
  }

  public handle<R extends RouteType>(
    route: RouteMatch<R>,
    req: BaseNextRequest,
    res: BaseNextResponse
  ) {
    const handler = this.handlers[route.type]
    if (!handler) {
      throw new Error(`RouteType not supported: ${route.type}`)
    }

    return handler.handle(route, req, res)
  }
}
