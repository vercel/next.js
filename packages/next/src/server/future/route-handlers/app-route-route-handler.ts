import type { Params } from '../../../shared/lib/router/utils/route-matcher'
import type { HandlerModule } from '../route-handler-managers/route-handler-manager'
import type { NextConfig } from '../../config-shared'
import type { AppRouteRouteDefinition } from '../route-definitions/app-route-route-definition'
import type { AppConfig } from '../../../build/utils'
import type { RequestAsyncStorage } from '../../../client/components/request-async-storage'
import type { StaticGenerationAsyncStorage } from '../../../client/components/static-generation-async-storage'
import type * as ServerHooks from '../../../client/components/hooks-server-context'
import type * as HeaderHooks from '../../../client/components/headers'
import type { staticGenerationBailout as StaticGenerationBailout } from '../../../client/components/static-generation-bailout'
import type { WebNextRequest } from '../../base-http/web'

import {
  RequestAsyncStorageWrapper,
  type RequestContext,
} from '../../async-storage/request-async-storage-wrapper'
import {
  StaticGenerationAsyncStorageWrapper,
  type StaticGenerationContext,
} from '../../async-storage/static-generation-async-storage-wrapper'
import { isNotFoundError } from '../../../client/components/not-found'
import {
  getURLFromRedirectError,
  isRedirectError,
} from '../../../client/components/redirect'
import { BaseNextRequest } from '../../base-http'
import { NodeNextRequest } from '../../base-http/node'
import { getRequestMeta } from '../../request-meta'
import {
  handleBadRequestResponse,
  handleInternalServerErrorResponse,
  handleMethodNotAllowedResponse,
  handleNotFoundResponse,
  handleTemporaryRedirectResponse,
} from '../helpers/response-handlers'
import { HTTP_METHOD, HTTP_METHODS, isHTTPMethod } from '../../web/http'
import { NextRequest } from '../../web/spec-extension/request'
import { fromNodeHeaders } from '../../web/utils'
import { RouteHandler, RouteHandlerContext } from './route-handler'
import * as Log from '../../../build/output/log'
import { patchFetch } from '../../lib/patch-fetch'
import { RequestCookies } from 'next/dist/compiled/@edge-runtime/cookies'
import { NextURL } from '../../web/next-url'
import { getTracer } from '../../lib/trace/tracer'
import { AppRouteRouteHandlersSpan } from '../../lib/trace/constants'

/**
 * AppRouteRouteHandlerContext is the context that is passed to the route
 * handler for app routes.
 */
