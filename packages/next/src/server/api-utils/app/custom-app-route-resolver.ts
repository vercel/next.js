import { isNotFoundError } from '../../../client/components/not-found'
import {
  getURLFromRedirectError,
  isRedirectError,
} from '../../../client/components/redirect'
import { RequestAsyncStorage } from '../../../client/components/request-async-storage'
import { BaseNextRequest, BaseNextResponse } from '../../base-http'
import { NodeNextRequest, NodeNextResponse } from '../../base-http/node'
import {
  AppCustomRoute,
  AppCustomRouteContext,
  AppCustomRouteHandler,
} from '../../base-server'
import { runWithRequestAsyncStorage } from '../../run-with-request-async-storage'
import { HTTP_METHOD, isHTTPMethod } from '../../web/http'
import {
  handleBadRequestResponse,
  handleInternalServerErrorResponse,
  handleMethodNotAllowedResponse,
  handleNotFoundResponse,
  handleTemporaryRedirectResponse,
} from './handlers'
import * as Log from '../../../build/output/log'
import { getRequestMeta } from '../../request-meta'
import { NextRequest } from '../../web/spec-extension/request'
import { fromNodeHeaders } from '../../web/utils'

// TODO: document
export type CustomRouteMod = {
  /**
   * Contains all the exported userland code.
   */
  handlers: Record<HTTP_METHOD, AppCustomRouteHandler>

  /**
   * The exported async storage object for this worker/module.
   */
  requestAsyncStorage: RequestAsyncStorage
}

/**
 * Returns the handler for the given request based on the available methods on
 * the compiled route module.
 *
 * @param req the request method
 * @param mod the compiled route module
 * @returns the custom route handler for the current request
 */
function getAppCustomRouteHandler(
  req: Pick<BaseNextRequest, 'method'>,
  mod: CustomRouteMod
): AppCustomRouteHandler {
  // Ensure that the requested method is a valid method (to prevent RCE's).
  if (!isHTTPMethod(req.method)) return handleBadRequestResponse

  // Pull out the handlers from the custom route module.
  const { handlers } = mod

  // Check to see if the requested method is available.
  const handler: AppCustomRouteHandler | undefined = handlers[req.method]
  if (handler) return handler

  /**
   * If the request got here, then it means that there was not a handler for
   * the requested method. We'll try to automatically setup some methods if
   * there's enough information to do so.
   */

  // If HEAD is not provided, but GET is, then we respond to HEAD using the
  // GET handler without the body.
  if (req.method === 'HEAD' && 'GET' in handlers) {
    return handlers['GET']
  }

  // If OPTIONS is not provided then implement it.
  if (req.method === 'OPTIONS') {
    // TODO: check if HEAD is implemented, if so, use it to add more headers

    // Get all the handler methods from the list of handlers.
    const methods = Object.keys(mod.handlers).filter((method) =>
      isHTTPMethod(method)
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

    return () => new Response(null, { status: 204, headers: { Allow: allow } })
  }

  // A handler for the requested method was not found, so we should respond
  // with the method not allowed handler.
  return handleMethodNotAllowedResponse
}

function resolveHandlerError(err: any): Response {
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

  // TODO: validate the correct handling behavior
  Log.error(err)
  return handleInternalServerErrorResponse()
}

async function sendResponse(
  req: BaseNextRequest,
  res: BaseNextResponse,
  response: Response
): Promise<void> {
  // Copy over the response status.
  res.statusCode = response.status
  res.statusMessage = response.statusText

  // Copy over the response headers.
  response.headers.forEach((value, name) => {
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

function adaptRequest(req: BaseNextRequest): Request {
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

type CustomAppRouteResolver = {
  req: BaseNextRequest
  res: BaseNextResponse
  route: AppCustomRoute
  mod: CustomRouteMod
  minimalMode: boolean
}

type IntermediateResult = {
  /**
   * The response that requires additional processing.
   */
  response: Response

  /**
   * The condition for which the response required additional processing.
   */
  condition: 'rewrite'
}

export async function customAppRouteResolver({
  req,
  res,
  route,
  mod,
}: CustomAppRouteResolver): Promise<IntermediateResult | void> {
  // This is added by the webpack loader, we load it directly from the module.
  const { requestAsyncStorage } = mod

  // TODO: run any edge functions that should be ran for this invocation.

  const ctx: AppCustomRouteContext = { params: route.params }

  try {
    // Get the route handler.
    const handler = getAppCustomRouteHandler(req, mod)

    // Use the requested handler to execute the request.
    let response = await runWithRequestAsyncStorage(
      requestAsyncStorage,
      {
        req: (req as NodeNextRequest).originalRequest,
        res: (res as NodeNextResponse).originalResponse,
      },
      () => handler(adaptRequest(req), ctx)
    )

    // Validate that the response sent was the correct type.
    if (!(response instanceof Response)) {
      // TODO: validate the correct handling behavior
      response = handleInternalServerErrorResponse()
    } else if (response.headers.has('x-middleware-rewrite')) {
      // TODO-APP: re-enable support below when we can proxy these type of requests
      throw new Error(
        'NextResponse.rewrite() was used in a custom app route handler, this is not currently supported. Please remove the invocation to continue.'
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
    } else if (response.headers.get('x-middleware-next') === '1') {
      throw new Error(
        'NextResponse.next() was used in a custom app route handler, this is not supported. See here for more info: https://nextjs.org/docs/messages/next-response-next-in-custom-app-route-handler'
      )
    }

    await sendResponse(req, res, response)
  } catch (err) {
    // Get the correct response based on the error.
    await sendResponse(req, res, resolveHandlerError(err))
  }
}
