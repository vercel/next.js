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

function getAppCustomRouteHandler(
  CustomRouteMod: any,
  req: BaseNextRequest
): AppCustomRouteHandler {
  // Ensure that the requested method is a valid method (to prevent RCE's).
  if (!isHTTPMethod(req.method)) return handleBadRequestResponse

  // Pull out the handlers from the custom route module.
  const { handlers } = CustomRouteMod

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
    const methods = Object.keys(CustomRouteMod.handlers).filter((method) =>
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

type CustomAppRouteResolver = {
  req: BaseNextRequest
  res: BaseNextResponse
  route: AppCustomRoute
  CustomRouteMod: any
}

export async function customAppRouteResolver({
  req,
  res,
  route,
  CustomRouteMod,
}: CustomAppRouteResolver): Promise<void> {
  // This is added by the webpack loader, we load it directly from the module.
  const requestAsyncStorage: RequestAsyncStorage =
    CustomRouteMod.requestAsyncStorage

  // TODO: run any edge functions that should be ran for this invocation.

  const ctx: AppCustomRouteContext = { params: route.params }

  try {
    // Get the route handler.
    const handler = getAppCustomRouteHandler(CustomRouteMod, req)

    // Use the requested handler to execute the request.
    let response = await runWithRequestAsyncStorage(
      requestAsyncStorage,
      {
        req: (req as NodeNextRequest).originalRequest,
        res: (res as NodeNextResponse).originalResponse,
      },
      () => handler(req, ctx)
    )

    // Validate that the response sent was the correct type.
    if (!(response instanceof Response)) {
      // TODO: validate the correct handling behavior
      response = handleInternalServerErrorResponse()
    }

    return await sendResponse(req, res, response)
  } catch (err) {
    // Get the correct response based on the error.
    return await sendResponse(req, res, resolveHandlerError(err))
  }
}
