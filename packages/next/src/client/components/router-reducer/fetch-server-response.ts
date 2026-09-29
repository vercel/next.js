'use client'

// TODO: Explicitly import from client.browser
// eslint-disable-next-line import/no-extraneous-dependencies
import { createFromReadableStream as createFromReadableStreamBrowser } from 'react-server-dom-webpack/client'

import { InvariantError } from '../../../shared/lib/invariant-error'
import { fetch } from '../segment-cache/fetch'
import type {
  DynamicNavigationFlightResponse,
  FlightRouterState,
  InitialRSCPayload,
  NavigationFlightResponse,
} from '../../../shared/lib/app-router-types'

import {
  type NEXT_ROUTER_PREFETCH_HEADER,
  type NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_RSC_UNION_QUERY,
  NEXT_URL,
  RSC_HEADER,
  RSC_CONTENT_TYPE_HEADER,
  NEXT_HMR_REFRESH_HEADER,
  NEXT_DID_POSTPONE_HEADER,
  NEXT_HTML_REQUEST_ID_HEADER,
  NEXT_REQUEST_ID_HEADER,
} from '../app-router-headers'
import { callServer } from '../../app-call-server'
import { findSourceMapURL } from '../../app-find-source-map-url'
import { prepareFlightRouterStateForRequest } from '../../flight-data-helpers'
import type { PartialTransportData } from '../../../shared/lib/rsc-transport'
import { setCacheBustingSearchParam } from './set-cache-busting-search-param'
import { urlToUrlWithoutFlightMarker } from '../../route-params'
import type { NormalizedSearch } from '../segment-cache/cache-key'
import { getDeploymentId } from '../../../shared/lib/deployment-id'
import { getNavigationBuildId } from '../../navigation-build-id'
import { NEXT_NAV_DEPLOYMENT_ID_HEADER } from '../../../lib/constants'
import {
  stripIsPartialByte,
  bufferPrefetchResponseBody,
} from '../segment-cache/cache'
import { UnknownDynamicStaleTime } from '../segment-cache/bfcache'

const createFromReadableStream =
  createFromReadableStreamBrowser as (typeof import('react-server-dom-webpack/client.browser'))['createFromReadableStream']

let createDebugChannel:
  | typeof import('../../dev/debug-channel').createDebugChannel
  | undefined

if (process.env.__NEXT_DEV_SERVER && process.env.__NEXT_REACT_DEBUG_CHANNEL) {
  createDebugChannel = (
    require('../../dev/debug-channel') as typeof import('../../dev/debug-channel')
  ).createDebugChannel
}

export interface FetchServerResponseOptions {
  readonly flightRouterState: FlightRouterState
  readonly nextUrl: string | null
  readonly isHmrRefresh?: boolean
  readonly signal?: AbortSignal
}

type SpaFetchServerResponseResult = {
  transportData: PartialTransportData | null
  canonicalUrl: URL
  renderedSearch: NormalizedSearch
  couldBeIntercepted: boolean
  supportsPerSegmentPrefetching: boolean
  postponed: boolean
  dynamicStaleTime: number
  /**
   * Whether the response body was marked partial (contains unresolved
   * dynamic holes), read from the leading isPartial byte. Always false when
   * Cache Components is disabled.
   */
  isResponsePartial: boolean
  /**
   * The decoded response. It can carry a prefetch response, written into the
   * segment cache by `writeNavigationResponseIntoCache`.
   */
  flightResponse: NavigationFlightResponse
  debugInfo: Array<any> | null
  /**
   * Dev only: resolves once the server has flushed the shell-stage content to
   * the stream (or earlier, on a cache miss). The navigation defers revealing
   * the response (resolving its deferred RSCs) until this settles, so React
   * doesn't render a boundary's children before their row has been decoded and
   * commit a premature Suspense fallback. `null` outside the streaming dev
   * render.
   */
  revealAfter: Promise<void> | null
}

type MpaFetchServerResponseResult = string

