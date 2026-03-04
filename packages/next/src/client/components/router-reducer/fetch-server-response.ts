'use client'

// TODO: Explicitly import from client.browser
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  createFromReadableStream as createFromReadableStreamBrowser,
  createFromFetch as createFromFetchBrowser,
} from 'react-server-dom-webpack/client'

import { InvariantError } from '../../../shared/lib/invariant-error'
import type {
  FlightRouterState,
  InitialRSCPayload,
  NavigationFlightResponse,
} from '../../../shared/lib/app-router-types'

import {
  type NEXT_ROUTER_PREFETCH_HEADER,
  type NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  type NEXT_INSTANT_PREFETCH_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_RSC_UNION_QUERY,
  NEXT_URL,
  RSC_HEADER,
  RSC_CONTENT_TYPE_HEADER,
  NEXT_HMR_REFRESH_HEADER,
  NEXT_DID_POSTPONE_HEADER,
  NEXT_ROUTER_STALE_TIME_HEADER,
  NEXT_HTML_REQUEST_ID_HEADER,
  NEXT_REQUEST_ID_HEADER,
} from '../app-router-headers'
import { callServer } from '../../app-call-server'
import { findSourceMapURL } from '../../app-find-source-map-url'
import {
  normalizeFlightData,
  prepareFlightRouterStateForRequest,
  type NormalizedFlightData,
} from '../../flight-data-helpers'
import { setCacheBustingSearchParam } from './set-cache-busting-search-param'
import { urlToUrlWithoutFlightMarker } from '../../route-params'
import type { NormalizedSearch } from '../segment-cache/cache-key'
import { getDeploymentId } from '../../../shared/lib/deployment-id'
import { getNavigationBuildId } from '../../navigation-build-id'
import { NEXT_NAV_DEPLOYMENT_ID_HEADER } from '../../../lib/constants'
import { stripIsPartialByte } from '../segment-cache/cache'

const createFromReadableStream =
  createFromReadableStreamBrowser as (typeof import('react-server-dom-webpack/client.browser'))['createFromReadableStream']
const createFromFetch =
  createFromFetchBrowser as (typeof import('react-server-dom-webpack/client.browser'))['createFromFetch']

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
}

export type StaticStageData<
  T extends
    | NavigationFlightResponse
    | InitialRSCPayload = NavigationFlightResponse,
> = {
  readonly response: T
  readonly isResponsePartial: boolean
}

type SpaFetchServerResponseResult = {
  flightData: NormalizedFlightData[]
  canonicalUrl: URL
  renderedSearch: NormalizedSearch
  couldBeIntercepted: boolean
  supportsPerSegmentPrefetching: boolean
  postponed: boolean
  staleTime: number
  staticStageData: StaticStageData | null
  runtimePrefetchStream: ReadableStream<Uint8Array> | null
  responseHeaders: Headers
  debugInfo: Array<any> | null
}

type MpaFetchServerResponseResult = string

export type FetchServerResponseResult =
  | MpaFetchServerResponseResult
  | SpaFetchServerResponseResult

