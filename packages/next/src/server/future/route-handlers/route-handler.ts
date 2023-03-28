import type { Params } from '../../../shared/lib/router/utils/route-matcher'
import type { BaseNextRequest } from '../../base-http'

/**
 * RouteHandlerContext is the base context for a route handler.
 */
export interface RouteHandlerContext {
  params?: Params
}

/**
 * RouteHandler is a handler for a route kind.
 */
export interface RouteHandler {
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
