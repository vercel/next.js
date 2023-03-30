import type { Params } from '../../../../shared/lib/router/utils/route-matcher'
import type { NextConfig } from '../../../config-shared'
import type { AppRouteRouteDefinition } from '../../route-definitions/app-route-route-definition'
import type { AppConfig } from '../../../../build/utils'
import type { WebNextRequest } from '../../../base-http/web'
import type { NodeNextRequest } from '../../../base-http/node'
import type { BaseNextRequest } from '../../../base-http'

import {
  RouteModule,
  type RouteModuleHandleContext,
  type RouteModuleOptions,
} from '../route-module'
import {
  RequestAsyncStorageWrapper,
  type RequestContext,
} from '../../../async-storage/request-async-storage-wrapper'
import {
  StaticGenerationAsyncStorageWrapper,
  type StaticGenerationContext,
} from '../../../async-storage/static-generation-async-storage-wrapper'
import {
  handleBadRequestResponse,
  handleInternalServerErrorResponse,
  handleMethodNotAllowedResponse,
} from '../helpers/response-handlers'
import { HTTP_METHOD, HTTP_METHODS, isHTTPMethod } from '../../../web/http'
import { patchFetch } from '../../../lib/patch-fetch'
import { getTracer } from '../../../lib/trace/tracer'
import { AppRouteRouteHandlersSpan } from '../../../lib/trace/constants'
import { getPathnameFromAbsolutePath } from './helpers/get-pathname-from-absolute-path'
import { proxyRequest } from './helpers/proxy-request'
import { resolveHandlerError } from './helpers/resolve-handler-error'
import { wrapRequest } from './helpers/wrap-request'
import { RouteKind } from '../../route-kind'
import * as Log from '../../../../build/output/log'

/**
 * AppRouteRouteHandlerContext is the context that is passed to the route
 * handler for app routes.
 */
export interface AppRouteRouteHandlerContext extends RouteModuleHandleContext {
  staticGenerationContext: StaticGenerationContext['renderOpts']
}

/**
 * AppRouteHandlerFnContext is the context that is passed to the handler as the
 * second argument.
 */
interface AppRouteHandlerFnContext {
  params?: Params
}

/**
 * Handler function for app routes.
 */
export type AppRouteHandlerFn = (
  /**
   * Incoming request object.
   */
  req: Request,
  /**
   * Context properties on the request (including the parameters if this was a
   * dynamic route).
   */
  ctx: AppRouteHandlerFnContext
) => Response

export type AppRouteUserlandModule = Record<HTTP_METHOD, AppRouteHandlerFn> &
  Pick<AppConfig, 'dynamic' | 'revalidate' | 'dynamicParams' | 'fetchCache'> & {
    // TODO: (wyattjoh) create a type for this
    generateStaticParams?: any
  }

export interface AppRouteRouteModuleOptions
  extends RouteModuleOptions<AppRouteUserlandModule> {
  readonly pathname: string
  readonly resolvedPagePath: string
  readonly nextConfigOutput: NextConfig['output']
}

/**
 * AppRouteRouteHandler is the handler for app routes.
 */
export class AppRouteRouteModule extends RouteModule<
  AppRouteRouteDefinition,
  AppRouteUserlandModule
