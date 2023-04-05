import type { RouteHandlerManagerContext } from '../future/route-handler-managers/route-handler-manager'
import type { RouteDefinition } from '../future/route-definitions/route-definition'
import type { RouteModule } from '../future/route-modules/route-module'
import type { NextRequest } from './spec-extension/request'

import { adapter, enhanceGlobals, type AdapterOptions } from './adapter'

enhanceGlobals()

import { removeTrailingSlash } from '../../shared/lib/router/utils/remove-trailing-slash'
import { RouteMatcher } from '../future/route-matchers/route-matcher'

type WrapOptions = Partial<Pick<AdapterOptions, 'page'>>

/**
 * EdgeRouteModuleWrapper is a wrapper around a route module.
 *
 * Note that this class should only be used in the edge runtime.
 */
export class EdgeRouteModuleWrapper {
  private readonly matcher: RouteMatcher

  /**
   * The constructor is wrapped with private to ensure that it can only be
   * constructed by the static wrap method.
   *
   * @param routeModule the route module to wrap
   */
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
    const wrapper = new EdgeRouteModuleWrapper(routeModule)

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

  private async handler(request: NextRequest): Promise<Response> {
    // Setup the handler if it hasn't been setup yet. It is the responsibility
    // of the module to ensure that this is only called once.
    this.routeModule.setup()

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
    return await this.routeModule.handle(request, context)
  }
}