export type FetchServerResponseResult =
  | MpaFetchServerResponseResult
  | SpaFetchServerResponseResult

export type RequestHeaders = {
  [RSC_HEADER]?: '1'
  [NEXT_ROUTER_STATE_TREE_HEADER]?: string
  [NEXT_URL]?: string
  [NEXT_ROUTER_PREFETCH_HEADER]?: '1' | '2' | '3'
  [NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]?: string
  'x-deployment-id'?: string
  [NEXT_HMR_REFRESH_HEADER]?: '1'
  // A header that is only added in test mode to assert on fetch priority
  'Next-Test-Fetch-Priority'?: RequestInit['priority']
  [NEXT_HTML_REQUEST_ID_HEADER]?: string // dev-only
  [NEXT_REQUEST_ID_HEADER]?: string // dev-only
}

function doMpaNavigation(url: string): FetchServerResponseResult {
  return urlToUrlWithoutFlightMarker(new URL(url, location.origin)).toString()
}

let isPageUnloading = false

if (typeof window !== 'undefined') {
  // Track when the page is unloading, e.g. due to reloading the page or
  // performing hard navigations. This allows us to suppress error logging when
  // the browser cancels in-flight requests during page unload.
  window.addEventListener('pagehide', () => {
    isPageUnloading = true
  })

  // Reset the flag on pageshow, e.g. when navigating back and the JavaScript
  // execution context is restored by the browser.
  window.addEventListener('pageshow', () => {
    isPageUnloading = false
  })
}

/**
 * Fetch the flight data for the provided url. Takes in the current router state
 * to decide what to render server-side.
 */
