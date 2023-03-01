import { isNotFoundError } from '../../../client/components/not-found'
import {
  getURLFromRedirectError,
  isRedirectError,
} from '../../../client/components/redirect'
import type {
  RequestAsyncStorage,
  RequestStore,
} from '../../../client/components/request-async-storage'
import type { Params } from '../../../shared/lib/router/utils/route-matcher'
import type { AsyncStorageWrapper } from '../../async-storage/async-storage-wrapper'
import {
  RequestAsyncStorageWrapper,
  type RequestContext,
} from '../../async-storage/request-async-storage-wrapper'
import type { BaseNextRequest, BaseNextResponse } from '../../base-http'
import type { NodeNextRequest, NodeNextResponse } from '../../base-http/node'
import { getRequestMeta } from '../../request-meta'
import {
  handleBadRequestResponse,
  handleInternalServerErrorResponse,
  handleMethodNotAllowedResponse,
  handleNotFoundResponse,
  handleTemporaryRedirectResponse,
} from '../helpers/response-handlers'
import { AppRouteRouteMatch } from '../route-matches/app-route-route-match'
import { HTTP_METHOD, isHTTPMethod } from '../../web/http'
import { NextRequest } from '../../web/spec-extension/request'
import { fromNodeHeaders } from '../../web/utils'
import type { ModuleLoader } from '../helpers/module-loader/module-loader'
import { RouteHandler } from './route-handler'
import * as Log from '../../../build/output/log'
import { patchFetch } from '../../lib/patch-fetch'
import {
  StaticGenerationAsyncStorage,
  StaticGenerationStore,
} from '../../../client/components/static-generation-async-storage'
import { StaticGenerationAsyncStorageWrapper } from '../../async-storage/static-generation-async-storage-wrapper'
import { IncrementalCache } from '../../lib/incremental-cache'
import { AppConfig } from '../../../build/utils'

// TODO-APP: This module has a dynamic require so when bundling for edge it causes issues.
const NodeModuleLoader =
  process.env.NEXT_RUNTIME !== 'edge'
    ? require('../helpers/module-loader/node-module-loader').NodeModuleLoader
    : class {}

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
  ctx: { params?: Params }
) => Response

/**
 * AppRouteModule is the specific userland module that is exported. This will
 * contain the HTTP methods that this route can respond to.
 */
export type AppRouteModule = {
  /**
   * Contains all the exported userland code.
   */
  handlers: Record<HTTP_METHOD, AppRouteHandlerFn> &
    Record<'dynamic', AppConfig['dynamic']> &
    Record<'revalidate', AppConfig['revalidate']>

  /**
   * The exported async storage object for this worker/module.
   */
  requestAsyncStorage: RequestAsyncStorage

  /**
   * The absolute path to the module file
   */
  resolvedPagePath: string

  staticGenerationAsyncStorage: StaticGenerationAsyncStorage

  serverHooks: typeof import('../../../client/components/hooks-server-context')

  headerHooks: typeof import('../../../client/components/headers')

  staticGenerationBailout: typeof import('../../../client/components/static-generation-bailout').staticGenerationBailout
}

export type StaticGenerationContext = {
  incrementalCache?: IncrementalCache
  supportsDynamicHTML: boolean
}

/**
 * Wraps the base next request to a request compatible with the app route
 * signature.
 *
 * @param req base request to adapt for use with app routes
 * @returns the wrapped request.
 */
