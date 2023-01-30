import { Route, RouteType } from '../routes/route'
import { HandlerFn, RouteHandler } from './handler'

/**
 * Handlers provides a single entrypoint to configuring the available handler
 * for this application.
 */
export class Handlers implements RouteHandler<Route> {
  constructor(
    private readonly handlers: Partial<Record<RouteType, RouteHandler<Route>>>
  ) {}

  public handle: HandlerFn<Route> = (route, req, res) => {
    const handler = this.handlers[route.type]
    if (!handler) {
      throw new Error(`RouteType not supported: ${route.type}`)
    }

    return handler.handle(route, req, res)
  }
}
