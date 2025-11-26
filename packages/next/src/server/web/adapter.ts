import type { RequestData, FetchEventResult } from './types'
import type { RequestInit } from './spec-extension/request'
import { PageSignatureError } from './error'
import { fromNodeOutgoingHttpHeaders, normalizeNextQueryParam } from './utils'
import {
  NextFetchEvent,
  getWaitUntilPromiseFromEvent,
} from './spec-extension/fetch-event'
import { NextRequest } from './spec-extension/request'
import { NextResponse } from './spec-extension/response'
import {
  parseRelativeURL,
  getRelativeURL,
} from '../../shared/lib/router/utils/relativize-url'
import { NextURL } from './next-url'
import { stripInternalSearchParams } from '../internal-utils'
import { normalizeRscURL } from '../../shared/lib/router/utils/app-paths'
import {
  FLIGHT_HEADERS,
  NEXT_REWRITTEN_PATH_HEADER,
  NEXT_REWRITTEN_QUERY_HEADER,
  NEXT_RSC_UNION_QUERY,
  RSC_HEADER,
} from '../../client/components/app-router-headers'
import { ensureInstrumentationRegistered } from './globals'
import { createRequestStoreForAPI } from '../async-storage/request-store'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import { createWorkStore } from '../async-storage/work-store'
import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { NEXT_ROUTER_PREFETCH_HEADER } from '../../client/components/app-router-headers'
import { getTracer } from '../lib/trace/tracer'
import type { TextMapGetter } from 'next/dist/compiled/@opentelemetry/api'
import { MiddlewareSpan } from '../lib/trace/constants'
import { CloseController } from './web-on-close'
import { getEdgePreviewProps } from './get-edge-preview-props'
import { getBuiltinRequestContext } from '../after/builtin-request-context'
import { getImplicitTags } from '../lib/implicit-tags'

export class NextRequestHint extends NextRequest {
  sourcePage: string
  fetchMetrics: FetchEventResult['fetchMetrics'] | undefined

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
  incrementalCacheHandler?: typeof import('../lib/incremental-cache').CacheHandler
  bypassNextUrl?: boolean
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
      const { interceptTestApis, wrapRequestHandler } =
        // eslint-disable-next-line @next/internal/typechecked-require -- experimental/testmode is not built ins next/dist/esm
        require('next/dist/experimental/testmode/server-edge') as typeof import('../../experimental/testmode/server-edge')
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
  const isEdgeRendering =
    typeof (globalThis as any).__BUILD_MANIFEST !== 'undefined'

  params.request.url = normalizeRscURL(params.request.url)

  const requestURL = params.bypassNextUrl
    ? new URL(params.request.url)
    : new NextURL(params.request.url, {
        headers: params.request.headers,
        nextConfig: params.request.nextConfig,
      })

  // Iterator uses an index to keep track of the current iteration. Because of deleting and appending below we can't just use the iterator.
  // Instead we use the keys before iteration.
  const keys = [...requestURL.searchParams.keys()]
  for (const key of keys) {
    const value = requestURL.searchParams.getAll(key)

    const normalizedKey = normalizeNextQueryParam(key)
    if (normalizedKey) {
      requestURL.searchParams.delete(normalizedKey)
      for (const val of value) {
        requestURL.searchParams.append(normalizedKey, val)
      }
      requestURL.searchParams.delete(key)
    }
  }

  // Ensure users only see page requests, never data requests.
  let buildId = process.env.__NEXT_BUILD_ID || ''
  if ('buildId' in requestURL) {
    buildId = (requestURL as NextURL).buildId || ''
    requestURL.buildId = ''
  }

  const requestHeaders = fromNodeOutgoingHttpHeaders(params.request.headers)
  const isNextDataRequest = requestHeaders.has('x-nextjs-data')
  const isRSCRequest = requestHeaders.get(RSC_HEADER) === '1'

  if (isNextDataRequest && requestURL.pathname === '/index') {
    requestURL.pathname = '/'
  }

  const flightHeaders = new Map()

  // Headers should only be stripped for middleware
  if (!isEdgeRendering) {
    for (const header of FLIGHT_HEADERS) {
      const value = requestHeaders.get(header)
      if (value !== null) {
        flightHeaders.set(header, value)
        requestHeaders.delete(header)
      }
    }
  }