export async function fetchServerResponse(
  url: URL,
  options: FetchServerResponseOptions
): Promise<FetchServerResponseResult> {
  const { flightRouterState, nextUrl } = options

  const headers: RequestHeaders = {
    // Enable flight response
    [RSC_HEADER]: '1',
    // Provide the current router state
    [NEXT_ROUTER_STATE_TREE_HEADER]: prepareFlightRouterStateForRequest(
      flightRouterState,
      options.isHmrRefresh
    ),
  }

  if (process.env.NODE_ENV === 'development' && options.isHmrRefresh) {
    headers[NEXT_HMR_REFRESH_HEADER] = '1'
  }

  if (nextUrl) {
    headers[NEXT_URL] = nextUrl
  }

  // In static export mode, we need to modify the URL to request the .txt file,
  // but we should preserve the original URL for the canonical URL and error handling.
  const originalUrl = url

  try {
    if (process.env.NODE_ENV === 'production') {
      if (process.env.__NEXT_CONFIG_OUTPUT === 'export') {
        // In "output: export" mode, we can't rely on headers to distinguish
        // between HTML and RSC requests. Instead, we append an extra prefix
        // to the request.
        url = new URL(url)
        if (url.pathname.endsWith('/')) {
          url.pathname += 'index.txt'
        } else {
          url.pathname += '.txt'
        }
      }
    }

    const responsePromise = createFetch(url, headers, 'auto', options.signal)
    // Start decoding before the response arrives, so React DevTools can show
    // the latency from the client to the server. Navigations only ever receive
    // live-render responses (per-segment prefetch responses, which omit some
    // fields, are decoded by the segment cache instead), so the decode is typed
    // as the live-render variant.
    const flightResponsePromise =
      decodeNavigationResponse<DynamicNavigationFlightResponse>(
        responsePromise,
        headers,
        // Only an HMR refresh can be superseded. Gated to the dev server
        // (where HMR runs) so the abort handling is eliminated from production
        // and `--debug-prerender` bundles regardless of the flag.
        process.env.__NEXT_DEV_SERVER &&
          process.env.__NEXT_SERVER_COMPONENTS_HMR_CANCELLATION
          ? options.signal
          : undefined
      )
    const res = await responsePromise

    // If the fetch succeeds while we're in the offline state, notify the
    // offline module so it can short-circuit the polling loop.
    if (process.env.__NEXT_USE_OFFLINE) {
      const { notifyOnline } =
        require('../offline') as typeof import('../offline')
      notifyOnline()
    }

    const responseUrl = urlToUrlWithoutFlightMarker(new URL(res.url))
    const canonicalUrl = res.redirected ? responseUrl : originalUrl

    const contentType = res.headers.get('content-type') || ''
    const interception = !!res.headers.get('vary')?.includes(NEXT_URL)
    const postponed = !!res.headers.get(NEXT_DID_POSTPONE_HEADER)
    let isFlightResponse = contentType.startsWith(RSC_CONTENT_TYPE_HEADER)

    if (process.env.NODE_ENV === 'production') {
      if (process.env.__NEXT_CONFIG_OUTPUT === 'export') {
        if (!isFlightResponse) {
          isFlightResponse = contentType.startsWith('text/plain')
        }
      }
    }

    // If fetch returns something different than flight response handle it like a mpa navigation
    // If the fetch was not 200, we also handle it like a mpa navigation
    if (!isFlightResponse || !res.ok || !res.body) {
      // in case the original URL came with a hash, preserve it before redirecting to the new URL
      if (url.hash) {
        responseUrl.hash = url.hash
      }

      return doMpaNavigation(responseUrl.toString())
    }

    // We may navigate to a page that requires a different Webpack runtime.
    // In prod, every page will have the same Webpack runtime.
    // In dev, the Webpack runtime is minimal for each page.
    // We need to ensure the Webpack runtime is updated before executing client-side JS of the new page.
    // TODO: This needs to happen in the Flight Client.
    // Or Webpack needs to include the runtime update in the Flight response as
    // a blocking script.
    if (process.env.NODE_ENV !== 'production' && !process.env.TURBOPACK) {
      await (
        require('../../dev/hot-reloader/app/hot-reloader-app') as typeof import('../../dev/hot-reloader/app/hot-reloader-app')
      ).waitForWebpackRuntimeHotUpdate()
    }

    const [flightResponse, cacheData] = await Promise.all([
      flightResponsePromise,
      res.cacheData,
    ])

    if (
      (res.headers.get(NEXT_NAV_DEPLOYMENT_ID_HEADER) ?? flightResponse.b) !==
      getNavigationBuildId()
    ) {
      // The server build does not match the client build.
      return doMpaNavigation(res.url)
    }

    if (flightResponse.n !== undefined) {
      // The server responded with an MPA navigation URL instead of a
      // SPA payload.
      return doMpaNavigation(flightResponse.n)
    }

    return {
      transportData: flightResponse.t ?? null,
      canonicalUrl: canonicalUrl,
      // TODO: We should be able to read this from the rewrite header, not the
      // Flight response. Theoretically they should always agree, but there are
      // currently some cases where it's incorrect for interception routes. We
      // can always trust the value in the response body. However, per-segment
      // prefetch responses don't embed the value in the body; they rely on the
      // header alone. So we need to investigate why the header is sometimes
      // wrong for interception routes.
      renderedSearch: flightResponse.q as NormalizedSearch,
      couldBeIntercepted: interception,
      supportsPerSegmentPrefetching: flightResponse.S,
      postponed,
      // The dynamicStaleTime is only present in the response body when
      // a page exports unstable_dynamicStaleTime and this is a dynamic render.
      // When absent (UnknownDynamicStaleTime), the client falls back to the
      // global DYNAMIC_STALETIME_MS. The value is in seconds.
      dynamicStaleTime: flightResponse.d ?? UnknownDynamicStaleTime,
      isResponsePartial:
        cacheData !== null ? cacheData.isResponsePartial : false,
      flightResponse,
      debugInfo: flightResponsePromise._debugInfo ?? null,
      revealAfter: flightResponse._revealAfter ?? null,
    }
  } catch (err) {
    if (options.signal?.aborted) {
      // A newer HMR refresh superseded this one and aborted its request.
      // Rethrow so the caller treats it as canceled, rather than logging a
      // failure or falling back to an MPA navigation.
      throw err
    }

    // If the fetch rejected due to a network error, wait for connectivity
    // to be restored and then retry. checkOfflineError returns true for
    // network errors (and starts the polling loop); returns false for
    // intentional aborts/timeouts, which fall through to the MPA fallback.
    //
    // Note: when the user navigates multiple times while offline, each
    // navigation queues a separate retry here. Once connectivity returns,
    // all pending retries resume simultaneously. This is mitigated in PR 3
    // by reusing back-forward cache entries during offline navigation, which
    // avoids issuing new fetches in the first place.
    if (process.env.__NEXT_USE_OFFLINE && !isPageUnloading) {
      const { checkOfflineError, getOffline, waitForConnection } =
        require('../offline') as typeof import('../offline')
      if (checkOfflineError(err)) {
        const offline = getOffline()
        if (offline !== null) {
          await waitForConnection(offline)
        }
        return fetchServerResponse(url, options)
      }
    }

    if (!isPageUnloading) {
      console.error(
        `Failed to fetch RSC payload for ${originalUrl}. Falling back to browser navigation.`,
        err
      )
    }

    // If fetch fails handle it like a mpa navigation
    // TODO-APP: Add a test for the case where a CORS request fails, e.g. external url redirect coming from the response.
    // See https://github.com/vercel/next.js/issues/43605#issuecomment-1451617521 for a reproduction.
    return originalUrl.toString()
  }
}