export interface AppRouteRouteHandlerContext extends RouteHandlerContext {
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

/**
 * AppRouteModule is the module definition for the available exports from the
 * compiled app route module.
 */
export type AppRouteModule = HandlerModule<
  AppRouteRouteDefinition,
  AppRouteRouteHandler,
  AppRouteUserlandModule
>

/**
 * Wraps the base next request to a request compatible with the app route
 * signature.
 *
 * @param req base request to adapt for use with app routes
 * @returns the wrapped request.
 */
function wrapRequest(req: BaseNextRequest): NextRequest {
  const { originalRequest } = req as NodeNextRequest

  const url = getRequestMeta(originalRequest, '__NEXT_INIT_URL')
  if (!url) throw new Error('Invariant: missing url on request')

  // HEAD and GET requests can not have a body.
  const body: BodyInit | null | undefined =
    req.method !== 'GET' && req.method !== 'HEAD' && req.body ? req.body : null

  return new NextRequest(url, {
    body,
    // @ts-expect-error - see https://github.com/whatwg/fetch/pull/1457
    duplex: 'half',
    method: req.method,
    headers: fromNodeHeaders(req.headers),
  })
}

function resolveHandlerError(err: any): Response | false {
  if (isRedirectError(err)) {
    const redirect = getURLFromRedirectError(err)
    if (!redirect) {
      throw new Error('Invariant: Unexpected redirect url format')
    }

    // This is a redirect error! Send the redirect response.
    return handleTemporaryRedirectResponse(redirect)
  }

  if (isNotFoundError(err)) {
    // This is a not found error! Send the not found response.
    return handleNotFoundResponse()
  }

  // Return false to indicate that this is not a handled error.
  return false
}

function cleanURL(urlString: string): string {
  const url = new URL(urlString)
  url.host = 'localhost:3000'
  url.search = ''
  url.protocol = 'http'
  return url.toString()
}

function proxyRequest(
  req: NextRequest | Request,
  { dynamic }: Pick<AppRouteUserlandModule, 'dynamic'>,
  hooks: {
    readonly serverHooks: typeof ServerHooks
    readonly headerHooks: typeof HeaderHooks
    readonly staticGenerationBailout: typeof StaticGenerationBailout
  }
): Request {
  function handleNextUrlBailout(prop: string | symbol) {
    switch (prop) {
      case 'search':
      case 'searchParams':
      case 'toString':
      case 'href':
      case 'origin':
        hooks.staticGenerationBailout(`nextUrl.${prop as string}`)
        return
      default:
        return
    }
  }

  const cache: {
    url?: string
    toString?: () => string
    headers?: Headers
    cookies?: RequestCookies
    searchParams?: URLSearchParams
  } = {}

  const handleForceStatic = (url: string, prop: string) => {
    switch (prop) {
      case 'search':
        return ''
      case 'searchParams':
        if (!cache.searchParams) cache.searchParams = new URLSearchParams()

        return cache.searchParams
      case 'url':
      case 'href':
        if (!cache.url) cache.url = cleanURL(url)

        return cache.url
      case 'toJSON':
      case 'toString':
        if (!cache.url) cache.url = cleanURL(url)
        if (!cache.toString) cache.toString = () => cache.url!

        return cache.toString
      case 'headers':
        if (!cache.headers) cache.headers = new Headers()

        return cache.headers
      case 'cookies':
        if (!cache.headers) cache.headers = new Headers()
        if (!cache.cookies) cache.cookies = new RequestCookies(cache.headers)

        return cache.cookies
      case 'clone':
        if (!cache.url) cache.url = cleanURL(url)

        return () => new NextURL(cache.url!)
      default:
        break
    }
  }

  const wrappedNextUrl =
    'nextUrl' in req
      ? new Proxy(req.nextUrl, {
          get(target, prop) {
            handleNextUrlBailout(prop)

            if (dynamic === 'force-static' && typeof prop === 'string') {
              const result = handleForceStatic(target.href, prop)
              if (result !== undefined) return result
            }
            const value = (target as any)[prop]

            if (typeof value === 'function') {
              return value.bind(target)
            }
            return value
          },
          set(target, prop, value) {
            handleNextUrlBailout(prop)
            ;(target as any)[prop] = value
            return true
          },
        })
      : undefined

  const handleReqBailout = (prop: string | symbol) => {
    switch (prop) {
      case 'headers':
        hooks.headerHooks.headers()
        return
      // if request.url is accessed directly instead of
      // request.nextUrl we bail since it includes query
      // values that can be relied on dynamically
      case 'url':
      case 'body':
      case 'blob':
      case 'json':
      case 'text':
      case 'arrayBuffer':
      case 'formData':
        hooks.staticGenerationBailout(`request.${prop}`)
        return
      default:
        return
    }
  }

  return new Proxy(req, {
    get(target, prop) {
      handleReqBailout(prop)

      if (prop === 'nextUrl') {
        return wrappedNextUrl
      }

      if (dynamic === 'force-static' && typeof prop === 'string') {
        const result = handleForceStatic(target.url, prop)
        if (result !== undefined) return result
      }
      const value: any = (target as any)[prop]

      if (typeof value === 'function') {
        return value.bind(target)
      }
      return value
    },
    set(target, prop, value) {
      handleReqBailout(prop)
      ;(target as any)[prop] = value
      return true
    },
  })
}

function getPathnameFromAbsolutePath(absolutePath: string) {
  // Remove prefix including app dir
  let appDir = '/app/'
  if (!absolutePath.includes(appDir)) {
    appDir = '\\app\\'
  }
  const [, ...parts] = absolutePath.split(appDir)
  const relativePath = appDir[0] + parts.join(appDir)

  // remove extension
  const pathname = relativePath.split('.').slice(0, -1).join('.')
  return pathname
}

/**
 * Validate that the module is exporting methods supported by the handler.
 *
 * @param mod the module to validate
 */
function validateModule(
  userland: Readonly<AppRouteUserlandModule>,
  resolvedPagePath: string
) {
  // Print error in development if the exported handlers are in lowercase, only
  // uppercase handlers are supported.
  const lowercased = HTTP_METHODS.map((method) => method.toLowerCase())
  for (const method of lowercased) {
    if (method in userland) {
      Log.error(
        `Detected lowercase method '${method}' in '${resolvedPagePath}'. Export the uppercase '${method.toUpperCase()}' method name to fix this error.`
      )
    }
  }

  // Print error if the module exports a default handler, they must use named
  // exports for each HTTP method.
  if ('default' in userland) {
    Log.error(
      `Detected default export in '${resolvedPagePath}'. Export a named export for each HTTP method instead.`
    )
  }

  // If there is no methods exported by this module, then return a not found
  // response.
  if (!HTTP_METHODS.some((method) => method in userland)) {
    Log.error(
      `No HTTP methods exported in '${resolvedPagePath}'. Export a named export for each HTTP method.`
    )
  }
}

export interface AppRouteRouteHandlerOptions {
  readonly definition: AppRouteRouteDefinition
  readonly userland: AppRouteUserlandModule
  readonly resolvedPagePath: string
  readonly nextConfigOutput: NextConfig['output']

