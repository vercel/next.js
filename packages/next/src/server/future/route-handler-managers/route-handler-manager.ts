import type { BaseNextRequest } from '../../base-http'
import type { ModuleLoader } from '../helpers/module-loader/module-loader'
import type {
  RouteHandler,
  RouteHandlerContext,
} from '../route-handlers/route-handler'
import type { RouteMatch } from '../route-matches/route-match'
import type { AppRouteRouteHandlerContext } from '../route-handlers/app-route-route-handler'

import { NodeModuleLoader } from '../helpers/module-loader/node-module-loader'

export interface HandlerModule<
  H extends RouteHandler = RouteHandler,
  U = unknown
> {
  /**
   * The userland module. This is the module that is exported from the user's
   * code.
   */
  readonly userland: U

  readonly route: {
    /**
     * The handler for the module. This is the handler that is used to handle
     * requests.
     */
    readonly handler: H
  }
}

/**
 * RouteHandlerManager is a manager for route handlers. As new route handlers
 * are added, their types should be '&'-ed with this type.
 */
export type RouteHandlerManagerContext = AppRouteRouteHandlerContext

export class RouteHandlerManager {
  constructor(
    private readonly moduleLoader: ModuleLoader = new NodeModuleLoader()
  ) {}

  public async handle(
    match: RouteMatch,
    req: BaseNextRequest,
    context: RouteHandlerManagerContext
  ): Promise<Response | undefined> {
    // The module supports minimal mode, load the minimal module.
    const module: HandlerModule = await this.moduleLoader.load(
      match.definition.filename
    )

    // Patch the handler if it supports it.
    module.route.handler.patch?.()

    // Create the context for the handler. This contains the params from the
    // match (if any) and the context from the request from above.
    const ctx: RouteHandlerContext = { ...context, params: match.params }

    // Get the response from the handler.
    const response = await module.route.handler.handle(req, ctx)

    // Send the response back.
    return response
  }
}