// This is a subset of the standard Response type. We use a custom type for
// this so we can limit which details about the response leak into the rest of
// the codebase. For example, there's some custom logic for manually following
// redirects, so "redirected" in this type could be a composite of multiple
// browser fetch calls; however, this fact should not leak to the caller.
export type RSCResponse = {
  ok: boolean
  redirected: boolean
  headers: Headers
  body: ReadableStream<Uint8Array> | null
  status: number
  url: string
  cacheData: Promise<FetchResponseCacheData | null>
}

type FetchResponseCacheData = {
  isResponsePartial: boolean
  // A clone of the response body for shell extraction, derived from a `tee()`
  // in `processFetch`.
  shellBodyClone?: ReadableStream<Uint8Array>
}

/**
 * Strips the leading isPartial byte from an RSC navigation response and
 * clones the body for segment cache extraction.
 *
 * When cache components is enabled, the server prepends a single byte:
 * '~' (0x7e) for partial, '#' (0x23) for complete. This must be stripped
 * before Flight decoding because it's not valid RSC data. The body is
 * cloned before Flight can consume it so the clone is available for later use.
 *
 * When cache components is disabled, returns the original response with
 * cacheData: null.
 */
export async function processFetch(response: Response): Promise<{
  response: Response
  cacheData: FetchResponseCacheData | null
}> {
  if (process.env.__NEXT_CACHE_COMPONENTS) {
    if (!response.body) {
      throw new InvariantError(
        'Expected RSC navigation response to have a body'
      )
    }

    const { stream, isPartial } = await stripIsPartialByte(response.body)

    let responseStream: ReadableStream<Uint8Array>
    let cacheData: FetchResponseCacheData

    if (process.env.__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS) {
      // Two readers needed: the main Flight decoder and the shell-stage
      // extractor.
      // TODO: Tee only in the callers that read the clone. Navigations only
      // need it for a complete prerender.
      const [stream1, shellBodyClone] = stream.tee()
      responseStream = stream1
      cacheData = {
        isResponsePartial: isPartial,
        shellBodyClone,
      }
    } else {
      responseStream = stream
      cacheData = { isResponsePartial: isPartial }
    }

    const strippedResponse = new Response(responseStream, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    })

    // The Response constructor doesn't preserve `url` or `redirected` from
    // the original. We need both: `url` for React DevTools and `redirected`
    // for the redirect replay logic below.
    Object.defineProperty(strippedResponse, 'url', { value: response.url })
    Object.defineProperty(strippedResponse, 'redirected', {
      value: response.redirected,
    })

    return { response: strippedResponse, cacheData }
  }

  return { response, cacheData: null }
}

