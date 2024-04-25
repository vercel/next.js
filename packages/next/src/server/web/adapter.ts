import type { RequestData, FetchEventResult } from './types'
import type { RequestInit } from './spec-extension/request'
import type { PrerenderManifest } from '../../build'
import { PageSignatureError } from './error'
import { fromNodeOutgoingHttpHeaders, normalizeNextQueryParam } from './utils'
import { NextFetchEvent } from './spec-extension/fetch-event'
import { NextRequest } from './spec-extension/request'
import { NextResponse } from './spec-extension/response'
import { relativizeURL } from '../../shared/lib/router/utils/relativize-url'
import { waitUntilSymbol } from './spec-extension/fetch-event'
import { NextURL } from './next-url'
import { stripInternalSearchParams } from '../internal-utils'
import { normalizeRscURL } from '../../shared/lib/router/utils/app-paths'
import { FLIGHT_PARAMETERS } from '../../client/components/app-router-headers'
import { ensureInstrumentationRegistered } from './globals'
import { RequestAsyncStorageWrapper } from '../async-storage/request-async-storage-wrapper'
import { requestAsyncStorage } from '../../client/components/request-async-storage.external'
import { getTracer } from '../lib/trace/tracer'
import type { TextMapGetter } from 'next/dist/compiled/@opentelemetry/api'
import { MiddlewareSpan } from '../lib/trace/constants'

export class NextRequestHint extends NextRequest {
  sourcePage: string
  fetchMetrics?: FetchEventResult['fetchMetrics']

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

const headersGetter: TextMapGetter<Headers> = {
  keys: (headers) => Array.from(headers.keys()),
  get: (headers, key) => headers.get(key) ?? undefined,
}

export type AdapterOptions = {
  handler: (req: NextRequestHint, event: NextFetchEvent) => Promise<Response>
  page: string
  request: RequestData
  IncrementalCache?: typeof import('../lib/incremental-cache').IncrementalCache
}

let propagator: <T>(request: NextRequestHint, fn: () => T) => T = (
  request,
  fn
) => {
  const tracer = getTracer()
  return tracer.withPropagatedContext(request.headers, fn, headersGetter)
}

let testApisIntercepted = false

function ensureTestApisIntercepted() {
  if (!testApisIntercepted) {
    testApisIntercepted = true
    if (process.env.NEXT_PRIVATE_TEST_PROXY === 'true') {
      const {
        interceptTestApis,
        wrapRequestHandler,
      } = require('next/dist/experimental/testmode/server-edge')
      interceptTestApis()
      propagator = wrapRequestHandler(propagator)
    }
  }
}

export async function adapter(
  params: AdapterOptions
): Promise<FetchEventResult> {
  ensureTestApisIntercepted()
  await ensureInstrumentationRegistered()

  // TODO-APP: use explicit marker for this
  const isEdgeRendering = typeof self.__BUILD_MANIFEST !== 'undefined'
  const prerenderManifest: PrerenderManifest | undefined =
    typeof self.__PRERENDER_MANIFEST === 'string'
      ? JSON.parse(self.__PRERENDER_MANIFEST)
      : undefined

  params.request.url = normalizeRscURL(params.request.url)

  const requestUrl = new NextURL(params.request.url, {
    headers: params.request.headers,
    nextConfig: params.request.nextConfig,
  })

  // Iterator uses an index to keep track of the current iteration. Because of deleting and appending below we can't just use the iterator.
  // Instead we use the keys before iteration.
  const keys = [...requestUrl.searchParams.keys()]
  for (const key of keys) {
    const value = requestUrl.searchParams.getAll(key)

    normalizeNextQueryParam(key, (normalizedKey) => {
      requestUrl.searchParams.delete(normalizedKey)

      for (const val of value) {
        requestUrl.searchParams.append(normalizedKey, val)
      }
      requestUrl.searchParams.delete(key)
    })
  }

  // Ensure users only see page requests, never data requests.
  const buildId = requestUrl.buildId
  requestUrl.buildId = ''

  const isDataReq = params.request.headers['x-nextjs-data']

  if (isDataReq && requestUrl.pathname === '/index') {
    requestUrl.pathname = '/'
  }

  const requestHeaders = fromNodeOutgoingHttpHeaders(params.request.headers)
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

  const normalizeUrl = process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE
    ? new URL(params.request.url)
    : requestUrl

  const request = new NextRequestHint({
    page: params.page,
    // Strip internal query parameters off the request.
    input: stripInternalSearchParams(normalizeUrl, true).toString(),
    init: {
      body: params.request.body,
      geo: params.request.geo,
      headers: requestHeaders,
      ip: params.request.ip,
      method: params.request.method,
      nextConfig: params.request.nextConfig,
      signal: params.request.signal,
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
  let response
  let cookiesFromResponse

  response = await propagator(request, () => {
    // we only care to make async storage available for middleware
    const isMiddleware =
      params.page === '/middleware' || params.page === '/src/middleware'
    if (isMiddleware) {
      return getTracer().trace(
        MiddlewareSpan.execute,
        {
          spanName: `middleware ${request.method} ${request.nextUrl.pathname}`,
          attributes: {
            'http.target': request.nextUrl.pathname,
            'http.method': request.method,
          },
        },
        () =>
          RequestAsyncStorageWrapper.wrap(
            requestAsyncStorage,
            {
              req: request,
              renderOpts: {
                onUpdateCookies: (cookies) => {
                  cookiesFromResponse = cookies
                },
                // @ts-expect-error: TODO: investigate why previewProps isn't on RenderOpts
                previewProps: prerenderManifest?.preview || {
                  previewModeId: 'development-id',
                  previewModeEncryptionKey: '',
                  previewModeSigningKey: '',
                },
                waitUntil: event.waitUntil.bind(event),
                experimental: params.request.nextConfig?.experimental,
              },
            },
            () => params.handler(request, event)
          )
      )
    }
    return params.handler(request, event)
  })

  // check if response is a Response object
  if (response && !(response instanceof Response)) {
    throw new TypeError('Expected an instance of Response to be returned')
  }

  if (response && cookiesFromResponse) {
    response.headers.set('set-cookie', cookiesFromResponse)
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
    fetchMetrics: request.fetchMetrics,
  }
}
