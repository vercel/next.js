'use client'

// @ts-ignore
// eslint-disable-next-line import/no-extraneous-dependencies
// import { createFromReadableStream } from 'react-server-dom-webpack/client'
const { createFromReadableStream } = (
  !!process.env.NEXT_RUNTIME
    ? // eslint-disable-next-line import/no-extraneous-dependencies
      (require('react-server-dom-webpack/client.edge') as typeof import('react-server-dom-webpack/client.edge'))
    : // eslint-disable-next-line import/no-extraneous-dependencies
      (require('react-server-dom-webpack/client') as typeof import('react-server-dom-webpack/client'))
) as typeof import('react-server-dom-webpack/client')

import type {
  FlightRouterState,
  NavigationFlightResponse,
} from '../../../server/app-render/types'

import type { NEXT_ROUTER_SEGMENT_PREFETCH_HEADER } from '../app-router-headers'
import {
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_RSC_UNION_QUERY,
  NEXT_URL,
  RSC_HEADER,
  RSC_CONTENT_TYPE_HEADER,
  NEXT_HMR_REFRESH_HEADER,
  NEXT_DID_POSTPONE_HEADER,
  NEXT_ROUTER_STALE_TIME_HEADER,
} from '../app-router-headers'
import { callServer } from '../../app-call-server'
import { findSourceMapURL } from '../../app-find-source-map-url'
import { PrefetchKind } from './router-reducer-types'
import {
  normalizeFlightData,
  type NormalizedFlightData,
} from '../../flight-data-helpers'
import { getAppBuildId } from '../../app-build-id'
import { setCacheBustingSearchParam } from './set-cache-busting-search-param'

export interface FetchServerResponseOptions {
  readonly flightRouterState: FlightRouterState
  readonly nextUrl: string | null
  readonly prefetchKind?: PrefetchKind
  readonly isHmrRefresh?: boolean
}

export type FetchServerResponseResult = {
  flightData: NormalizedFlightData[] | string
  canonicalUrl: URL | undefined
  couldBeIntercepted: boolean
  prerendered: boolean
  postponed: boolean
  staleTime: number
}

export type RequestHeaders = {
  [RSC_HEADER]?: '1'
  [NEXT_ROUTER_STATE_TREE_HEADER]?: string
  [NEXT_URL]?: string
  [NEXT_ROUTER_PREFETCH_HEADER]?: '1'
  [NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]?: string
  'x-deployment-id'?: string
  [NEXT_HMR_REFRESH_HEADER]?: '1'
  // A header that is only added in test mode to assert on fetch priority
  'Next-Test-Fetch-Priority'?: RequestInit['priority']
}

export function urlToUrlWithoutFlightMarker(url: string): URL {
  const urlWithoutFlightParameters = new URL(url, location.origin)
  urlWithoutFlightParameters.searchParams.delete(NEXT_RSC_UNION_QUERY)
  if (process.env.NODE_ENV === 'production') {
    if (
      process.env.__NEXT_CONFIG_OUTPUT === 'export' &&
      urlWithoutFlightParameters.pathname.endsWith('.rsc.txt')
    ) {
      const { pathname } = urlWithoutFlightParameters
      const length = pathname.endsWith('/index.rsc.txt') ? 14 : 8
      // Slice off `/index.rsc.txt` or `.rsc.txt` from the end of the pathname
      urlWithoutFlightParameters.pathname = pathname.slice(0, -length)
    }
  }
  return urlWithoutFlightParameters
}

function doMpaNavigation(url: string): FetchServerResponseResult {
  return {
    flightData: urlToUrlWithoutFlightMarker(url).toString(),
    canonicalUrl: undefined,
    couldBeIntercepted: false,
    prerendered: false,
    postponed: false,
    staleTime: -1,
  }
}

let abortController = new AbortController()