/**
 * Resolves the shell stage of a prerender response:
 *
 * - `a === undefined` (server didn't emit shell stage info) or no shell body
 *   clone: no shell exists — returns null.
 * - `a` resolves to `null`: the shell IS the main response — returns
 *   `flightResponse` itself (callers compare by reference).
 * - `a` resolves to a number: the shell is a strict prefix of the response —
 *   returns a separate Flight decode of the byte prefix.
 */
export async function resolveShellStageResponse<
  T extends NavigationFlightResponse | InitialRSCPayload,
>(
  cacheData: FetchResponseCacheData,
  flightResponse: T,
  headers: RequestHeaders | undefined
): Promise<T | null> {
  const { shellBodyClone } = cacheData

  if (!shellBodyClone) {
    return null
  }

  if (flightResponse.a === undefined) {
    // The render wasn't staged — no shell exists.
    shellBodyClone.cancel()
    return null
  }

  const shellByteLength = await flightResponse.a
  if (shellByteLength === 0) {
    shellBodyClone.cancel()
    return null
  }
  if (shellByteLength === null) {
    // The shell IS the full response (no shell/full split). Return the full
    // response itself — callers detect this case by reference equality —
    // rather than collapsing it into null, which would lose the distinction
    // from "no shell exists". This mirrors the convention of the per-segment
    // prefetch fetch (see fetchAndWritePerSegmentPrefetchResponse in cache.ts).
    shellBodyClone.cancel()
    return flightResponse
  }

  return decodeStageUntilBoundary<T>(shellBodyClone, shellByteLength, headers)
}

/**
 * Truncates and buffers a Flight stream clone at the given byte boundary and
 * decodes the prefix as an optional Flight payload. Returns null if extraction
 * fails or the root does not resolve before the next task. The caller can still
 * use the full response.
 */
async function decodeStageUntilBoundary<T>(
  responseBodyClone: ReadableStream<Uint8Array>,
  byteLength: number,
  headers: RequestHeaders | undefined
): Promise<T | null> {
  try {
    const buffer = await bufferPrefetchResponseBody(
      responseBodyClone,
      byteLength
    )
    const response = decodeBufferedStage<T>(buffer, headers)

    // The caller already has the full response root, but this prefix may omit
    // rows that the root needs. Bound this optional extraction so it cannot
    // hold up the full response. This deadline applies to the outer root, not
    // to Client Components that continue loading through lazy references.
    return await new Promise<T | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 0)
      response.then(
        (root) => {
          clearTimeout(timeout)
          resolve(root)
        },
        () => {
          clearTimeout(timeout)
          resolve(null)
        }
      )
    })
  } catch {
    return null
  }
}

/**
 * Decodes already-buffered Flight response bytes as a stage payload. A
 * "stage" is a prefix of the staged server render — see `RenderStage` in
 * packages/next/src/server/app-render/staged-rendering.ts. The
 * bytes are delivered to Flight as a single chunk so all rows are processed
 * synchronously in one call — required for the thenable-status reads that
 * scope a response's late-resolving metadata (vary params, isPartial, ...)
 * to this decode.
 */
export function decodeBufferedStage<T>(
  buffer: Uint8Array,
  headers: RequestHeaders | undefined
): Promise<T> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(buffer)
      controller.close()
    },
  })
  return createFromNextReadableStream<T>(stream, headers, {
    allowPartialStream: true,
  })
}

