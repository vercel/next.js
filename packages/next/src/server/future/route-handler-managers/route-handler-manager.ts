import type { BaseNextRequest } from '../../base-http'
import type { ModuleLoader } from '../helpers/module-loader/module-loader'
import type {
  RouteHandler,
  RouteHandlerContext,
} from '../route-handlers/route-handler'
import type { RouteMatch } from '../route-matches/route-match'
import type { AppRouteRouteHandlerContext } from '../route-handlers/app-route-route-handler'
import type { RequestAsyncStorage } from '../../../client/components/request-async-storage'
import type { StaticGenerationAsyncStorage } from '../../../client/components/static-generation-async-storage'
import type * as ServerHooks from '../../../client/components/hooks-server-context'
import type * as HeaderHooks from '../../../client/components/headers'
import type { staticGenerationBailout as StaticGenerationBailout } from '../../../client/components/static-generation-bailout'
import type { RouteDefinition } from '../route-definitions/route-definition'

import { NodeModuleLoader } from '../helpers/module-loader/node-module-loader'

/**
 * A route handler is a function that takes a request and returns a response.
 */
export interface HandlerRoute<
  D extends RouteDefinition,
  H extends RouteHandler
> {
  /**
   * The definition of the route.
   */
  readonly definition: D

  /**
   * The handler for the route.
   */
  readonly handler: H
}

/**
 * A module is a userland module that exports a route handler and some other
 * hooks.
 */
export interface HandlerModule<
  D extends RouteDefinition = RouteDefinition,
  H extends RouteHandler = RouteHandler,
  U = unknown
> {
  /**
   * The userland module. This is the module that is exported from the user's
   * code.
   */
  readonly userland: Readonly<U>

  /**
   * The route that provides the handler for the module.
   */
  readonly route: HandlerRoute<D, H>

  /**
   * A reference to the request async storage.
   */
  readonly requestAsyncStorage: RequestAsyncStorage

  /**
   * A reference to the static generation async storage.
   */
  readonly staticGenerationAsyncStorage: StaticGenerationAsyncStorage

  /**
   * An interface to call server hooks which interact with the underlying
   * storage.
   */
  readonly serverHooks: typeof ServerHooks

  /**
   * An interface to call header hooks which interact with the underlying
   * request storage.
   */
  readonly headerHooks: typeof HeaderHooks

  /**
   * An interface to call static generation bailout hooks which interact with
   * the underlying static generation storage.
   */
  readonly staticGenerationBailout: typeof StaticGenerationBailout
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