if (typeof window !== 'undefined') {
  // Abort any in-flight requests when the page is unloaded, e.g. due to
  // reloading the page or performing hard navigations. This allows us to ignore
  // what would otherwise be a thrown TypeError when the browser cancels the
  // requests.
  window.addEventListener('pagehide', () => {
    abortController.abort()
  })

  // Use a fresh AbortController instance on pageshow, e.g. when navigating back
  // and the JavaScript execution context is restored by the browser.
  window.addEventListener('pageshow', () => {
    abortController = new AbortController()
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
  const { flightRouterState, nextUrl, prefetchKind } = options

  const headers: RequestHeaders = {
    // Enable flight response
    [RSC_HEADER]: '1',
    // Provide the current router state
    [NEXT_ROUTER_STATE_TREE_HEADER]: encodeURIComponent(
      JSON.stringify(flightRouterState)
    ),
  }

  /**
   * Three cases:
   * - `prefetchKind` is `undefined`, it means it's a normal navigation, so we want to prefetch the page data fully
   * - `prefetchKind` is `full` - we want to prefetch the whole page so same as above
   * - `prefetchKind` is `auto` - if the page is dynamic, prefetch the page data partially, if static prefetch the page data fully
   */
  if (prefetchKind === PrefetchKind.AUTO) {
    headers[NEXT_ROUTER_PREFETCH_HEADER] = '1'
  }

  if (process.env.NODE_ENV === 'development' && options.isHmrRefresh) {
    headers[NEXT_HMR_REFRESH_HEADER] = '1'
  }

  if (nextUrl) {
    headers[NEXT_URL] = nextUrl
  }

  try {
    // When creating a "temporary" prefetch (the "on-demand" prefetch that gets created on navigation, if one doesn't exist)
    // we send the request with a "high" priority as it's in response to a user interaction that could be blocking a transition.
    // Otherwise, all other prefetches are sent with a "low" priority.
    // We use "auto" for in all other cases to match the existing default, as this function is shared outside of prefetching.
    const fetchPriority = prefetchKind
      ? prefetchKind === PrefetchKind.TEMPORARY
        ? 'high'
        : 'low'
      : 'auto'

    if (process.env.NODE_ENV === 'production') {
      if (process.env.__NEXT_CONFIG_OUTPUT === 'export') {
        // In "output: export" mode, we can't rely on headers to distinguish
        // between HTML and RSC requests. Instead, we append an extra prefix
        // to the request.
        url = new URL(url)
        if (url.pathname.endsWith('/')) {
          url.pathname += 'index.rsc.txt'
        } else {
          url.pathname += '.rsc.txt'
        }
      }
    }

    const res = await createFetch(
      url,
      headers,
      fetchPriority,
      abortController.signal
    )

    const responseUrl = urlToUrlWithoutFlightMarker(res.url)
    const canonicalUrl = res.redirected ? responseUrl : undefined

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
    if (process.env.NODE_ENV !== 'production' && !process.env.TURBOPACK) {
      await (
        require('../../dev/hot-reloader/app/hot-reloader-app') as typeof import('../../dev/hot-reloader/app/hot-reloader-app')
      ).waitForWebpackRuntimeHotUpdate()
    }

    // Handle the `fetch` readable stream that can be unwrapped by `React.use`.
    const flightStream = postponed
      ? createUnclosingPrefetchStream(res.body)
      : res.body
    const response = await (createFromNextReadableStream(
      flightStream
    ) as Promise<NavigationFlightResponse>)

    if (getAppBuildId() !== response.b) {
      return doMpaNavigation(res.url)
    }

    return {
      flightData: normalizeFlightData(response.f),
      canonicalUrl: canonicalUrl,
      couldBeIntercepted: interception,
      prerendered: response.S,
      postponed,
      staleTime,
    }
  } catch (err) {
    if (!abortController.signal.aborted) {
      console.error(
        `Failed to fetch RSC payload for ${url}. Falling back to browser navigation.`,
        err
      )
    }

    // If fetch fails handle it like a mpa navigation
    // TODO-APP: Add a test for the case where a CORS request fails, e.g. external url redirect coming from the response.
    // See https://github.com/vercel/next.js/issues/43605#issuecomment-1451617521 for a reproduction.
    return {
      flightData: url.toString(),
      canonicalUrl: undefined,
      couldBeIntercepted: false,
      prerendered: false,
      postponed: false,
      staleTime: -1,
    }
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

  if (process.env.NEXT_DEPLOYMENT_ID) {
    headers['x-deployment-id'] = process.env.NEXT_DEPLOYMENT_ID
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
  let browserResponse = await fetch(fetchUrl, fetchOptions)

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
      fetchUrl = new URL(responseUrl)
      setCacheBustingSearchParam(fetchUrl, headers)
      browserResponse = await fetch(fetchUrl, fetchOptions)
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
  }

  return rscResponse
}

export function createFromNextReadableStream(
  flightStream: ReadableStream<Uint8Array>
): Promise<unknown> {
  return createFromReadableStream(flightStream, {
    callServer,
    findSourceMapURL,
  })
}

function createUnclosingPrefetchStream(
  originalFlightStream: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  // When PPR is enabled, prefetch streams may contain references that never
  // resolve, because that's how we encode dynamic data access. In the decoded
  // object returned by the Flight client, these are reified into hanging
  // promises that suspend during render, which is effectively what we want.
  // The UI resolves when it switches to the dynamic data stream
  // (via useDeferredValue(dynamic, static)).
  //
  // However, the Flight implementation currently errors if the server closes
  // the response before all the references are resolved. As a cheat to work
  // around this, we wrap the original stream in a new stream that never closes,
  // and therefore doesn't error.
  const reader = originalFlightStream.getReader()
  return new ReadableStream({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read()
        if (!done) {
          // Pass to the target stream and keep consuming the Flight response
          // from the server.
          controller.enqueue(value)
          continue
        }
        // The server stream has closed. Exit, but intentionally do not close
        // the target stream.
        return
      }
    },
  })
}
