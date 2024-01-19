import type { NextConfig } from '../../../config-shared'
import type { AppRouteRouteDefinition } from '../../route-definitions/app-route-route-definition'
import type { AppConfig } from '../../../../build/utils'
import type { NextRequest } from '../../../web/spec-extension/request'
import type { PrerenderManifest } from '../../../../build'

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
} from '../helpers/response-handlers'
import { type HTTP_METHOD, HTTP_METHODS, isHTTPMethod } from '../../../web/http'
import { addImplicitTags, patchFetch } from '../../../lib/patch-fetch'
import { getTracer } from '../../../lib/trace/tracer'
import { AppRouteRouteHandlersSpan } from '../../../lib/trace/constants'
import { getPathnameFromAbsolutePath } from './helpers/get-pathname-from-absolute-path'
import { proxyRequest } from './helpers/proxy-request'
import { resolveHandlerError } from './helpers/resolve-handler-error'
import * as Log from '../../../../build/output/log'
import { autoImplementMethods } from './helpers/auto-implement-methods'
import { getNonStaticMethods } from './helpers/get-non-static-methods'
import { appendMutableCookies } from '../../../web/spec-extension/adapters/request-cookies'
import { parsedUrlQueryToParams } from './helpers/parsed-url-query-to-params'

import * as serverHooks from '../../../../client/components/hooks-server-context'
import * as headerHooks from '../../../../client/components/headers'
import { staticGenerationBailout } from '../../../../client/components/static-generation-bailout'

import { requestAsyncStorage } from '../../../../client/components/request-async-storage.external'
import { staticGenerationAsyncStorage } from '../../../../client/components/static-generation-async-storage.external'
import { actionAsyncStorage } from '../../../../client/components/action-async-storage.external'
import * as sharedModules from './shared-modules'
import { getIsServerAction } from '../../../lib/server-action-request-meta'

/**
 * The AppRouteModule is the type of the module exported by the bundled App
 * Route module.
 */
export type AppRouteModule =
  typeof import('../../../../build/templates/app-route')

/**
 * AppRouteRouteHandlerContext is the context that is passed to the route
 * handler for app routes.
 */
export interface AppRouteRouteHandlerContext extends RouteModuleHandleContext {
  renderOpts: StaticGenerationContext['renderOpts']
  prerenderManifest: PrerenderManifest
}

/**
 * AppRouteHandlerFnContext is the context that is passed to the handler as the
 * second argument.
 */
type AppRouteHandlerFnContext = {
  params?: Record<string, string | string[]>
}

/**
 * Handler function for app routes. If a non-Response value is returned, an error
 * will be thrown.
 */
export type AppRouteHandlerFn = (
  /**
   * Incoming request object.
   */
  req: NextRequest,
  /**
   * Context properties on the request (including the parameters if this was a
   * dynamic route).
   */
  ctx: AppRouteHandlerFnContext
) => unknown

/**
 * AppRouteHandlers describes the handlers for app routes that is provided by
 * the userland module.
 */
export type AppRouteHandlers = {
  [method in HTTP_METHOD]?: AppRouteHandlerFn
}

/**
 * AppRouteUserlandModule is the userland module that is provided for app
 * routes. This contains all the user generated code.
 */
export type AppRouteUserlandModule = AppRouteHandlers &
  Pick<AppConfig, 'dynamic' | 'revalidate' | 'dynamicParams' | 'fetchCache'> & {
    // TODO: (wyattjoh) create a type for this
    generateStaticParams?: any
  }

/**
 * AppRouteRouteModuleOptions is the options that are passed to the app route
 * module from the bundled code.
 */
