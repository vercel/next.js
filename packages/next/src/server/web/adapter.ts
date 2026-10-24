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
import { InvariantError } from '../../shared/lib/invariant-error'
import type { ResolvedCacheLifeProfiles } from '../config-shared'
import { NEXT_ROUTER_PREFETCH_HEADER } from '../../client/components/app-router-headers'
import {
  getTracer,
  SpanKind,
  type ReservedRequestSpan,
  type TraceContextHeaders,
} from '../lib/trace/tracer'
import type { TextMapGetter } from 'next/dist/compiled/@opentelemetry/api'
import { MiddlewareSpan, NextSpan } from '../lib/trace/constants'
import {
  addTraceStateEntry,
  DEFERRED_REQUEST_SPAN_KEY,
  encodeDeferredRequestSpan,
} from '../lib/trace/deferred-request-span'
import { CloseController } from './web-on-close'
import {
  continuesToSameOrigin,
  forwardTraceContextToRequest,
  getSharedParentTraceContext,
} from './forward-trace-context'
import { getEdgePreviewProps } from './get-edge-preview-props'
import { getBuiltinRequestContext } from '../after/builtin-request-context'
import { getImplicitTags } from '../lib/implicit-tags'
import { isRSCRequestHeader } from '../lib/is-rsc-request'
import { setRequestMeta } from '../request-meta'

// The proxy (middleware) does not support `'use cache'`, so this work store
// never reaches the code that reads `cacheLife` (and `'use cache'` is
// disallowed on the edge runtime anyway). This sentinel satisfies the
// non-optional type while throwing if `default` is ever read, matching the
// "never read" sentinels used for the proxy's other unused renderOpts fields
// (`staticPageGenerationTimeout: 0`, `useCacheTimeout: 0`). It surfaces loudly
// rather than silently serving a misleading profile.
const proxyCacheLifeProfiles: ResolvedCacheLifeProfiles = {
  get default(): never {
    throw new InvariantError(
      'Proxy does not support `use cache`, so reading its `default` cacheLife profile is unexpected.'
    )
  },
}

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
  /**
   * When the Node.js middleware entrypoint registered `instrumentation.ts` for
   * this request: emits its lifecycle spans, inside the middleware span.
   */
  emitInstrumentationSpans?: () => void
  /**
   * When the request was received (epoch milliseconds), if before the
   * adapter ran (e.g. while registering `instrumentation.ts`).
   */
  requestStartTime?: number
}

// This has to be compatible with what the Vercel builder does as well:
// https://github.com/vercel/vercel/blob/0e0a6eb9f12216202ae2f5ee37e4ada1796361fd/packages/next/src/edge-function-source/get-edge-function.ts#L112-L136
export type EdgeHandler = (opts: {
  request: AdapterOptions['request']
}) => Promise<FetchEventResult>

function isMiddlewarePage(page: string) {
  return (
    page === '/middleware' ||
    page === '/src/middleware' ||
    page === '/proxy' ||
    page === '/src/proxy'
  )
}

