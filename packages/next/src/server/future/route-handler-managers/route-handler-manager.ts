import type { BaseNextRequest } from '../../base-http'
import type { ModuleLoader } from '../helpers/module-loader/module-loader'
import type { RouteModule } from '../route-modules/route-module'
import type { AppRouteRouteHandlerContext } from '../route-modules/app-route/module'
import type { AppRouteRouteMatch } from '../route-matches/app-route-route-match'

import { NodeModuleLoader } from '../helpers/module-loader/node-module-loader'
import { RouteModuleLoader } from '../helpers/module-loader/route-module-loader'
import { NextRequestAdapter } from '../../web/spec-extension/adapters/next-request'

/**
 * RouteHandlerManager is a manager for route handlers.
 */
export type RouteHandlerManagerContext =
  // As new route handlers are added, their types should be '&'-ed with this
  // type.
  AppRouteRouteHandlerContext

export class RouteHandlerManager {
  constructor(
    private readonly moduleLoader: ModuleLoader = new NodeModuleLoader()
  ) {}

  public async handle(
    match: AppRouteRouteMatch,
    req: BaseNextRequest,
    context: RouteHandlerManagerContext,
    signal: AbortSignal
  ): Promise<Response> {
    // The module supports minimal mode, load the minimal module.
    const module = await RouteModuleLoader.load<RouteModule>(
      match.definition.filename,
      this.moduleLoader
    )

    // Convert the BaseNextRequest to a NextRequest.
    const request = NextRequestAdapter.fromBaseNextRequest(req, signal)

    // Get the response from the handler and send it back.
    return await module.handle(request, context)
  }
}
