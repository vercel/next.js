import { BaseNextRequest, BaseNextResponse } from '../base-http'
import { RouteKind } from '../route-kind'
import { RouteMatch } from '../route-matches/route-match'
import { RouteHandler } from './route-handler'

/**
 * Handlers provides a single entrypoint to configuring the available handler
 * for this application.
 */
export class RouteHandlers {
  private readonly handlers: Partial<{
    [K in RouteKind]: RouteHandler<K>
  }> = {}

  public set(kind: RouteKind, handler: RouteHandler<RouteKind>) {
    if (kind in this.handlers) {
      throw new Error(
        'Invariant: a route handler for this route type has already been configured'
      )
    }

    this.handlers[kind] = handler
  }

  public async handle<K extends RouteKind>(
    route: RouteMatch<K>,
    req: BaseNextRequest,
    res: BaseNextResponse
  ) {
    const handler = this.handlers[route.kind]
    if (!handler) return false

    await handler.handle(route, req, res)
    return true
  }
}
