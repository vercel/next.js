import type { RouteHandler } from '../../../../server/future/route-handlers/route-handler'
import type { ExecutableRoute } from '../next-app-loader/routes/helpers/executable-route'

import { WebNextRequest } from '../../../../server/base-http/web'
import { removeTrailingSlash } from '../../../../shared/lib/router/utils/remove-trailing-slash'
import { RouteMatcher } from '../../../../server/future/route-matchers/route-matcher'

/**
 * HandlerProvider is a wrapper around a route handler that allows the handler
 * to be patched and reused.
 *
 * This should only be used in the edge runtime.
 */
export class HandlerProvider {
  private readonly matcher: RouteMatcher
  private patched: boolean = false

  constructor(private readonly route: ExecutableRoute<RouteHandler>) {
    this.matcher = new RouteMatcher(route.handler.definition)

    // If the handler doesn't need patching, mark it as already patched.
    if (!route.handler.patch) this.patched = true
  }

  public async handler(request: Request): Promise<Response> {
    // Patch the handler if it supports it and if it hasn't been patched yet.
    if (!this.patched) {
      this.route.handler.patch?.()
      this.patched = true
    }

    // TODO: (wyattjoh) replace with the unified request type
    const req = new WebNextRequest(request)

    // Get the pathname for the matcher. Pathnames should not have trailing
    // slashes for matching.
    const pathname = removeTrailingSlash(new URL(request.url).pathname)

    // Get the match for this request.
    const match = this.matcher.match(pathname)
    if (!match) {
      throw new Error(
        `Invariant: no match found for request. Pathname '${pathname}' should have matched '${this.matcher.definition.pathname}'`
      )
    }

    // Create the context for the handler. This contains the params from the
    // match (if any).
    const context = {
      params: match.params,
      staticGenerationContext: {
        supportsDynamicHTML: true,
      },
    }

    // Get the response from the handler.
    const response = await this.route.handler.handle(req, context)

    return response
  }
}
