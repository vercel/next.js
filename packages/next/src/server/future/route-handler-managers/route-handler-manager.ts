import type { BaseNextRequest } from '../../base-http'
import type { ModuleLoader } from '../helpers/module-loader/module-loader'
import type {
  RouteHandler,
  RouteHandlerContext,
} from '../route-handlers/route-handler'
import type { RouteMatch } from '../route-matches/route-match'

import { NodeModuleLoader } from '../helpers/module-loader/node-module-loader'

export interface HandlerModule<
  H extends RouteHandler = RouteHandler,
  U = unknown
> {
  /**
   * The userland module. This is the module that is exported from the user's
   * code.
   */
  userland: U

  route: {
    /**
     * The handler for the module. This is the handler that is used to handle
     * requests.
     */
    handler: H
  }
}

export class RouteHandlerManager {
  constructor(
    private readonly moduleLoader: ModuleLoader = new NodeModuleLoader()
  ) {}

  public async handle(
    match: RouteMatch,
    req: BaseNextRequest,
    context: any = {}
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