// Decodes a navigation response through a stream that's created synchronously,
// before the response arrives, and reads the response body once it does.
// React's timer starts when the decode starts, so DevTools can show the latency
// from the client to the server.
//
// When an HMR refresh can be superseded, it passes a signal, and the stream
// closes on abort. Closing the stream (rather than letting the aborted fetch
// error it) makes React's Flight client mark unresolved rows as halted: they
// suspend during render instead of rejecting, so a superseded request never
// surfaces an error on an already-committed tree. Because the stream is closed,
// there's also no unclosed-stream GC-root leak (see #89610).
function decodeNavigationResponse<T>(
  responsePromise: Promise<RSCResponse>,
  headers: RequestHeaders,
  signal: AbortSignal | undefined
): Promise<T> & { _debugInfo?: Array<any> } {
  let closed = false
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal === undefined) {
        return
      }
      const onAbort = () => {
        closed = true
        try {
          controller.close()
        } catch {
          // The controller may already be closed; nothing to do.
        }
        if (reader !== null) {
          reader.cancel().catch(() => {})
        }
      }
      if (signal.aborted) {
        onAbort()
      } else {
        signal.addEventListener('abort', onAbort, { once: true })
      }
    },
    async pull(controller) {
      if (closed) {
        return
      }
      if (reader === null) {
        let response: RSCResponse
        try {
          response = await responsePromise
        } catch (err) {
          // We don't inspect `err`. If the request was superseded, `onAbort`
          // already ran synchronously (abort listeners fire during
          // `signal.abort()`, before this rejection microtask), so `closed` is
          // true and the controller is already closed — erroring it would
          // throw, and a superseded request's failure is moot regardless of its
          // cause. Only a genuine, non-superseded failure reaches here with
          // `closed` still false; that is the case we surface.
          if (!closed) {
            controller.error(err)
          }
          return
        }
        if (closed) {
          // Aborted while awaiting the response. The `fetch` abort tears down
          // an in-flight request, but if it had already completed we still hold
          // an unread body; release it so it isn't left dangling.
          response.body?.cancel().catch(() => {})
          return
        }
        const body = response.body
        if (body === null) {
          controller.close()
          return
        }
        reader = body.getReader()
      }
      try {
        const { done, value } = await reader.read()
        if (closed) {
          return
        }
        if (done) {
          controller.close()
        } else {
          controller.enqueue(value)
        }
      } catch (err) {
        // Same as the fetch catch above: once superseded (`closed`) the
        // controller is already closed and the outcome is moot, so we swallow
        // the rejection unconditionally; only a real, non-superseded read
        // failure (`closed` still false) is surfaced.
        if (!closed) {
          controller.error(err)
        }
      }
    },
  })

  // React attaches `_debugInfo` to the returned promise at runtime.
  return createFromNextReadableStream<T>(stream, headers, {
    // Only a stream that closes on abort may end before the response does.
    allowPartialStream: signal !== undefined,
  }) as Promise<T> & { _debugInfo?: Array<any> }
}