function wrapRequest(req: BaseNextRequest): Request {
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

function resolveHandlerError(err: any, bubbleResult?: boolean): Response {
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

  if (bubbleResult) {
    throw err
  }
  // TODO: validate the correct handling behavior
  Log.error(err)
  return handleInternalServerErrorResponse()
}

export async function sendResponse(
  req: BaseNextRequest,
  res: BaseNextResponse,
  response: Response
): Promise<void> {
  // Don't use in edge runtime
  if (process.env.NEXT_RUNTIME !== 'edge') {
    // Copy over the response status.
    res.statusCode = response.status
    res.statusMessage = response.statusText

    // Copy over the response headers.
    response.headers?.forEach((value, name) => {
      // The append handling is special cased for `set-cookie`.
      if (name.toLowerCase() === 'set-cookie') {
        res.setHeader(name, value)
      } else {
        res.appendHeader(name, value)
      }
    })

    /**
     * The response can't be directly piped to the underlying response. The
     * following is duplicated from the edge runtime handler.
     *
     * See packages/next/server/next-server.ts
     */

    const originalResponse = (res as NodeNextResponse).originalResponse

    // A response body must not be sent for HEAD requests. See https://httpwg.org/specs/rfc9110.html#HEAD
    if (response.body && req.method !== 'HEAD') {
      const { consumeUint8ArrayReadableStream } =
        require('next/dist/compiled/edge-runtime') as typeof import('next/dist/compiled/edge-runtime')
      const iterator = consumeUint8ArrayReadableStream(response.body)
      try {
        for await (const chunk of iterator) {
          originalResponse.write(chunk)
        }
      } finally {
        originalResponse.end()
      }
    } else {
      originalResponse.end()
    }
  }
}

export class AppRouteRouteHandler implements RouteHandler<AppRouteRouteMatch> {
  constructor(
    private readonly requestAsyncLocalStorageWrapper: AsyncStorageWrapper<
      RequestStore,
      RequestContext
    > = new RequestAsyncStorageWrapper(),
    private readonly staticAsyncLocalStorageWrapper = new StaticGenerationAsyncStorageWrapper(),
    private readonly moduleLoader: ModuleLoader = new NodeModuleLoader()
  ) {}

  private resolve(method: string, mod: AppRouteModule): AppRouteHandlerFn {
    // Ensure that the requested method is a valid method (to prevent RCE's).
    if (!isHTTPMethod(method)) return handleBadRequestResponse

    // Pull out the handlers from the app route module.
    const { handlers, resolvedPagePath } = mod

    if (process.env.NODE_ENV !== 'production') {
      // Print error in development if the exported handlers are in lowercase, only uppercase handlers are supported
      for (const invalidMethodName of [
        'get',
        'head',
        'options',
        'post',
        'put',
        'delete',
        'patch',
      ]) {
        if ((handlers as any)[invalidMethodName]) {
          Log.error(
            `Detected lowercase method '${invalidMethodName}' in '${resolvedPagePath}'. Export the uppercase '${invalidMethodName.toUpperCase()}' method name to fix this error.`
          )
        }
      }
    }

    // Check to see if the requested method is available.
    const handler: AppRouteHandlerFn | undefined = handlers[method]
    if (handler) return handler

    /**
     * If the request got here, then it means that there was not a handler for
     * the requested method. We'll try to automatically setup some methods if
     * there's enough information to do so.
     */

    // If HEAD is not provided, but GET is, then we respond to HEAD using the
    // GET handler without the body.
    if (method === 'HEAD' && 'GET' in handlers) {
      return handlers['GET']
    }

    // If OPTIONS is not provided then implement it.
    if (method === 'OPTIONS') {
      // TODO: check if HEAD is implemented, if so, use it to add more headers

      // Get all the handler methods from the list of handlers.
      const methods = Object.keys(handlers).filter((handlerMethod) =>
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

  // TODO-APP: this is temporarily used for edge.
  public async execute(
    { params, definition }: AppRouteRouteMatch,
    module: AppRouteModule,
    req: BaseNextRequest,
    res: BaseNextResponse,
    context?: StaticGenerationContext,
    // TODO-APP: this is temporarily used for edge.
    request?: Request
  ): Promise<Response> {
    // This is added by the webpack loader, we load it directly from the module.
    const { requestAsyncStorage, staticGenerationAsyncStorage } = module

    // Get the handler function for the given method.
    const handle = this.resolve(req.method, module)

    // Run the handler with the request AsyncLocalStorage to inject the helper
    // support.
    const response = await this.requestAsyncLocalStorageWrapper.wrap(
      requestAsyncStorage,
      {
        req: (req as NodeNextRequest).originalRequest,
        res: (res as NodeNextResponse).originalResponse,
      },
      () =>
        this.staticAsyncLocalStorageWrapper.wrap(
          staticGenerationAsyncStorage,
          {
            pathname: definition.pathname,
            renderOpts: context ?? {
              supportsDynamicHTML: false,
            },
          },
          () => {
            const _req = (request ? request : wrapRequest(req)) as NextRequest

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
              (name) => name in module.handlers
            )

            if (usedNonStaticHandlers.length > 0) {
              module.staticGenerationBailout(
                `non-static methods used ${usedNonStaticHandlers.join(', ')}`
              )
            }

            const staticGenerationStore =
              staticGenerationAsyncStorage.getStore() ||
              ({} as StaticGenerationStore)

            const dynamicConfig = module.handlers.dynamic
            const revalidateConfig = module.handlers.revalidate
            let defaultRevalidate: number | false = false

            if (dynamicConfig === 'force-dynamic') {
              module.staticGenerationBailout(`dynamic = 'force-dynamic'`)
            }
            if (typeof revalidateConfig !== 'undefined') {
              defaultRevalidate = revalidateConfig

              if (typeof staticGenerationStore.revalidate === 'undefined') {
                staticGenerationStore.revalidate = defaultRevalidate
              }
            }

            const handleNextUrlBailout = (prop: string | symbol) => {
              if (
                [
                  'search',
                  'searchParams',
                  'toString',
                  'href',
                  'origin',
                ].includes(prop as string)
              ) {
                module.staticGenerationBailout(`nextUrl.${prop as string}`)
              }
            }

            const wrappedNextUrl = new Proxy(_req.nextUrl, {
              get(target, prop) {
                handleNextUrlBailout(prop)
                return (target as any)[prop]
              },
              set(target, prop, value) {
                handleNextUrlBailout(prop)
                ;(target as any)[prop] = value
                return true
              },
            })

            const handleReqBailout = (prop: string | symbol) => {
              if (prop === 'headers') {
                return module.headerHooks.headers()
              }
              // if request.url is accessed directly instead of
              // request.nextUrl we bail since it includes query
              // values that can be relied on dynamically
              if (prop === 'url') {
                module.staticGenerationBailout(`request.${prop as string}`)
              }
              if (
                [
                  'body',
                  'blob',
                  'json',
                  'text',
                  'arrayBuffer',
                  'formData',
                ].includes(prop as string)
              ) {
                module.staticGenerationBailout(`request.${prop as string}`)
              }
            }

            const wrappedReq = new Proxy(_req, {
              get(target, prop) {
                handleReqBailout(prop)
                if (prop === 'nextUrl') {
                  return wrappedNextUrl
                }
                return (target as any)[prop]
              },
              set(target, prop, value) {
                handleReqBailout(prop)
                ;(target as any)[prop] = value
                return true
              },
            })
            return handle(wrappedReq, { params })
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
    match: AppRouteRouteMatch,
    req: BaseNextRequest,
    res: BaseNextResponse,
    context?: StaticGenerationContext,
    bubbleResult?: boolean
  ): Promise<any> {
    try {
      // Load the module using the module loader.
      const appRouteModule: AppRouteModule = await this.moduleLoader.load(
        match.definition.filename
      )
      patchFetch(appRouteModule)

      // Execute the route to get the response.
      const response = await this.execute(
        match,
        appRouteModule,
        req,
        res,
        context
      )

      if (bubbleResult) {
        return response
      }
      // Send the response back to the response.
      await sendResponse(req, res, response)
    } catch (err) {
      const response = resolveHandlerError(err, bubbleResult)

      if (bubbleResult) {
        return response
      }
      // Get the correct response based on the error.
      await sendResponse(req, res, response)
    }
  }
}
