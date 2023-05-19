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
import { stripInternalSearchParams } from '../internal-utils'
import { normalizeRscPath } from '../../shared/lib/router/utils/app-paths'
import {
  FETCH_CACHE_HEADER,
  NEXT_ROUTER_PREFETCH,
  NEXT_ROUTER_STATE_TREE,
  RSC,
} from '../../client/components/app-router-headers'
import { NEXT_QUERY_PARAM_PREFIX } from '../../lib/constants'

declare const _ENTRIES: any

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

const FLIGHT_PARAMETERS = [
  [RSC],
  [NEXT_ROUTER_STATE_TREE],
  [NEXT_ROUTER_PREFETCH],
  [FETCH_CACHE_HEADER],
] as const

export type AdapterOptions = {
  handler: NextMiddleware
  page: string
  request: RequestData
  IncrementalCache?: typeof import('../lib/incremental-cache').IncrementalCache
}

async function registerInstrumentation() {
  if (
    '_ENTRIES' in globalThis &&
    _ENTRIES.middleware_instrumentation &&
    _ENTRIES.middleware_instrumentation.register
  ) {
    try {
      await _ENTRIES.middleware_instrumentation.register()
    } catch (err: any) {
      err.message = `An error occurred while loading instrumentation hook: ${err.message}`
      throw err
    }
  }
}

let registerInstrumentationPromise: Promise<void> | null = null
function ensureInstrumentationRegistered() {
  if (!registerInstrumentationPromise) {
    registerInstrumentationPromise = registerInstrumentation()
  }
  return registerInstrumentationPromise
}

export async function adapter(
  params: AdapterOptions
): Promise<FetchEventResult> {
  await ensureInstrumentationRegistered()

  // TODO-APP: use explicit marker for this
  const isEdgeRendering = typeof self.__BUILD_MANIFEST !== 'undefined'

  params.request.url = normalizeRscPath(params.request.url, true)

  const requestUrl = new NextURL(params.request.url, {
    headers: params.request.headers,
    nextConfig: params.request.nextConfig,
  })

  // Iterator uses an index to keep track of the current iteration. Because of deleting and appending below we can't just use the iterator.
  // Instead we use the keys before iteration.
  const keys = [...requestUrl.searchParams.keys()]
  for (const key of keys) {
    const value = requestUrl.searchParams.getAll(key)

    if (
      key !== NEXT_QUERY_PARAM_PREFIX &&
      key.startsWith(NEXT_QUERY_PARAM_PREFIX)
    ) {
      const normalizedKey = key.substring(NEXT_QUERY_PARAM_PREFIX.length)
      requestUrl.searchParams.delete(normalizedKey)

      for (const val of value) {
        requestUrl.searchParams.append(normalizedKey, val)
      }
      requestUrl.searchParams.delete(key)
    }
  }

  // Ensure users only see page requests, never data requests.
  const buildId = requestUrl.buildId
  requestUrl.buildId = ''

  const isDataReq = params.request.headers['x-nextjs-data']

  if (isDataReq && requestUrl.pathname === '/index') {
    requestUrl.pathname = '/'
  }

  const requestHeaders = fromNodeHeaders(params.request.headers)
  const flightHeaders = new Map()
  // Parameters should only be stripped for middleware
  if (!isEdgeRendering) {
    for (const param of FLIGHT_PARAMETERS) {
      const key = param.toString().toLowerCase()
      const value = requestHeaders.get(key)
      if (value) {
        flightHeaders.set(key, requestHeaders.get(key))
        requestHeaders.delete(key)
      }
    }
  }

  // Strip internal query parameters off the request.
  stripInternalSearchParams(requestUrl.searchParams, true)

  const request = new NextRequestHint({
    page: params.page,
    input: process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE
      ? params.request.url
      : String(requestUrl),
    init: {
      body: params.request.body,
      geo: params.request.geo,
      headers: requestHeaders,
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

  if (
    !(globalThis as any).__incrementalCache &&
    (params as any).IncrementalCache
  ) {
    ;(globalThis as any).__incrementalCache = new (
      params as any
    ).IncrementalCache({
      appDir: true,
      fetchCache: true,
      minimalMode: process.env.NODE_ENV !== 'development',
      fetchCacheKeyPrefix: process.env.__NEXT_FETCH_CACHE_KEY_PREFIX,
      dev: process.env.NODE_ENV === 'development',
      requestHeaders: params.request.headers as any,
      requestProtocol: 'https',
      getPrerenderManifest: () => {
        return {
          version: -1 as any, // letting us know this doesn't conform to spec
          routes: {},
          dynamicRoutes: {},
          notFoundRoutes: [],
          preview: {
            previewModeId: 'development-id',
          } as any, // `preview` is special case read in next-dev-server
        }
      },
    })
  }

  const event = new NextFetchEvent({ request, page: params.page })
  let response = await params.handler(request, event)

  // check if response is a Response object
  if (response && !(response instanceof Response)) {
    throw new TypeError('Expected an instance of Response to be returned')
  }

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

    if (!process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE) {
      if (rewriteUrl.host === request.nextUrl.host) {
        rewriteUrl.buildId = buildId || rewriteUrl.buildId
        response.headers.set('x-middleware-rewrite', String(rewriteUrl))
      }
    }

    /**
     * When the request is a data request we must show if there was a rewrite
     * with an internal header so the client knows which component to load
     * from the data request.
     */
    const relativizedRewrite = relativizeURL(
      String(rewriteUrl),
      String(requestUrl)
    )

    if (
      isDataReq &&
      // if the rewrite is external and external rewrite
      // resolving config is enabled don't add this header
      // so the upstream app can set it instead
      !(
        process.env.__NEXT_EXTERNAL_MIDDLEWARE_REWRITE_RESOLVE &&
        relativizedRewrite.match(/http(s)?:\/\//)
      )
    ) {
      response.headers.set('x-nextjs-rewrite', relativizedRewrite)
    }
  }

  /**
   * For redirects we will not include the locale in case when it is the
   * default and we must also make sure the outgoing URL is a data one if
   * the incoming request was a data request.
   */
  const redirect = response?.headers.get('Location')
  if (response && redirect && !isEdgeRendering) {
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

    if (!process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE) {
      if (redirectURL.host === request.nextUrl.host) {
        redirectURL.buildId = buildId || redirectURL.buildId
        response.headers.set('Location', String(redirectURL))
      }
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

  const finalResponse = response ? response : NextResponse.next()

  // Flight headers are not overridable / removable so they are applied at the end.
  const middlewareOverrideHeaders = finalResponse.headers.get(
    'x-middleware-override-headers'
  )
  const overwrittenHeaders: string[] = []
  if (middlewareOverrideHeaders) {
    for (const [key, value] of flightHeaders) {
      finalResponse.headers.set(`x-middleware-request-${key}`, value)
      overwrittenHeaders.push(key)
    }

    if (overwrittenHeaders.length > 0) {
      finalResponse.headers.set(
        'x-middleware-override-headers',
        middlewareOverrideHeaders + ',' + overwrittenHeaders.join(',')
      )
    }
  }

  return {
    response: finalResponse,
    waitUntil: Promise.all(event[waitUntilSymbol]),
  }
}

function getUnsupportedModuleErrorMessage(module: string) {
  // warning: if you change these messages, you must adjust how react-dev-overlay's middleware detects modules not found
  return `The edge runtime does not support Node.js '${module}' module.
Learn More: https://nextjs.org/docs/messages/node-module-in-edge-runtime`
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

  // Eagerly fire instrumentation hook to make the startup faster.
  void ensureInstrumentationRegistered()
}