  // The following are included so that the external packages can call the
  // correct instance of the storage/hooks objects.

  readonly requestAsyncStorage: RequestAsyncStorage
  readonly staticGenerationAsyncStorage: StaticGenerationAsyncStorage
  readonly serverHooks: typeof ServerHooks
  readonly headerHooks: typeof HeaderHooks
  readonly staticGenerationBailout: typeof StaticGenerationBailout
}

export class AppRouteRouteHandler implements RouteHandler {
  private readonly definition: AppRouteRouteDefinition
  private readonly userland: AppRouteUserlandModule
  private readonly resolvedPagePath: string
  private readonly nextConfigOutput: NextConfig['output']

  // The following are included so that the external packages can call the
  // correct instance of the storage/hooks objects.

  private readonly requestAsyncStorage: RequestAsyncStorage
  private readonly staticGenerationAsyncStorage: StaticGenerationAsyncStorage
  private readonly serverHooks: typeof ServerHooks
  private readonly headerHooks: typeof HeaderHooks
  private readonly staticGenerationBailout: typeof StaticGenerationBailout

  constructor({
    definition,
    userland,
    resolvedPagePath,
    nextConfigOutput,
    requestAsyncStorage,
    staticGenerationAsyncStorage,
    serverHooks,
    headerHooks,
    staticGenerationBailout,
  }: AppRouteRouteHandlerOptions) {
    this.definition = definition
    this.userland = userland
    this.resolvedPagePath = resolvedPagePath
    this.nextConfigOutput = nextConfigOutput

    this.requestAsyncStorage = requestAsyncStorage
    this.staticGenerationAsyncStorage = staticGenerationAsyncStorage
    this.serverHooks = serverHooks
    this.headerHooks = headerHooks
    this.staticGenerationBailout = staticGenerationBailout
  }

  private resolve(method: string): AppRouteHandlerFn {
    // Ensure that the requested method is a valid method (to prevent RCE's).
    if (!isHTTPMethod(method)) return handleBadRequestResponse

    // If we're in development, then validate the module.
    if (process.env.NODE_ENV !== 'production') {
      validateModule(this.userland, this.resolvedPagePath)
    }

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

            let dynamic = this.userland.dynamic
            if (this.nextConfigOutput === 'export') {
              if (!dynamic || dynamic === 'auto') {
                dynamic = 'error'
              } else if (dynamic === 'force-dynamic') {
                throw new Error(
                  `export const dynamic = "force-dynamic" on route handler "${handle.name}" cannot be used with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export`
                )
              }
            }

            switch (dynamic) {
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
              { dynamic },
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
  /**
   * Patch will patch any global interfaces that require patching to support
   * the route handler.
   */
  public patch(): void {
    // Patch the global fetch.
    patchFetch({
      serverHooks: this.serverHooks,
      staticGenerationAsyncStorage: this.staticGenerationAsyncStorage,
    })
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
