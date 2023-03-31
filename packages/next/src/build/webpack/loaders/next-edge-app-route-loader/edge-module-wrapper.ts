import type { RouteHandlerManagerContext } from '../../../../server/future/route-handler-managers/route-handler-manager'
import type { RouteDefinition } from '../../../../server/future/route-definitions/route-definition'
import type { RouteModule } from '../../../../server/future/route-modules/route-module'

import {
  adapter,
  enhanceGlobals,
  type AdapterOptions,
} from '../../../../server/web/adapter'

enhanceGlobals()

import { WebNextRequest } from '../../../../server/base-http/web'
import { removeTrailingSlash } from '../../../../shared/lib/router/utils/remove-trailing-slash'
import { RouteMatcher } from '../../../../server/future/route-matchers/route-matcher'

type WrapOptions = Partial<Pick<AdapterOptions, 'page'>>

/**
 * HandlerProvider is a wrapper around a route handler that allows the handler
 * to be patched and reused.
 *
 * This should only be used in the edge runtime.
 */
export class EdgeModuleWrapper {
  private readonly matcher: RouteMatcher

  private constructor(
    private readonly routeModule: RouteModule<RouteDefinition>
  ) {
    // TODO: (wyattjoh) possibly allow the module to define it's own matcher
    this.matcher = new RouteMatcher(routeModule.definition)
  }

  /**
   * This will wrap a module with the EdgeModuleWrapper and return a function
   * that can be used as a handler for the edge runtime.
   *
   * @param module the module to wrap
   * @param options any options that should be passed to the adapter and
   *                override the ones passed from the runtime
   * @returns a function that can be used as a handler for the edge runtime
   */
  public static wrap(
    routeModule: RouteModule<RouteDefinition>,
    options: WrapOptions = {}
  ) {
    // Create the module wrapper.
    const wrapper = new EdgeModuleWrapper(routeModule)

    // Return the wrapping function.
    return (opts: AdapterOptions) => {
      return adapter({
        ...opts,
        ...options,
        // Bind the handler method to the wrapper so it still has context.
        handler: wrapper.handler.bind(wrapper),
      })
    }
  }

  private async handler(request: Request): Promise<Response> {
    // Setup the handler if it hasn't been setup yet. It is the responsibility
    // of the module to ensure that this is only called once.
    this.routeModule.setup()

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
    const context: RouteHandlerManagerContext = {
      params: match.params,
      staticGenerationContext: {
        supportsDynamicHTML: true,
      },
    }

    // Get the response from the handler.
    return await this.routeModule.handle(req, context)
  }
}