  const normalizeURL = process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE
    ? new URL(params.request.url)
    : requestURL

  const rscHash = normalizeURL.searchParams.get(NEXT_RSC_UNION_QUERY)

  const request = new NextRequestHint({
    page: params.page,
    // Strip internal query parameters off the request.
    input: stripInternalSearchParams(normalizeURL).toString(),
    init: {
      body: params.request.body,
      headers: requestHeaders,
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
  if (isNextDataRequest) {
    Object.defineProperty(request, '__isData', {
      enumerable: false,
      value: true,
    })
  }

  if (
    // If we are inside of the next start sandbox
    // leverage the shared instance if not we need
    // to create a fresh cache instance each time
    !(globalThis as any).__incrementalCacheShared &&
    (params as any).IncrementalCache
  ) {
    ;(globalThis as any).__incrementalCache = new (
      params as {
        IncrementalCache: typeof import('../lib/incremental-cache').IncrementalCache
      }
    ).IncrementalCache({
      CurCacheHandler: params.incrementalCacheHandler,
      minimalMode: process.env.NODE_ENV !== 'development',
      fetchCacheKeyPrefix: process.env.__NEXT_FETCH_CACHE_KEY_PREFIX,
      dev: process.env.NODE_ENV === 'development',
      requestHeaders: params.request.headers as any,

      getPrerenderManifest: () => {
        return {
          version: -1 as any, // letting us know this doesn't conform to spec
          routes: {},
          dynamicRoutes: {},
          notFoundRoutes: [],
          preview: getEdgePreviewProps(),
        }
      },
    })
  }

  // if we're in an edge runtime sandbox, we should use the waitUntil
  // that we receive from the enclosing NextServer
  const outerWaitUntil =
    params.request.waitUntil ?? getBuiltinRequestContext()?.waitUntil

  const event = new NextFetchEvent({
    request,
    page: params.page,
    context: outerWaitUntil ? { waitUntil: outerWaitUntil } : undefined,
  })
  let response
  let cookiesFromResponse

  response = await propagator(request, () => {
    // we only care to make async storage available for middleware
    const isMiddleware =
      params.page === '/middleware' ||
      params.page === '/src/middleware' ||
      params.page === '/proxy' ||
      params.page === '/src/proxy'

    if (isMiddleware) {
      // if we're in an edge function, we only get a subset of `nextConfig` (no `experimental`),
      // so we have to inject it via DefinePlugin.
      // in `next start` this will be passed normally (see `NextNodeServer.runMiddleware`).

      const waitUntil = event.waitUntil.bind(event)
      const closeController = new CloseController()

      return getTracer().trace(
        MiddlewareSpan.execute,
        {
          spanName: `middleware ${request.method}`,
          attributes: {
            'http.target': request.nextUrl.pathname,
            'http.method': request.method,
          },
        },
        async () => {
          try {
            const onUpdateCookies = (cookies: Array<string>) => {
              cookiesFromResponse = cookies
            }
            const previewProps = getEdgePreviewProps()
            const page = '/' // Fake Work
            const fallbackRouteParams = null

            const implicitTags = await getImplicitTags(
              page,
              request.nextUrl,
              fallbackRouteParams
            )

            const requestStore = createRequestStoreForAPI(
              request,
              request.nextUrl,
              implicitTags,
              onUpdateCookies,
              previewProps
            )

            const workStore = createWorkStore({
              page,
              renderOpts: {
                cacheLifeProfiles:
                  params.request.nextConfig?.experimental?.cacheLife,
                cacheComponents: false,
                experimental: {
                  isRoutePPREnabled: false,
                  authInterrupts:
                    !!params.request.nextConfig?.experimental?.authInterrupts,
                },
                supportsDynamicResponse: true,
                waitUntil,
                onClose: closeController.onClose.bind(closeController),
                onAfterTaskError: undefined,
              },
              isPrefetchRequest:
                request.headers.get(NEXT_ROUTER_PREFETCH_HEADER) === '1',
              buildId: buildId ?? '',
              previouslyRevalidatedTags: [],
            })

            return await workAsyncStorage.run(workStore, () =>
              workUnitAsyncStorage.run(
                requestStore,
                params.handler,
                request,
                event
              )
            )
          } finally {
            // middleware cannot stream, so we can consider the response closed
            // as soon as the handler returns.
            // we can delay running it until a bit later --
            // if it's needed, we'll have a `waitUntil` lock anyway.
            setTimeout(() => {
              closeController.dispatchClose()
            }, 0)
          }
        }
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
  if (response && rewrite && (isRSCRequest || !isEdgeRendering)) {
    const destination = new NextURL(rewrite, {
      forceLocale: true,
      headers: params.request.headers,
      nextConfig: params.request.nextConfig,
    })

    if (!process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE && !isEdgeRendering) {
      if (destination.host === request.nextUrl.host) {
        destination.buildId = buildId || destination.buildId
        response.headers.set('x-middleware-rewrite', String(destination))
      }
    }

    /**
     * When the request is a data request we must show if there was a rewrite
     * with an internal header so the client knows which component to load
     * from the data request.
     */
    const { url: relativeDestination, isRelative } = parseRelativeURL(
      destination.toString(),
      requestURL.toString()
    )

    if (
      !isEdgeRendering &&
      isNextDataRequest &&
      // if the rewrite is external and external rewrite
      // resolving config is enabled don't add this header
      // so the upstream app can set it instead
      !(
        process.env.__NEXT_EXTERNAL_MIDDLEWARE_REWRITE_RESOLVE &&
        relativeDestination.match(/http(s)?:\/\//)
      )
    ) {
      response.headers.set('x-nextjs-rewrite', relativeDestination)
    }

    // Check to see if this is a non-relative rewrite. If it is, we need
    // to check to see if it's an allowed origin to receive the rewritten
    // headers.
    const isAllowedOrigin = !isRelative
      ? params.request.nextConfig?.experimental?.clientParamParsingOrigins?.some(
          (origin) => new RegExp(origin).test(destination.origin)
        )
      : false

    // If this is an RSC request, and the pathname or search has changed, and
    // this isn't an external rewrite, we need to set the rewritten pathname and
    // query headers.
    if (isRSCRequest && (isRelative || isAllowedOrigin)) {
      if (requestURL.pathname !== destination.pathname) {
        response.headers.set(NEXT_REWRITTEN_PATH_HEADER, destination.pathname)
      }
      if (requestURL.search !== destination.search) {
        response.headers.set(
          NEXT_REWRITTEN_QUERY_HEADER,
          // remove the leading ? from the search string
          destination.search.slice(1)
        )
      }
    }
  }

  /**
   * Always forward the `_rsc` search parameter to the rewritten URL for RSC requests,
   * unless it's already present. This is necessary to ensure that RSC hash validation
   * works correctly after a rewrite. For internal rewrites, the server can validate the
   * RSC hash using the original URL, so forwarding the `_rsc` parameter is less critical.
   * However, for external rewrites (where the request is proxied to another Next.js server),
   * the external server does not have access to the original URL or its search parameters.
   * In these cases, forwarding the `_rsc` parameter is essential so that the external server
   * can perform the correct RSC hash validation.
   */
  if (response && rewrite && isRSCRequest && rscHash) {
    const rewriteURL = new URL(rewrite)
    if (!rewriteURL.searchParams.has(NEXT_RSC_UNION_QUERY)) {
      rewriteURL.searchParams.set(NEXT_RSC_UNION_QUERY, rscHash)
      response.headers.set('x-middleware-rewrite', rewriteURL.toString())
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
      if (redirectURL.host === requestURL.host) {
        redirectURL.buildId = buildId || redirectURL.buildId
        response.headers.set('Location', redirectURL.toString())
      }
    }

    /**
     * When the request is a data request we can't use the location header as
     * it may end up with CORS error. Instead we map to an internal header so
     * the client knows the destination.
     */
    if (isNextDataRequest) {
      response.headers.delete('Location')
      response.headers.set(
        'x-nextjs-redirect',
        getRelativeURL(redirectURL.toString(), requestURL.toString())
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
    waitUntil: getWaitUntilPromiseFromEvent(event) ?? Promise.resolve(),
    fetchMetrics: request.fetchMetrics,
  }
}