export interface AppRouteRouteModuleOptions
  extends RouteModuleOptions<AppRouteRouteDefinition, AppRouteUserlandModule> {
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
  /**
   * A reference to the request async storage.
   */
  public readonly requestAsyncStorage = requestAsyncStorage

  /**
   * A reference to the static generation async storage.
   */
  public readonly staticGenerationAsyncStorage = staticGenerationAsyncStorage

  /**
   * An interface to call server hooks which interact with the underlying
   * storage.
   */
  public readonly serverHooks = serverHooks

  /**
   * An interface to call header hooks which interact with the underlying
   * request storage.
   */
  public readonly headerHooks = headerHooks

  /**
   * An interface to call static generation bailout hooks which interact with
   * the underlying static generation storage.
   */
  public readonly staticGenerationBailout = staticGenerationBailout

  public static readonly sharedModules = sharedModules

  /**
   * A reference to the mutation related async storage, such as mutations of
   * cookies.
   */
  public readonly actionAsyncStorage = actionAsyncStorage

  public readonly resolvedPagePath: string
  public readonly nextConfigOutput: NextConfig['output'] | undefined

  private readonly methods: Record<HTTP_METHOD, AppRouteHandlerFn>
  private readonly nonStaticMethods: ReadonlyArray<HTTP_METHOD> | false
  private readonly dynamic: AppRouteUserlandModule['dynamic']

  constructor({
    userland,
    definition,
    resolvedPagePath,
    nextConfigOutput,
  }: AppRouteRouteModuleOptions) {
    super({ userland, definition })

    this.resolvedPagePath = resolvedPagePath
    this.nextConfigOutput = nextConfigOutput

    // Automatically implement some methods if they aren't implemented by the
    // userland module.
    this.methods = autoImplementMethods(userland)

    // Get the non-static methods for this route.
    this.nonStaticMethods = getNonStaticMethods(userland)

    // Get the dynamic property from the userland module.
    this.dynamic = this.userland.dynamic
    if (this.nextConfigOutput === 'export') {
      if (!this.dynamic || this.dynamic === 'auto') {
        this.dynamic = 'error'
      } else if (this.dynamic === 'force-dynamic') {
        throw new Error(
          `export const dynamic = "force-dynamic" on page "${definition.pathname}" cannot be used with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export`
        )
      }
    }

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

    // Return the handler.
    return this.methods[method]
  }

  /**
   * Executes the route handler.
   */
  private async execute(
    request: NextRequest,
    context: AppRouteRouteHandlerContext
  ): Promise<Response> {
    // Get the handler function for the given method.
    const handler = this.resolve(request.method)

    // Get the context for the request.
    const requestContext: RequestContext = {
      req: request,
    }

    // TODO: types for renderOpts should include previewProps
    ;(requestContext as any).renderOpts = {
      previewProps: context.prerenderManifest.preview,
    }

    // Get the context for the static generation.
    const staticGenerationContext: StaticGenerationContext = {
      urlPathname: request.nextUrl.pathname,
      renderOpts: context.renderOpts,
    }

    // Add the fetchCache option to the renderOpts.
    staticGenerationContext.renderOpts.fetchCache = this.userland.fetchCache

    // Run the handler with the request AsyncLocalStorage to inject the helper
    // support. We set this to `unknown` because the type is not known until
    // runtime when we do a instanceof check below.
    const response: unknown = await this.actionAsyncStorage.run(
      {
        isAppRoute: true,
        isAction: getIsServerAction(request),
      },
      () =>
        RequestAsyncStorageWrapper.wrap(
          this.requestAsyncStorage,
          requestContext,
          () =>
            StaticGenerationAsyncStorageWrapper.wrap(
              this.staticGenerationAsyncStorage,
              staticGenerationContext,
              (staticGenerationStore) => {
                // Check to see if we should bail out of static generation based on
                // having non-static methods.
                if (this.nonStaticMethods) {
                  this.staticGenerationBailout(
                    `non-static methods used ${this.nonStaticMethods.join(
                      ', '
                    )}`
                  )
                }

                // Update the static generation store based on the dynamic property.
                switch (this.dynamic) {
                  case 'force-dynamic':
                    // The dynamic property is set to force-dynamic, so we should
                    // force the page to be dynamic.
                    staticGenerationStore.forceDynamic = true
                    this.staticGenerationBailout(`force-dynamic`, {
                      dynamic: this.dynamic,
                    })
                    break
                  case 'force-static':
                    // The dynamic property is set to force-static, so we should
                    // force the page to be static.
                    staticGenerationStore.forceStatic = true
                    break
                  case 'error':
                    // The dynamic property is set to error, so we should throw an
                    // error if the page is being statically generated.
                    staticGenerationStore.dynamicShouldError = true
                    break
                  default:
                    break
                }

                // If the static generation store does not have a revalidate value
                // set, then we should set it the revalidate value from the userland
                // module or default to false.
                staticGenerationStore.revalidate ??=
                  this.userland.revalidate ?? false

                // Wrap the request so we can add additional functionality to cases
                // that might change it's output or affect the rendering.
                const wrappedRequest = proxyRequest(
                  request,
                  { dynamic: this.dynamic },
                  {
                    headerHooks: this.headerHooks,
                    serverHooks: this.serverHooks,
                    staticGenerationBailout: this.staticGenerationBailout,
                  }
                )

                // TODO: propagate this pathname from route matcher
                const route = getPathnameFromAbsolutePath(this.resolvedPagePath)
                getTracer().getRootSpanAttributes()?.set('next.route', route)
                return getTracer().trace(
                  AppRouteRouteHandlersSpan.runHandler,
                  {
                    spanName: `executing api route (app) ${route}`,
                    attributes: {
                      'next.route': route,
                    },
                  },
                  async () => {
                    // Patch the global fetch.
                    patchFetch({
                      serverHooks: this.serverHooks,
                      staticGenerationAsyncStorage:
                        this.staticGenerationAsyncStorage,
                    })
                    const res = await handler(wrappedRequest, {
                      params: context.params
                        ? parsedUrlQueryToParams(context.params)
                        : undefined,
                    })
                    if (!(res instanceof Response)) {
                      throw new Error(
                        `No response is returned from route handler '${this.resolvedPagePath}'. Ensure you return a \`Response\` or a \`NextResponse\` in all branches of your handler.`
                      )
                    }
                    ;(context.renderOpts as any).fetchMetrics =
                      staticGenerationStore.fetchMetrics

                    context.renderOpts.waitUntil = Promise.all(
                      Object.values(
                        staticGenerationStore.pendingRevalidates || []
                      )
                    )

                    addImplicitTags(staticGenerationStore)
                    ;(context.renderOpts as any).fetchTags =
                      staticGenerationStore.tags?.join(',')

                    // It's possible cookies were set in the handler, so we need
                    // to merge the modified cookies and the returned response
                    // here.
                    const requestStore = this.requestAsyncStorage.getStore()
                    if (requestStore && requestStore.mutableCookies) {
                      const headers = new Headers(res.headers)
                      if (
                        appendMutableCookies(
                          headers,
                          requestStore.mutableCookies
                        )
                      ) {
                        return new Response(res.body, {
                          status: res.status,
                          statusText: res.statusText,
                          headers,
                        })
                      }
                    }

                    return res
                  }
                )
              }
            )
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
      // const initUrl = getRequestMeta(req, 'initURL')!
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
    request: NextRequest,
    context: AppRouteRouteHandlerContext
  ): Promise<Response> {
    try {
      // Execute the route to get the response.
      const response = await this.execute(request, context)

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