> {
  public readonly definition: AppRouteRouteDefinition
  public readonly pathname: string
  public readonly resolvedPagePath: string
  public readonly nextConfigOutput: NextConfig['output'] | undefined

  constructor({
    userland,
    pathname,
    resolvedPagePath,
    nextConfigOutput,
  }: AppRouteRouteModuleOptions) {
    super({ userland })

    this.definition = {
      kind: RouteKind.APP_ROUTE,
      pathname,
      // The following aren't needed for the route handler.
      page: '',
      bundlePath: '',
      filename: '',
    }

    this.pathname = pathname
    this.resolvedPagePath = resolvedPagePath
    this.nextConfigOutput = nextConfigOutput
  }

  /**
   * When true, indicates that the global interfaces have been patched via the
   * `patch()` method.
   */
  private hasSetup: boolean = false

  /**
   * Validates the userland module to ensure the exported methods and properties
   * are valid.
   */
  public async setup() {
    // If we've already setup, then return.
    if (this.hasSetup) return

    // Patch the global fetch.
    patchFetch({
      serverHooks: this.serverHooks,
      staticGenerationAsyncStorage: this.staticGenerationAsyncStorage,
    })

    // Mark the module as setup. The following warnings about the userland
    // module will run if we're in development. If the module files are modified
    // when in development, then the require cache will be busted for it and
    // this method will be called again (resetting the `hasSetup` flag).
    this.hasSetup = true

    // We only warn in development after here, so return if we're not in
    // development.
    if (process.env.NODE_ENV === 'development') {
      // Print error in development if the exported handlers are in lowercase, only
      // uppercase handlers are supported.
      const lowercased = HTTP_METHODS.map((method) => method.toLowerCase())
      for (const method of lowercased) {
        if (method in this.userland) {
          Log.error(
            `Detected lowercase method '${method}' in '${
              this.resolvedPagePath
            }'. Export the uppercase '${method.toUpperCase()}' method name to fix this error.`
          )
        }
      }

      // Print error if the module exports a default handler, they must use named
      // exports for each HTTP method.
      if ('default' in this.userland) {
        Log.error(
          `Detected default export in '${this.resolvedPagePath}'. Export a named export for each HTTP method instead.`
        )
      }

      // If there is no methods exported by this module, then return a not found
      // response.
      if (!HTTP_METHODS.some((method) => method in this.userland)) {
        Log.error(
          `No HTTP methods exported in '${this.resolvedPagePath}'. Export a named export for each HTTP method.`
        )
      }
    }
  }

  /**
   * Resolves the handler function for the given method.
   *
   * @param method the requested method
   * @returns the handler function for the given method
   */
  private resolve(method: string): AppRouteHandlerFn {
    // Ensure that the requested method is a valid method (to prevent RCE's).
    if (!isHTTPMethod(method)) return handleBadRequestResponse

    // Check to see if the requested method is available.
    const handler: AppRouteHandlerFn | undefined = this.userland[method]
    if (handler) return handler

    /**
     * If the request got here, then it means that there was not a handler for
     * the requested method. We'll try to automatically setup some methods if
     * there's enough information to do so.
     */

    // If HEAD is not provided, but GET is, then we respond to HEAD using the
    // GET handler without the body.
    if (method === 'HEAD' && 'GET' in this.userland) {
      return this.userland['GET']
    }

    // If OPTIONS is not provided then implement it.
    if (method === 'OPTIONS') {
      // TODO: check if HEAD is implemented, if so, use it to add more headers

      // Get all the handler methods from the list of handlers.
      const methods = Object.keys(this.userland).filter((handlerMethod) =>
        isHTTPMethod(handlerMethod)
      ) as HTTP_METHOD[]

      // If the list of methods doesn't include OPTIONS, add it, as it's
      // automatically implemented.
      if (!methods.includes('OPTIONS')) {
        methods.push('OPTIONS')
      }

      // If the list of methods doesn't include HEAD, but it includes GET, then
      // add HEAD as it's automatically implemented.
      if (!methods.includes('HEAD') && methods.includes('GET')) {
        methods.push('HEAD')
      }

      // Sort and join the list with commas to create the `Allow` header. See:
      // https://httpwg.org/specs/rfc9110.html#field.allow
      const allow = methods.sort().join(', ')

      return () =>
        new Response(null, { status: 204, headers: { Allow: allow } })
    }

    // A handler for the requested method was not found, so we should respond
    // with the method not allowed handler.
    return handleMethodNotAllowedResponse
  }

  /**
   * Executes the route handler.
   */
  private async execute(
    req: BaseNextRequest,
    context: AppRouteRouteHandlerContext
  ): Promise<Response> {
    // Get the handler function for the given method.
    const handle = this.resolve(req.method)

    const requestContext: RequestContext = {
      req:
        'request' in (req as WebNextRequest)
          ? req
          : (req as NodeNextRequest).originalRequest,
    }

    const staticGenerationContext: StaticGenerationContext = {
      pathname: this.definition.pathname,
      renderOpts:
        // If the staticGenerationContext is not provided then we default to
        // the default values.
        context.staticGenerationContext ?? {
          supportsDynamicHTML: false,
        },
    }

    // Add the fetchCache option to the renderOpts.
    staticGenerationContext.renderOpts.fetchCache = this.userland.fetchCache

    // Run the handler with the request AsyncLocalStorage to inject the helper
    // support.
    const response = await RequestAsyncStorageWrapper.wrap(
      this.requestAsyncStorage,
      requestContext,
      () =>
        StaticGenerationAsyncStorageWrapper.wrap(
          this.staticGenerationAsyncStorage,
          staticGenerationContext,
          (staticGenerationStore) => {
            // We can currently only statically optimize if only GET/HEAD
            // are used as a Prerender can't be used conditionally based
            // on the method currently
            const nonStaticHandlers: ReadonlyArray<HTTP_METHOD> = [
              'OPTIONS',
              'POST',
              'PUT',
              'DELETE',
              'PATCH',
            ]
            const usedNonStaticHandlers = nonStaticHandlers.filter(
              (name) => name in this.userland
            )

            if (usedNonStaticHandlers.length > 0) {
              this.staticGenerationBailout(
                `non-static methods used ${usedNonStaticHandlers.join(', ')}`
              )
            }

            // let dynamic = this.userland.dynamic
            if (this.nextConfigOutput === 'export') {
              if (!this.userland.dynamic || this.userland.dynamic === 'auto') {
                this.userland.dynamic = 'error'
              } else if (this.userland.dynamic === 'force-dynamic') {
                throw new Error(
                  `export const dynamic = "force-dynamic" on route handler "${handle.name}" cannot be used with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export`
                )
              }
            }

            switch (this.userland.dynamic) {
              case 'force-dynamic':
                staticGenerationStore.forceDynamic = true
                this.staticGenerationBailout(`dynamic = 'force-dynamic'`)
                break
              case 'force-static':
                staticGenerationStore.forceStatic = true
                break
              case 'error':
                staticGenerationStore.dynamicShouldError = true
                break
              default:
                break
            }

            if (typeof staticGenerationStore.revalidate === 'undefined') {
              staticGenerationStore.revalidate =
                this.userland.revalidate ?? false
            }

            // Wrap the request so we can add additional functionality to cases
            // that might change it's output or affect the rendering.
            const wrappedRequest = proxyRequest(
              // TODO: (wyattjoh) replace with unified request type
              'request' in (req as WebNextRequest)
                ? ((req as WebNextRequest).request as Request)
                : wrapRequest(req),
              this.userland,
              {
                headerHooks: this.headerHooks,
                serverHooks: this.serverHooks,
                staticGenerationBailout: this.staticGenerationBailout,
              }
            )

            return getTracer().trace(
              AppRouteRouteHandlersSpan.runHandler,
              {
                // TODO: propagate this pathname from route matcher
                spanName: `executing api route (app) ${getPathnameFromAbsolutePath(
                  this.resolvedPagePath
                )}`,
              },
              () =>
                handle(wrappedRequest, {
                  params: context.params,
                })
            )
          }
        )
    )

    // If the handler did't return a valid response, then return the internal
    // error response.
    if (!(response instanceof Response)) {
      // TODO: validate the correct handling behavior, maybe log something?
      return handleInternalServerErrorResponse()
    }

    if (response.headers.has('x-middleware-rewrite')) {
      // TODO: move this error into the `NextResponse.rewrite()` function.
      // TODO-APP: re-enable support below when we can proxy these type of requests
      throw new Error(
        'NextResponse.rewrite() was used in a app route handler, this is not currently supported. Please remove the invocation to continue.'
      )

      // // This is a rewrite created via `NextResponse.rewrite()`. We need to send
      // // the response up so it can be handled by the backing server.

      // // If the server is running in minimal mode, we just want to forward the
      // // response (including the rewrite headers) upstream so it can perform the
      // // redirect for us, otherwise return with the special condition so this
      // // server can perform a rewrite.
      // if (!minimalMode) {
      //   return { response, condition: 'rewrite' }
      // }

      // // Relativize the url so it's relative to the base url. This is so the
      // // outgoing headers upstream can be relative.
      // const rewritePath = response.headers.get('x-middleware-rewrite')!
      // const initUrl = getRequestMeta(req, '__NEXT_INIT_URL')!
      // const { pathname } = parseUrl(relativizeURL(rewritePath, initUrl))
      // response.headers.set('x-middleware-rewrite', pathname)
    }

    if (response.headers.get('x-middleware-next') === '1') {
      // TODO: move this error into the `NextResponse.next()` function.
      throw new Error(
        'NextResponse.next() was used in a app route handler, this is not supported. See here for more info: https://nextjs.org/docs/messages/next-response-next-in-app-route-handler'
      )
    }

    return response
  }

  public async handle(
    req: BaseNextRequest,
    context: AppRouteRouteHandlerContext
  ): Promise<Response> {
    try {
      // Execute the route to get the response.
      const response = await this.execute(req, context)

      // The response was handled, return it.
      return response
    } catch (err) {
      // Try to resolve the error to a response, else throw it again.
      const response = resolveHandlerError(err)
      if (!response) throw err

      // The response was resolved, return it.
      return response
    }
  }
}

export default AppRouteRouteModule
