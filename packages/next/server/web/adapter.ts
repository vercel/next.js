import type { NextMiddleware, RequestData, FetchEventResult } from './types'
import type { RequestInit } from './spec-extension/request'
import { PageSignatureError } from './error'
import { fromNodeHeaders } from './utils'
import { NextFetchEvent } from './spec-extension/fetch-event'
import { NextRequest } from './spec-extension/request'
import { NextResponse } from './spec-extension/response'
import { relativizeURL } from '../../shared/lib/router/utils/relativize-url'
import { waitUntilSymbol } from './spec-extension/fetch-event'
import { NextURL } from './next-url'

export async function adapter(params: {
  handler: NextMiddleware
  page: string
  request: RequestData
}): Promise<FetchEventResult> {
  const requestUrl = new NextURL(params.request.url, {
    headers: params.request.headers,
    nextConfig: params.request.nextConfig,
  })

  // Ensure users only see page requests, never data requests.
  const buildId = requestUrl.buildId
  requestUrl.buildId = ''

  const isDataReq = params.request.headers['x-nextjs-data']

  if (isDataReq && requestUrl.pathname === '/index') {
    requestUrl.pathname = '/'
  }

  // clean-up any internal query params
  for (const key of [...requestUrl.searchParams.keys()]) {
    if (key.startsWith('__next')) {
      requestUrl.searchParams.delete(key)
    }
  }

  const request = new NextRequestHint({
    page: params.page,
    input: String(requestUrl),
    init: {
      body: params.request.body,
      geo: params.request.geo,
      headers: fromNodeHeaders(params.request.headers),
      ip: params.request.ip,
      method: params.request.method,
      nextConfig: params.request.nextConfig,
    },
  })

  /**
   * This allows to identify the request as a data request. The user doesn't
   * need to know about this property neither use it. We add it for testing
   * purposes.
   */
  if (isDataReq) {
    Object.defineProperty(request, '__isData', {
      enumerable: false,
      value: true,
    })
  }

  const event = new NextFetchEvent({ request, page: params.page })
  let response = await params.handler(request, event)

  /**
   * For rewrites we must always include the locale in the final pathname
   * so we re-create the NextURL forcing it to include it when the it is
   * an internal rewrite. Also we make sure the outgoing rewrite URL is
   * a data URL if the request was a data request.
   */
  const rewrite = response?.headers.get('x-middleware-rewrite')
  if (response && rewrite) {
    const rewriteUrl = new NextURL(rewrite, {
      forceLocale: true,
      headers: params.request.headers,
      nextConfig: params.request.nextConfig,
    })

    if (rewriteUrl.host === request.nextUrl.host) {
      rewriteUrl.buildId = buildId || rewriteUrl.buildId
      response.headers.set('x-middleware-rewrite', String(rewriteUrl))
    }

    /**
     * When the request is a data request we must show if there was a rewrite
     * with an internal header so the client knows which component to load
     * from the data request.
     */
    if (isDataReq) {
      response.headers.set(
        'x-nextjs-rewrite',
        relativizeURL(String(rewriteUrl), String(requestUrl))
      )
    }
  }

  /**
   * For redirects we will not include the locale in case when it is the
   * default and we must also make sure the outgoing URL is a data one if
   * the incoming request was a data request.
   */
  const redirect = response?.headers.get('Location')
  if (response && redirect) {
    const redirectURL = new NextURL(redirect, {
      forceLocale: false,
      headers: params.request.headers,
      nextConfig: params.request.nextConfig,
    })

    /**
     * Responses created from redirects have immutable headers so we have
     * to clone the response to be able to modify it.
     */
    response = new Response(response.body, response)

    if (redirectURL.host === request.nextUrl.host) {
      redirectURL.buildId = buildId || redirectURL.buildId
      response.headers.set('Location', String(redirectURL))
    }

    /**
     * When the request is a data request we can't use the location header as
     * it may end up with CORS error. Instead we map to an internal header so
     * the client knows the destination.
     */
    if (isDataReq) {
      response.headers.delete('Location')
      response.headers.set(
        'x-nextjs-redirect',
        relativizeURL(String(redirectURL), String(requestUrl))
      )
    }
  }

  return {
    response: response || NextResponse.next(),
    waitUntil: Promise.all(event[waitUntilSymbol]),
  }
}

export function blockUnallowedResponse(
  promise: Promise<FetchEventResult>
): Promise<FetchEventResult> {
  return promise.then((result) => {
    if (result.response?.body) {
      console.error(
        new Error(
          `A middleware can not alter response's body. Learn more: https://nextjs.org/docs/messages/returning-response-body-in-middleware`
        )
      )
      return {
        ...result,
        response: new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        }),
      }
    }
    return result
  })
}

export function enhanceGlobals() {
  // The condition is true when the "process" module is provided
  if (process !== global.process) {
    // prefer local process but global.process has correct "env"
    process.env = global.process.env
    global.process = process
  }

  // to allow building code that import but does not use node.js modules,
  // webpack will expect this function to exist in global scope
  Object.defineProperty(globalThis, '__import_unsupported', {
    value: __import_unsupported,
    enumerable: false,
    configurable: false,
  })
}

function __import_unsupported(moduleName: string) {
  const proxy: any = new Proxy(function () {}, {
    get(_obj, prop) {
      if (prop === 'then') {
        return {}
      }
      throw new Error(getUnsupportedModuleErrorMessage(moduleName))
    },
    construct() {
      throw new Error(getUnsupportedModuleErrorMessage(moduleName))
    },
    apply(_target, _this, args) {
      if (typeof args[0] === 'function') {
        return args[0](proxy)
      }
      throw new Error(getUnsupportedModuleErrorMessage(moduleName))
    },
  })
  return new Proxy({}, { get: () => proxy })
}

function getUnsupportedModuleErrorMessage(module: string) {
  // warning: if you change these messages, you must adjust how react-dev-overlay's middleware detects modules not found
  return `The edge runtime does not support Node.js '${module}' module.
Learn More: https://nextjs.org/docs/messages/node-module-in-edge-runtime`
}

class NextRequestHint extends NextRequest {
  sourcePage: string

  constructor(params: {
    init: RequestInit
    input: Request | string
    page: string
  }) {
    super(params.input, params.init)
    this.sourcePage = params.page
  }

  get request() {
    throw new PageSignatureError({ page: this.sourcePage })
  }

  respondWith() {
    throw new PageSignatureError({ page: this.sourcePage })
  }

  waitUntil() {
    throw new PageSignatureError({ page: this.sourcePage })
  }
}
