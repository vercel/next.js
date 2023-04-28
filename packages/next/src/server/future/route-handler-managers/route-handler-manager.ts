import type { BaseNextRequest } from '../../base-http'
import type { ModuleLoader } from '../helpers/module-loader/module-loader'
import type { RouteMatch } from '../route-matches/route-match'
import type { RouteModule } from '../route-modules/route-module'
import type { AppRouteRouteHandlerContext } from '../route-modules/app-route/module'
import type { PagesRouteHandlerContext } from '../route-modules/pages/module'

import { NodeModuleLoader } from '../helpers/module-loader/node-module-loader'
import { RouteModuleLoader } from '../helpers/module-loader/route-module-loader'
import { NextRequestAdapter } from '../../web/spec-extension/adapters/next-request'
import { RouteKind } from '../route-kind'

/**
 * RouteHandlerManager is a manager for route handlers.
 */
export type RouteHandlerManagerContext =
  // As new route handlers are added, their types should be '&'-ed with this
  // type.
  AppRouteRouteHandlerContext & PagesRouteHandlerContext

// TODO: (wyattjoh) add support for other module types.
const SUPPORTED_MODULE_TYPES = new Set<RouteKind>([
  RouteKind.APP_ROUTE,
  RouteKind.PAGES,
])

export class RouteHandlerManager {
  public constructor(
    private readonly moduleLoader: ModuleLoader = new NodeModuleLoader()
  ) {}

  public async handle(
    match: RouteMatch,
    req: BaseNextRequest,
    context: RouteHandlerManagerContext
  ): Promise<Response | undefined> {
    // If the match is not an enabled module type, return undefined.
    if (!SUPPORTED_MODULE_TYPES.has(match.definition.kind)) return

    // The module supports minimal mode, load the minimal module.
    const module = RouteModuleLoader.load<RouteModule>(
      match.definition.filename,
      this.moduleLoader
    )

    return await this.execute(module, req, context)
  }

  /**
   * @deprecated Temporary method to allow us to use the return result of the
   * `loadComponents` method.
   */
  public async execute(
    module: RouteModule,
    req: BaseNextRequest,
    context: RouteHandlerManagerContext
  ): Promise<Response | undefined> {
    // Convert the BaseNextRequest to a NextRequest.
    const request = NextRequestAdapter.fromBaseNextRequest(req)

    // Get the response from the handler and send it back.
    return await module.handle(request, context)
  }
}
