import { BaseNextRequest, BaseNextResponse } from '../base-http'
import { RouteMatch, RouteType } from '../route-matches/route-match'
import { RouteHandler } from './route-handler'

/**
 * Handlers provides a single entrypoint to configuring the available handler
 * for this application.
 */
export class RouteHandlers {
  private readonly handlers: Partial<{
    [R in RouteType]: RouteHandler<R>
  }> = {}

  public set(type: RouteType, handler: RouteHandler<RouteType>) {
    if (type in this.handlers) {
      throw new Error(
        'Invariant: a route handler for this route type has already been configured'
      )
    }

    this.handlers[type] = handler
  }

  public async handle<R extends RouteType>(
    route: RouteMatch<R>,
    req: BaseNextRequest,
    res: BaseNextResponse
  ) {
    const handler = this.handlers[route.type]
    if (!handler) return false

    await handler.handle(route, req, res)
    return true
  }
}