export type RequestHeaders = {
  [RSC_HEADER]?: '1'
  [NEXT_ROUTER_STATE_TREE_HEADER]?: string
  [NEXT_URL]?: string
  [NEXT_ROUTER_PREFETCH_HEADER]?: '1' | '2'
  [NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]?: string
  'x-deployment-id'?: string
  [NEXT_HMR_REFRESH_HEADER]?: '1'
  // A header that is only added in test mode to assert on fetch priority
  'Next-Test-Fetch-Priority'?: RequestInit['priority']
  [NEXT_HTML_REQUEST_ID_HEADER]?: string // dev-only
  [NEXT_REQUEST_ID_HEADER]?: string // dev-only
  [NEXT_INSTANT_PREFETCH_HEADER]?: '1' // testing API only
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

    // Typically, during a navigation, we decode the response using Flight's
    // `createFromFetch` API, which accepts a `fetch` promise.
    const res = await createFetch<NavigationFlightResponse>(
      url,
      headers,
      'auto',
      true
    )

    const responseUrl = urlToUrlWithoutFlightMarker(new URL(res.url))
    const canonicalUrl = res.redirected ? responseUrl : originalUrl

    const contentType = res.headers.get('content-type') || ''
    const interception = !!res.headers.get('vary')?.includes(NEXT_URL)
    const postponed = !!res.headers.get(NEXT_DID_POSTPONE_HEADER)
    const staleTimeHeaderSeconds = res.headers.get(
      NEXT_ROUTER_STALE_TIME_HEADER
    )
    const staleTime =
      staleTimeHeaderSeconds !== null
        ? parseInt(staleTimeHeaderSeconds, 10) * 1000
        : -1
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

    let flightResponsePromise = res.flightResponsePromise
    if (flightResponsePromise === null) {
      // Typically, `createFetch` would have already started decoding the
      // Flight response. If it hasn't, though, we need to decode it now.
      // TODO: This should only be reachable if legacy PPR is enabled (i.e. PPR
      // without Cache Components). Remove this branch once legacy PPR
      // is deleted.
      flightResponsePromise =
        createFromNextReadableStream<NavigationFlightResponse>(
          res.body,
          headers,
          { allowPartialStream: postponed }
        )
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

    const normalizedFlightData = normalizeFlightData(flightResponse.f)
    if (typeof normalizedFlightData === 'string') {
      return doMpaNavigation(normalizedFlightData)
    }

    const staticStageData =
      cacheData !== null
        ? await resolveStaticStageData(cacheData, flightResponse, headers)
        : null

    return {
      flightData: normalizedFlightData,
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
      staleTime,
      staticStageData,
      runtimePrefetchStream: flightResponse.p ?? null,
      responseHeaders: res.headers,
      debugInfo: flightResponsePromise._debugInfo ?? null,
    }
  } catch (err) {
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
export type RSCResponse<T> = {
  ok: boolean
  redirected: boolean
  headers: Headers
  body: ReadableStream<Uint8Array> | null
  status: number
  url: string
  flightResponsePromise: (Promise<T> & { _debugInfo?: Array<any> }) | null
  cacheData: Promise<FetchResponseCacheData | null>
}

type FetchResponseCacheData = {
  isResponsePartial: boolean
  responseBodyClone: ReadableStream<Uint8Array>
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
    const [stream1, stream2] = stream.tee()

    const strippedResponse = new Response(stream1, {
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

    return {
      response: strippedResponse,
      cacheData: { isResponsePartial: isPartial, responseBodyClone: stream2 },
    }
  }

  return { response, cacheData: null }
}

/**
 * Resolves the static stage response from the raw `processFetch` outputs and
 * the decoded flight response, for writing into the segment cache.
 *
 * - Fully static: use the decoded flight response as-is, no truncation needed.
 * - Not fully static + `l` field: truncate the body clone at the static stage
 *   byte boundary and decode.
 * - Otherwise: no cache-worthy data.
 */
export async function resolveStaticStageData<
  T extends NavigationFlightResponse | InitialRSCPayload,
>(
  cacheData: FetchResponseCacheData,
  flightResponse: T,
  headers: RequestHeaders | undefined
): Promise<StaticStageData<T> | null> {
  const { isResponsePartial, responseBodyClone } = cacheData

  if (!isResponsePartial) {
    // Fully static — cache the entire decoded response as-is.
    responseBodyClone.cancel()

    return { response: flightResponse, isResponsePartial: false }
  }

  if (flightResponse.l !== undefined) {
    // Partially static — truncate the body clone at the byte boundary and
    // decode it.
    const response = await decodeStaticStage<T>(
      responseBodyClone,
      flightResponse.l,
      headers
    )

    return { response, isResponsePartial: true }
  }

  // No caching — cancel the unused clone.
  responseBodyClone.cancel()

  return null
}

/**
 * Truncates a Flight stream clone at the given byte boundary and decodes the
 * static stage prefix. Used by both the navigation path and the initial HTML
 * hydration path.
 */
export async function decodeStaticStage<T>(
  responseBodyClone: ReadableStream<Uint8Array>,
  staticStageByteLengthPromise: Promise<number>,
  headers: RequestHeaders | undefined
): Promise<T> {
  const staticStageByteLength = await staticStageByteLengthPromise

  const truncatedStream = truncateStream(
    responseBodyClone,
    staticStageByteLength
  )

  return createFromNextReadableStream<T>(truncatedStream, headers, {
    allowPartialStream: true,
  })
}

export async function createFetch<T>(
  url: URL,
  headers: RequestHeaders,
  fetchPriority: 'auto' | 'high' | 'low' | null,
  shouldImmediatelyDecode: boolean,
  signal?: AbortSignal
): Promise<RSCResponse<T>> {
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
  setCacheBustingSearchParam(fetchUrl, headers)
  let processed = fetch(fetchUrl, fetchOptions).then(processFetch)
  let fetchPromise = processed.then(({ response }) => response)

  // Immediately pass the fetch promise to the Flight client so that the debug
  // info includes the latency from the client to the server. The internal timer
  // in React starts as soon as `createFromFetch` is called.
  //
  // The only case where we don't do this is during a prefetch, because a
  // top-level prefetch response never blocks a navigation; if it hasn't already
  // been written into the cache by the time the navigation happens, the router
  // will go straight to a dynamic request.
  let flightResponsePromise = shouldImmediatelyDecode
    ? createFromNextFetch<T>(fetchPromise, headers)
    : null
  let browserResponse = await fetchPromise

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
      setCacheBustingSearchParam(fetchUrl, headers)
      processed = fetch(fetchUrl, fetchOptions).then(processFetch)
      fetchPromise = processed.then(({ response }) => response)
      flightResponsePromise = shouldImmediatelyDecode
        ? createFromNextFetch<T>(fetchPromise, headers)
        : null
      browserResponse = await fetchPromise
      // We just performed a manual redirect, so this is now true.
      redirected = true
    }
  }

  // Remove the cache busting search param from the response URL, to prevent it
  // from leaking outside of this function.
  const responseUrl = new URL(browserResponse.url, fetchUrl)
  responseUrl.searchParams.delete(NEXT_RSC_UNION_QUERY)

  const rscResponse: RSCResponse<T> = {
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

    // This is the exact promise returned by `createFromFetch`. It contains
    // debug information that we need to transfer to any derived promises that
    // are later rendered by React.
    flightResponsePromise: flightResponsePromise,

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

function createFromNextFetch<T>(
  promiseForResponse: Promise<Response>,
  requestHeaders: RequestHeaders
): Promise<T> & { _debugInfo?: Array<any> } {
  return createFromFetch(promiseForResponse, {
    callServer,
    findSourceMapURL,
    debugChannel: createDebugChannel && createDebugChannel(requestHeaders),
  })
}

function truncateStream(
  stream: ReadableStream<Uint8Array>,
  byteLength: number
): ReadableStream<Uint8Array> {
  const reader = stream.getReader()
  let remaining = byteLength

  return new ReadableStream({
    async pull(controller) {
      if (remaining <= 0) {
        reader.cancel()
        controller.close()
        return
      }

      const { done, value } = await reader.read()

      if (done) {
        controller.close()
        return
      }

      if (value.byteLength <= remaining) {
        controller.enqueue(value)
        remaining -= value.byteLength
      } else {
        controller.enqueue(value.subarray(0, remaining))
        remaining = 0
        reader.cancel()
        controller.close()
      }
    },
    cancel() {
      reader.cancel()
    },
  })
}