export async function createFetch(
  url: URL,
  headers: RequestHeaders,
  fetchPriority: 'auto' | 'high' | 'low' | null,
  signal?: AbortSignal
): Promise<RSCResponse> {
  // TODO: In output: "export" mode, the headers do nothing. Omit them (and the
  // cache busting search param) from the request so they're
  // maximally cacheable.

  if (process.env.__NEXT_TEST_MODE && fetchPriority !== null) {
    headers['Next-Test-Fetch-Priority'] = fetchPriority
  }

  const deploymentId = getDeploymentId()
  if (deploymentId) {
    headers['x-deployment-id'] = deploymentId
  }

  if (process.env.__NEXT_DEV_SERVER) {
    if (self.__next_r) {
      headers[NEXT_HTML_REQUEST_ID_HEADER] = self.__next_r
    }

    // Create a new request ID for the server action request. The server uses
    // this to tag debug information sent via WebSocket to the client, which
    // then routes those chunks to the debug channel associated with this ID.
    headers[NEXT_REQUEST_ID_HEADER] = crypto
      .getRandomValues(new Uint32Array(1))[0]
      .toString(16)
  }

  const fetchOptions: RequestInit = {
    // Backwards compat for older browsers. `same-origin` is the default in modern browsers.
    credentials: 'same-origin',
    headers,
    priority: fetchPriority || undefined,
    signal,
  }
  // `fetchUrl` is slightly different from `url` because we add a cache-busting
  // search param to it. This should not leak outside of this function, so we
  // track them separately.
  let fetchUrl = new URL(url)
  await setCacheBustingSearchParam(fetchUrl, headers)
  let processed = fetch(fetchUrl, fetchOptions).then(processFetch)
  let browserResponse = (await processed).response

  // If the server responds with a redirect (e.g. 307), and the redirected
  // location does not contain the cache busting search param set in the
  // original request, the response is likely invalid — when following the
  // redirect, the browser forwards the request headers, but since the cache
  // busting search param is missing, the server will reject the request due to
  // a mismatch.
  //
  // Ideally, we would be able to intercept the redirect response and perform it
  // manually, instead of letting the browser automatically follow it, but this
  // is not allowed by the fetch API.
  //
  // So instead, we must "replay" the redirect by fetching the new location
  // again, but this time we'll append the cache busting search param to prevent
  // a mismatch.
  //
  // TODO: We can optimize Next.js's built-in middleware APIs by returning a
  // custom status code, to prevent the browser from automatically following it.
  //
  // This does not affect Server Action-based redirects; those are encoded
  // differently, as part of the Flight body. It only affects redirects that
  // occur in a middleware or a third-party proxy.

  let redirected = browserResponse.redirected
  if (process.env.__NEXT_CLIENT_VALIDATE_RSC_REQUEST_HEADERS) {
    // This is to prevent a redirect loop. Same limit used by Chrome.
    const MAX_REDIRECTS = 20
    for (let n = 0; n < MAX_REDIRECTS; n++) {
      if (!browserResponse.redirected) {
        // The server did not perform a redirect.
        break
      }
      const responseUrl = new URL(browserResponse.url, fetchUrl)
      if (responseUrl.origin !== fetchUrl.origin) {
        // The server redirected to an external URL. The rest of the logic below
        // is not relevant, because it only applies to internal redirects.
        break
      }
      if (
        responseUrl.searchParams.get(NEXT_RSC_UNION_QUERY) ===
        fetchUrl.searchParams.get(NEXT_RSC_UNION_QUERY)
      ) {
        // The redirected URL already includes the cache busting search param.
        // This was probably intentional. Regardless, there's no reason to
        // issue another request to this URL because it already has the param
        // value that we would have added below.
        break
      }
      // The RSC request was redirected. Assume the response is invalid.
      //
      // Append the cache busting search param to the redirected URL and
      // fetch again.
      // TODO: We should abort the previous request.
      fetchUrl = new URL(responseUrl)
      await setCacheBustingSearchParam(fetchUrl, headers)
      processed = fetch(fetchUrl, fetchOptions).then(processFetch)
      browserResponse = (await processed).response
      // We just performed a manual redirect, so this is now true.
      redirected = true
    }
  }

  // Remove the cache busting search param from the response URL, to prevent it
  // from leaking outside of this function.
  const responseUrl = new URL(browserResponse.url, fetchUrl)
  responseUrl.searchParams.delete(NEXT_RSC_UNION_QUERY)

  const rscResponse: RSCResponse = {
    url: responseUrl.href,

    // This is true if any redirects occurred, either automatically by the
    // browser, or manually by us. So it's different from
    // `browserResponse.redirected`, which only tells us whether the browser
    // followed a redirect, and only for the last response in the chain.
    redirected,

    // These can be copied from the last browser response we received. We
    // intentionally only expose the subset of fields that are actually used
    // elsewhere in the codebase.
    ok: browserResponse.ok,
    headers: browserResponse.headers,
    body: browserResponse.body,
    status: browserResponse.status,

    cacheData: processed.then(({ cacheData }) => cacheData),
  }

  return rscResponse
}

export function createFromNextReadableStream<T>(
  flightStream: ReadableStream<Uint8Array>,
  requestHeaders: RequestHeaders | undefined,
  options?: { allowPartialStream?: boolean }
): Promise<T> {
  return createFromReadableStream(flightStream, {
    callServer,
    findSourceMapURL,
    debugChannel: createDebugChannel && createDebugChannel(requestHeaders),
    unstable_allowPartialStream: options?.allowPartialStream,
  })
}