let propagator: <T>(request: NextRequestHint, fn: () => T) => T = (
  request,
  fn
) => {
  // An active (host) span wins over a `traceparent` the request carries: the
  // header can't be trusted to override, e.g., an APM's or the platform's
  // server span. The middleware forwards the context it continues to the
  // downstream request (the render), so both stay in one trace. A request
  // span deferred to this request (see `deferred-request-span.ts`) is emitted
  // by renders (e.g. Edge route handlers), but only removed by middleware.
  return getTracer().withPropagatedContext(
    request.headers,
    fn,
    headersGetter,
    false,
    {
      deferredRequestSpan: isMiddlewarePage(request.sourcePage)
        ? 'strip'
        : 'emit',
    }
  )
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
  let deploymentId = process.env.NEXT_DEPLOYMENT_ID

  const requestHeaders = fromNodeOutgoingHttpHeaders(params.request.headers)
  const isNextDataRequest = requestHeaders.has('x-nextjs-data')
  const isRSCRequest = isRSCRequestHeader(requestHeaders.get(RSC_HEADER))

  if (isNextDataRequest && requestURL.pathname === '/index') {
    requestURL.pathname = '/'
  }

  const flightHeaders = new Map()

  // Headers should only be stripped for middleware
  if (!isEdgeRendering && !process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE) {
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
    input: process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE
      ? normalizeURL.toString()
      : stripInternalSearchParams(normalizeURL).toString(),
    init: {
      body: params.request.body,
      headers: requestHeaders,
      method: params.request.method,
      nextConfig: params.request.nextConfig,
      signal: params.request.signal,
    },
  })

  if (params.request.requestMeta) {
    setRequestMeta(request, params.request.requestMeta)
  }

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
    params.IncrementalCache
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

      previewProps: getEdgePreviewProps(),
      prerenderManifest: {
        version: -1 as any, // letting us know this doesn't conform to spec
        routes: {},
        dynamicRoutes: {},
        notFoundRoutes: [],
        preview: getEdgePreviewProps(),
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
  // The trace context of the span the middleware span and the downstream
  // request share as their parent, to forward to the downstream request (see
  // `forwardTraceContextToRequest`), and the request headers as the
  // middleware received them.
  let forwardedTraceContext: TraceContextHeaders | undefined
  let forwardedRequestHeaders: Headers | undefined
  // The root span reserved for the request (see below), until it is emitted
  // or deferred to the render.
  let requestSpan:
    | { reserved: ReservedRequestSpan; startTime: number; target: string }
    | undefined

  response = await propagator(request, () => {
    // we only care to make async storage available for middleware
    const isMiddleware = isMiddlewarePage(params.page)

    if (isMiddleware) {
      // if we're in an edge function, we only get a subset of `nextConfig` (no `experimental`),
      // so we have to inject it via DefinePlugin.
      // in `next start` this will be passed normally (see `NextNodeServer.runMiddleware`).

      const waitUntil = event.waitUntil.bind(event)
      const closeController = new CloseController()
      const tracer = getTracer()

      const executeMiddleware = () => {
        // The middleware span and the downstream request (the render) are
        // siblings: they share the currently active context as their parent.
        // That is an active host span, otherwise the request's `traceparent`
        // (incoming, or written by next-server's middleware-invoke pass), or
        // the root span inserted below. When this request registered
        // `instrumentation.ts`, its lifecycle spans are children of the
        // middleware span, which is backdated to cover registration.
        const receivedHeaders = new Headers(request.headers)
        forwardedTraceContext = getSharedParentTraceContext(
          receivedHeaders,
          tracer.getTraceContextHeaders()
        )
        if (forwardedTraceContext) {
          // Snapshot before the handler can mutate `request.headers`.
          forwardedRequestHeaders = receivedHeaders
        }

        return tracer.trace(
          MiddlewareSpan.execute,
          {
            spanName: `middleware ${request.method}`,
            startTime: params.emitInstrumentationSpans
              ? params.requestStartTime
              : undefined,
            attributes: {
              'http.target': request.nextUrl.pathname,
              'http.method': request.method,
            },
          },
          async () => {
            params.emitInstrumentationSpans?.()
            try {
              const onUpdateCookies = (cookies: Array<string>) => {
                cookiesFromResponse = cookies
              }
              const previewProps = getEdgePreviewProps()
              const page = '/' // Fake Work
              const fallbackRouteParams = null

              const implicitTags = await getImplicitTags(
                page,
                request.nextUrl.pathname,
                fallbackRouteParams
              )

              const requestStore = createRequestStoreForAPI(
                request,
                request.nextUrl,
                implicitTags,
                onUpdateCookies,
                previewProps,
                // Edge route handlers can't use `"use cache"`, so there's no HMR
                // refresh hash to thread through here.
                undefined
              )

              const workStore = createWorkStore({
                page,
                renderOpts: {
                  cacheLifeProfiles: proxyCacheLifeProfiles,
                  // Proxy doesn't do static generation, so this value does not
                  // apply here. 0 is a sentinel: if something ever reads it,
                  // it'll surface loudly instead of silently using a misleading
                  // default.
                  staticPageGenerationTimeout: 0,
                  cacheComponents: false,
                  // Proxy doesn't run instant validation; the level value is
                  // irrelevant here.
                  // TODO: remove validationLevel and other global config from renderOpts
                  validationLevel: 'warning',
                  experimental: {
                    isRoutePPREnabled: false,
                    authInterrupts:
                      !!params.request.nextConfig?.experimental?.authInterrupts,
                    // Proxy doesn't fill Cache Components entries, so this value
                    // is never read. 0 is a sentinel: if something ever reads it,
                    // the cache fill will time out immediately and surface the
                    // bug.
                    useCacheTimeout: 0,
                    durableUseCacheEntries: false,
                  },
                  waitUntil,
                  onClose: closeController.onClose.bind(closeController),
                  onAfterTaskError: undefined,
                },
                isPrefetchRequest:
                  request.headers.get(NEXT_ROUTER_PREFETCH_HEADER) === '1',
                buildId: buildId ?? '',
                deploymentId: deploymentId ?? '',
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

      if (tracer.isOpenTelemetryEnabled() && !tracer.hasActiveSpanContext()) {
        // Middleware invoked separately from the render without any trace
        // context (no incoming `traceparent`, no host span): insert a root
        // span for the request. Its context is forwarded to the render, so the
        // middleware and the render are siblings in one trace instead of two
        // independent root spans. It's named after the method only (like
        // next-server's request span before its route is known): the path
        // would make the span name high-cardinality. It is backdated to when
        // the request was received, to cover registering `instrumentation.ts`.
        // When the request continues to the app, the render emits it, so it
        // covers the render too (see `deferred-request-span.ts`): its IDs are
        // reserved, without starting it here. Otherwise, it is emitted below,
        // ending with the middleware.
        const startTime = params.requestStartTime ?? Date.now()
        const attributes = {
          'http.target': request.nextUrl.pathname,
          'http.method': request.method,
        }
        const reserved = tracer.reserveRequestSpan(request.method, {
          startTime,
          attributes,
        })
        if (reserved) {
          requestSpan = {
            reserved,
            startTime,
            target: request.nextUrl.pathname,
          }
          return reserved.run(executeMiddleware).catch((error) => {
            reserved.emit({ failed: true, error })
            throw error
          })
        }
        // The SDK can't reserve the span: end it with the middleware.
        return tracer.trace(
          NextSpan.request,
          {
            spanName: request.method,
            kind: SpanKind.SERVER,
            startTime: params.requestStartTime,
            attributes,
          },
          executeMiddleware
        )
      }
      return executeMiddleware()
    }
    return params.handler(request, event)
  })

  // check if response is a Response object
  if (response && !(response instanceof Response)) {
    const error = new TypeError(
      'Expected an instance of Response to be returned'
    )
    requestSpan?.reserved.emit({ failed: true, error })
    throw error
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
        response.headers.set(
          'Location',
          getRelativeURL(redirectURL, requestURL)
        )
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

  if (forwardedRequestHeaders) {
    // Make the downstream request (render) a sibling of the middleware span
    // in the same trace. Every host applies these request-header overrides to
    // the render, including next-server's router server, so this works
    // whether or not the host invokes the middleware separately from the
    // render. When the request continues to the app, the reserved root span
    // is deferred to the render with a `next-deferred` `tracestate` entry.
    const deferredValue =
      requestSpan?.reserved.sampled &&
      forwardedTraceContext?.traceparent.includes(
        `-${requestSpan.reserved.spanId}-`
      ) &&
      continuesToSameOrigin(finalResponse.headers, requestURL)
        ? encodeDeferredRequestSpan({
            spanId: requestSpan.reserved.spanId,
            startTime: requestSpan.startTime,
            name: request.method,
            attributes: {
              'http.method': request.method,
              'http.target': requestSpan.target,
            },
          })
        : undefined
    const forwarded = forwardTraceContextToRequest(
      finalResponse.headers,
      forwardedRequestHeaders,
      deferredValue && forwardedTraceContext
        ? {
            traceparent: forwardedTraceContext.traceparent,
            tracestate: addTraceStateEntry(
              forwardedTraceContext.tracestate,
              DEFERRED_REQUEST_SPAN_KEY,
              deferredValue
            ),
          }
        : forwardedTraceContext
    )
    if (deferredValue && forwarded) {
      // The render emits it.
      requestSpan = undefined
    }
  }
  // Emitted with the middleware: a direct response, a redirect, an external
  // rewrite, or a trace context the user set for the render.
  requestSpan?.reserved.emit()

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
