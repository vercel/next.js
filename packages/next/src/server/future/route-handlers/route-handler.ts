import type { Params } from '../../../shared/lib/router/utils/route-matcher'
import type { BaseNextRequest } from '../../base-http'
import type { RouteDefinition } from '../route-definitions/route-definition'

export interface RouteHandlerContext {
  params?: Params
}

/**
 * RouteHandler is a handler for a route kind.
 */
export interface RouteHandler<D extends RouteDefinition = RouteDefinition> {
  readonly definition: D

  /**
   * Patch will apply any patches needed for the route handler to work. This
   * could be adding polyfills.
   */
  patch?(): void

  /**
   * Handle will handle the request and return a response.
   */
  handle(req: BaseNextRequest, context: RouteHandlerContext): Promise<Response>
}
